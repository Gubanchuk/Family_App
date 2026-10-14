// Development-only preview: fills a separate local database from content/ and shows the screens
// without signing in, so layouts can be checked in a browser. Never part of the production bundle.
import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import ingredientsJson from '../../../content/ingredients.json';
import pricesJson from '../../../content/prices.json';
import weeksJson from '../../../content/weeks.json';
import { createLocalDb, type Recipe, type RecipeIngredient, type TemplateSlot, type WeekSlot } from '../data/db';
import type { Member } from '../features/family/useFamily';
import HomePage from '../features/home/HomePage';
import MenuPage from '../features/menu/MenuPage';
import ShopPage from '../features/shop/ShopPage';
import TabBar from '../features/shell/TabBar';
import { mondayOf, addDaysIso, dayOfWeek } from '../features/menu/week';
import { regenerateWeekList } from '../features/shop/menuList';

type Json = Record<string, any>;
const recipeFiles = import.meta.glob('../../../content/recipes/*.json', { eager: true, import: 'default' }) as Record<string, { recipes: Json[] }>;

export const PREVIEW_MEMBERS: Member[] = [
  { id: 'p-papa', household_id: 'p-home', user_id: 'p-u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 },
  { id: 'p-mama', household_id: 'p-home', user_id: 'p-u2', name: 'Мама', color: '#E0457B', role: 'parent', is_owner: false, portion: 1 },
  { id: 'p-son', household_id: 'p-home', user_id: 'p-u3', name: 'Сын', color: '#1FA463', role: 'child', is_owner: false, portion: 1 },
  { id: 'p-dima', household_id: 'p-home', user_id: null, name: 'Дима', color: '#F2A900', role: 'child', is_owner: false, portion: 0.5 },
];
const db = createLocalDb('family-app-preview');

async function seed() {
  const now = '2026-10-13T00:00:00Z';
  const recipes: Recipe[] = []; const rows: RecipeIngredient[] = [];
  for (const file of Object.values(recipeFiles)) {
    for (const r of file.recipes) {
      recipes.push({ id: r.id, household_id: null, name: r.name, about: r.about ?? '', category: r.category, meals: r.meals, time_active: r.time.active, time_total: r.time.total,
        servings: r.servings, keeps_days: r.keepsDays ?? 1, protein: r.protein, tags: r.tags ?? [], season: r.season === 'any' || !r.season ? ['any'] : r.season,
        collections: r.collections ?? [], dima_level: r.dima.level, dima_note: r.dima.note ?? '', steps: r.steps, source_url: r.source?.url ?? null, source_site: r.source?.site ?? null, updated_at: now, deleted_at: null });
      r.ingredients.forEach((i: Json, pos: number) => rows.push({ recipe_id: r.id, pos, item: i.item, qty: i.qty ?? null, to_taste: !!i.toTaste, note: i.note ?? '', optional: !!i.optional }));
    }
  }
  const slots: TemplateSlot[] = [];
  for (const w of weeksJson as Json[]) {
    w.days.forEach((d: Json, day: number) => {
      const lunch = d.lunch ?? {}; const dinner = d.dinner ?? {}; const snack = d.snack;
      const add = (meal: TemplateSlot['meal'], dish: string | null, side: string | null, salad: string | null, simple: TemplateSlot['simple']) =>
        slots.push({ template_id: w.id, day, meal, dish_id: dish, side_id: side, salad_id: salad, simple, updated_at: now });
      add('breakfast', d.breakfast ?? null, null, null, null);
      add('lunch', lunch.soup ?? null, null, lunch.salad ?? null, null);
      add('snack', typeof snack === 'string' ? snack : null, null, null, typeof snack === 'object' ? snack : null);
      add('dinner', dinner.main ?? null, dinner.side ?? null, dinner.salad ?? null, null);
    });
  }
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    await db.recipes.bulkPut(recipes);
    await db.recipe_ingredients.bulkPut(rows);
    await db.ingredients.bulkPut((ingredientsJson as Json[]).map((v) => ({ item: v.item, unit: v.unit, dept: v.dept, grp: v.group, piece_weight: v.pieceWeight ?? null, piece_name: v.pieceName ?? null, pantry: !!v.pantry })));
    await db.prices.bulkPut((pricesJson as Json).prices.map((p: Json) => ({ item: p.item, price_per_unit: p.pricePerUnit, source: p.source, note: p.note ?? null, collected: (pricesJson as Json).collected })));
    await db.week_templates.bulkPut((weeksJson as Json[]).map((w) => ({ id: w.id, household_id: null, name: w.name, season: w.season === 'any' || !w.season ? ['any'] : w.season, note: w.note ?? '', updated_at: now, deleted_at: null })));
    await db.template_slots.bulkPut(slots);
    const start = mondayOf(new Date());
    await db.weeks.put({ id: 'p-week', household_id: 'p-home', starts_on: start, template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'p-papa', updated_at: now, deleted_at: null });
    await db.week_slots.bulkPut(slots.filter((s) => s.template_id === 'autumn').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'p-week', household_id: 'p-home' })));
    await db.weeks.put({ id: 'p-next', household_id: 'p-home', starts_on: addDaysIso(start, 7), template_id: 'quick', status: 'proposed', proposed_by: 'p-son', approved_by: null, updated_at: now, deleted_at: null });
    await db.week_slots.bulkPut(slots.filter((s) => s.template_id === 'quick').map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'p-next', household_id: 'p-home' })));
    await db.votes.put({ week_id: 'p-next', member_id: 'p-son', household_id: 'p-home', value: 'yes', comment: '', updated_at: now });
    const today = addDaysIso(start, dayOfWeek(new Date()));
    await db.dish_offers.put({ id: 'p-offer', household_id: 'p-home', from_member: 'p-mama', to_member: 'p-papa', dish_id: 'ex-shakshuka', on_date: today, meal: 'dinner', how: 'over', status: 'open', taken_by: null, updated_at: now, deleted_at: null });
    await db.shopping_items.put({ id: 'u:p-milk', household_id: 'p-home', week_id: null, offer_id: null, source: 'manual', item: 'молоко', title: 'Молоко', qty: null, unit: null, qty_text: '2 л', dept: 'Молочное и яйца', urgent: true, est_price: null, added_by: 'p-mama', updated_at: now, deleted_at: null });
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    await db.meta.put({ key: 'content_loaded_at', value: new Date().toISOString() });
  });
  await regenerateWeekList(db, 'p-week');
  await db.outbox.clear();
}

export default function Preview() {
  const [ready, setReady] = useState(false);
  const [asChild, setChild] = useState(false);
  useEffect(() => { seed().then(() => setReady(true)); }, []);
  useEffect(() => { setChild(new URLSearchParams(location.search).get('as') === 'son'); }, []);
  if (!ready) return <p className="note" style={{ margin: 16 }}>Готовим превью…</p>;
  const me = asChild ? PREVIEW_MEMBERS[2] : PREVIEW_MEMBERS[0];
  return (
    <>
      <div className="screen">
        <Routes>
          <Route path="/dev" element={<HomePage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/menu" element={<MenuPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
          <Route path="/dev/shop" element={<ShopPage me={me} members={PREVIEW_MEMBERS} db={db} />} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </>
  );
}
