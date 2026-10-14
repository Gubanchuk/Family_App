import { writeLocal } from '../../data/sync';
import type { Ingredient, LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { capitalize } from './menuList';

export async function setBought(db: LocalDb, item: ShoppingItem, me: Member, bought: boolean, prev?: ShoppingMark) {
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought, by_member: me.id, price_real: prev?.price_real ?? null }]);
}

export async function setRealPrice(db: LocalDb, item: ShoppingItem, me: Member, price: number | null, prev?: ShoppingMark) {
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought: prev?.bought ?? true, by_member: prev?.by_member ?? me.id, price_real: price }]);
}

// A hand-typed line goes to the department a shopper expects: «хлеб» to Хлеб, «сыр» to dairy.
// Only an exact match links the line to the product itself; a near one just picks the department.
export function guessIngredient(title: string, vocab: Map<string, Ingredient>): { exact: boolean; dept: string; item: string | null } | null {
  const t = title.trim().toLowerCase();
  const hit = vocab.get(t);
  if (hit) return { exact: true, dept: hit.dept, item: hit.item };
  const first = t.split(/\s+/)[0];
  // «помидор» finds «помидоры», «яблоко» finds «яблоки».
  const stem = first.length > 4 ? first.slice(0, -1) : first;
  const all = [...vocab.values()];
  const near = all.find((v) => v.item.startsWith(`${t} `))
    ?? all.find((v) => { const head = v.item.split(' ')[0]; return head === first || (stem.length >= 4 && head.startsWith(stem)); });
  return near ? { exact: false, dept: near.dept, item: null } : null;
}

export async function addManualItem(db: LocalDb, me: Member, a: { title: string; qtyText: string; urgent: boolean; vocab: Map<string, Ingredient> }): Promise<string> {
  const title = a.title.trim();
  const g = guessIngredient(title, a.vocab);
  const dept = g?.dept ?? 'Другое';
  await writeLocal(db, 'shopping_items', [{
    id: `u:${crypto.randomUUID()}`, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual',
    item: g?.item ?? null, title: capitalize(title), qty: null, unit: null, qty_text: a.qtyText.trim(), dept,
    urgent: a.urgent, est_price: null, added_by: me.id, deleted_at: null,
  }]);
  return dept;
}

export async function removeItem(db: LocalDb, item: ShoppingItem) {
  await writeLocal(db, 'shopping_items', [{ ...item, deleted_at: new Date().toISOString() }]);
}

export async function goShopping(db: LocalDb, me: Member, at = new Date()) {
  await writeLocal(db, 'shop_trips', [{ id: crypto.randomUUID(), household_id: me.household_id, member_id: me.id, started_at: at.toISOString() }]);
}
