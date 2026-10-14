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

export async function addManualItem(db: LocalDb, me: Member, a: { title: string; qtyText: string; urgent: boolean; vocab: Map<string, Ingredient> }) {
  const title = a.title.trim();
  const v = a.vocab.get(title.toLowerCase());
  await writeLocal(db, 'shopping_items', [{
    id: `u:${crypto.randomUUID()}`, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual',
    item: v ? v.item : null, title: capitalize(title), qty: null, unit: null, qty_text: a.qtyText.trim(), dept: v?.dept ?? 'Другое',
    urgent: a.urgent, est_price: null, added_by: me.id, deleted_at: null,
  }]);
}

export async function removeItem(db: LocalDb, item: ShoppingItem) {
  await writeLocal(db, 'shopping_items', [{ ...item, deleted_at: new Date().toISOString() }]);
}

export async function goShopping(db: LocalDb, me: Member, at = new Date()) {
  await writeLocal(db, 'shop_trips', [{ id: crypto.randomUUID(), household_id: me.household_id, member_id: me.id, started_at: at.toISOString() }]);
}
