import type { Ingredient, LocalDb, Price, Recipe, RecipeIngredient, TemplateSlot, WeekSlot } from '../../data/db';
import type { Meal } from './week';

const recipe = (id: string, name: string, category: string, meals: string[], extra: Partial<Recipe> = {}): Recipe => ({
  id, household_id: null, name, about: '', category, meals, time_active: 10, time_total: 30, servings: 4, keeps_days: 1, protein: 'none',
  tags: ['будни'], season: ['any'], collections: [], dima_level: 'ok', dima_note: '', steps: ['Приготовить.'], source_url: null, source_site: null,
  updated_at: '2026-10-13T00:00:00Z', deleted_at: null, ...extra,
});

export const RECIPES = [
  recipe('br-syrniki', 'Сырники', 'breakfast', ['breakfast'], { collections: ['weekend'] }),
  recipe('br-kasha', 'Овсяная каша', 'breakfast', ['breakfast']),
  recipe('sp-borsch', 'Борщ', 'soup', ['lunch'], { servings: 8, dima_level: 'adapt', dima_note: 'отложить до зажарки' }),
  recipe('sp-ukha', 'Уха', 'soup', ['lunch'], { servings: 6 }),
  recipe('sn-yabloki', 'Печёные яблоки', 'snack', ['snack'], { collections: ['sweet'] }),
  recipe('mn-kotlety', 'Котлеты', 'main', ['dinner']),
  recipe('mn-plov', 'Плов', 'main', ['dinner']),
  recipe('side-grechka', 'Гречка', 'side', ['dinner']),
];

const ing = (item: string, unit: string, dept: string, pantry = false): Ingredient => ({ item, unit, dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
export const INGREDIENTS: Ingredient[] = [
  ing('творог', 'г', 'Молочное и яйца'), ing('яйца', 'шт', 'Молочное и яйца'), ing('мука', 'г', 'Бакалея', true),
  ing('овсяные хлопья', 'г', 'Бакалея'), ing('свёкла', 'г', 'Овощи и фрукты'), ing('капуста', 'г', 'Овощи и фрукты'),
  ing('картофель', 'г', 'Овощи и фрукты'), ing('минтай', 'г', 'Рыба'), ing('яблоки', 'г', 'Овощи и фрукты'),
  ing('фарш', 'г', 'Мясо и птица'), ing('рис', 'г', 'Бакалея'), ing('гречка', 'г', 'Бакалея'),
];
const price = (item: string, p: number): Price => ({ item, price_per_unit: p, source: 'тест', note: null, collected: '2026-10-13' });
export const PRICES: Price[] = [
  price('творог', 0.6), price('яйца', 12), price('овсяные хлопья', 0.1), price('свёкла', 0.04), price('капуста', 0.03),
  price('картофель', 0.035), price('минтай', 0.4), price('фарш', 0.5), price('рис', 0.12), price('гречка', 0.1),
];
const ri = (recipe_id: string, rows: Array<[string, number | null]>): RecipeIngredient[] =>
  rows.map(([item, qty], pos) => ({ recipe_id, pos, item, qty, to_taste: qty === null, note: '', optional: false }));
export const RECIPE_INGREDIENTS: RecipeIngredient[] = [
  ...ri('br-syrniki', [['творог', 500], ['яйца', 1], ['мука', 60]]),
  ...ri('br-kasha', [['овсяные хлопья', 200]]),
  ...ri('sp-borsch', [['свёкла', 400], ['капуста', 300], ['картофель', 400]]),
  ...ri('sp-ukha', [['минтай', 500], ['картофель', 300]]),
  ...ri('sn-yabloki', [['яблоки', 600]]),
  ...ri('mn-kotlety', [['фарш', 600], ['яйца', 1]]),
  ...ri('mn-plov', [['рис', 300], ['фарш', 400]]),
  ...ri('side-grechka', [['гречка', 250]]),
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
  await db.ingredients.bulkPut(INGREDIENTS);
  await db.prices.bulkPut(PRICES);
  await db.recipe_ingredients.bulkPut(RECIPE_INGREDIENTS);
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
