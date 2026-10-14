import type { LocalDb, Recipe, TemplateSlot, WeekSlot } from '../../data/db';
import type { Meal } from './week';

const recipe = (id: string, name: string, category: string, meals: string[], extra: Partial<Recipe> = {}): Recipe => ({
  id, household_id: null, name, about: '', category, meals, time_active: 10, time_total: 30, servings: 4, keeps_days: 1, protein: 'none',
  tags: ['будни'], season: ['any'], collections: [], dima_level: 'ok', dima_note: '', steps: ['Приготовить.'], source_url: null, source_site: null,
  updated_at: '2026-10-13T00:00:00Z', deleted_at: null, ...extra,
});

export const RECIPES = [
  recipe('br-syrniki', 'Сырники', 'breakfast', ['breakfast']),
  recipe('br-kasha', 'Овсяная каша', 'breakfast', ['breakfast']),
  recipe('sp-borsch', 'Борщ', 'soup', ['lunch'], { dima_level: 'adapt', dima_note: 'отложить до зажарки' }),
  recipe('sp-ukha', 'Уха', 'soup', ['lunch']),
  recipe('sn-yabloki', 'Печёные яблоки', 'snack', ['snack']),
  recipe('mn-kotlety', 'Котлеты', 'main', ['dinner']),
  recipe('mn-plov', 'Плов', 'main', ['dinner']),
  recipe('side-grechka', 'Гречка', 'side', ['dinner']),
];

export function templateDays(id: string, dinner: string, soup: string): TemplateSlot[] {
  const out: TemplateSlot[] = [];
  for (let day = 0; day < 7; day += 1) {
    const add = (meal: Meal, dish_id: string | null) => out.push({ template_id: id, day, meal, dish_id, side_id: meal === 'dinner' ? 'side-grechka' : null, salad_id: null, simple: null, updated_at: '2026-10-13T00:00:00Z' });
    add('breakfast', day % 2 ? 'br-kasha' : 'br-syrniki');
    add('lunch', soup);
    add('snack', 'sn-yabloki');
    add('dinner', dinner);
  }
  return out;
}

export async function seedMenu(db: LocalDb, opts: { currentWeek?: boolean } = {}) {
  await db.recipes.bulkPut(RECIPES);
  await db.week_templates.bulkPut([
    { id: 'autumn', household_id: null, name: 'Осенняя', season: ['autumn'], note: 'Тыква и капуста, пока дешёвые', updated_at: 'x', deleted_at: null },
    { id: 'quick', household_id: null, name: 'Быстрая', season: ['any'], note: 'Ужин за полчаса', updated_at: 'x', deleted_at: null },
  ]);
  await db.template_slots.bulkPut([...templateDays('autumn', 'mn-kotlety', 'sp-borsch'), ...templateDays('quick', 'mn-plov', 'sp-ukha')]);
  if (opts.currentWeek) {
    await db.weeks.put({ id: 'w-cur', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'm-papa', updated_at: 'x', deleted_at: null });
    await db.week_slots.bulkPut(templateDays('autumn', 'mn-kotlety', 'sp-borsch').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'w-cur', household_id: 'h1' })));
  }
}
