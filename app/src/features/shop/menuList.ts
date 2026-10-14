import { writeLocal } from '../../data/sync';
import type { LocalDb, ShoppingItem } from '../../data/db';
import { buildMenuList, formatQty } from './build';

export const menuItemId = (weekId: string, item: string) => `m:${weekId}:${item}`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const SAME: Array<keyof ShoppingItem> = ['title', 'qty', 'unit', 'qty_text', 'dept', 'est_price', 'deleted_at'];

// Rebuilds the menu part of an approved week's list. Bought lines stay as they are;
// if any dish of the week is missing on this phone, nothing is written.
export async function regenerateWeekList(db: LocalDb, weekId: string): Promise<'done' | 'skipped'> {
  const week = await db.weeks.get(weekId);
  if (!week || week.status !== 'approved' || week.deleted_at) return 'skipped';
  const slots = await db.week_slots.where('week_id').equals(weekId).toArray();
  const ids = [...new Set(slots.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]).filter((x): x is string => !!x))];
  const recipes = await db.recipes.bulkGet(ids);
  if (recipes.some((r) => !r)) return 'skipped';
  const rows = await db.recipe_ingredients.where('recipe_id').anyOf(ids).toArray();
  const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
  for (const r of rows) ingredientsOf.set(r.recipe_id, [...(ingredientsOf.get(r.recipe_id) ?? []), { item: r.item, qty: r.qty === null ? null : Number(r.qty) }]);
  const lines = buildMenuList({
    slots,
    servings: new Map(recipes.map((r) => [r!.id, r!.servings])),
    ingredientsOf,
    vocab: new Map((await db.ingredients.toArray()).map((v) => [v.item, v])),
    prices: new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)])),
    portions: Number((await db.meta.get('family_portions'))?.value ?? 3.5),
  });

  const existing = new Map((await db.shopping_items.where('week_id').equals(weekId).toArray()).filter((i) => i.source === 'menu').map((i) => [i.id, i]));
  const marks = await db.shopping_marks.bulkGet([...existing.keys()]);
  const bought = new Set(marks.filter((m) => m?.bought).map((m) => m!.item_id));
  const out: ShoppingItem[] = [];
  const wanted = new Set<string>();
  for (const l of lines) {
    const id = menuItemId(weekId, l.item);
    wanted.add(id);
    if (bought.has(id)) continue;
    const next: ShoppingItem = {
      id, household_id: week.household_id, week_id: weekId, offer_id: null, source: 'menu', item: l.item, title: capitalize(l.item),
      qty: round1(l.qty), unit: l.unit, qty_text: formatQty(l.qty, l.unit), dept: l.dept, urgent: false,
      est_price: l.est === null ? null : Math.round(l.est), added_by: null, updated_at: '', deleted_at: null,
    };
    const prev = existing.get(id);
    if (!prev || SAME.some((k) => prev[k] !== next[k])) out.push(next);
  }
  const now = new Date().toISOString();
  for (const [id, prev] of existing) if (!wanted.has(id) && !bought.has(id) && !prev.deleted_at) out.push({ ...prev, deleted_at: now });
  if (out.length) await writeLocal(db, 'shopping_items', out);
  return 'done';
}
