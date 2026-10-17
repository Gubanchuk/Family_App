import { features, writeLocal } from '../../data/sync';
import type { HomeStock, Ingredient, LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';

// «Дома»: what the family has at home, only «есть» or «закончилось», no amounts.

// One product, however it was typed: the dictionary item, or 't:' and the own name in lower case with single
// spaces and е for ё, so «Хлеб » and «хлеб» are the same thing at home.
export function stockKey(a: { item: string | null; title: string }): string {
  return a.item ?? `t:${a.title.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')}`;
}

// One-off purchases, not supplies: buying them does not put anything «at home».
export const NOT_STOCKED = ['Одежда и обувь', 'Техника'];

const stockOn = async (db: LocalDb) => (await features(db)).has('homeCart');

export async function setStock(db: LocalDb, me: Member, a: { item: string | null; title: string; dept: string }, state: 'have' | 'out') {
  await writeLocal(db, 'home_stock', [{
    household_id: me.household_id, key: stockKey(a), item: a.item, title: a.title.trim(), dept: a.dept, state, by_member: me.id, deleted_at: null,
  }]);
}

export async function removeStock(db: LocalDb, s: HomeStock) {
  await writeLocal(db, 'home_stock', [{ ...s, deleted_at: new Date().toISOString() }]);
}

const stocked = (line: ShoppingItem, vocab: Map<string, Ingredient>) => !NOT_STOCKED.includes(line.dept) && !(line.item && vocab.get(line.item)?.pantry);

// A bought line puts its product at home, added if it was not there or had been removed.
export async function stockFromBought(db: LocalDb, me: Member, line: ShoppingItem, vocab: Map<string, Ingredient>) {
  if (!(await stockOn(db)) || !stocked(line, vocab)) return;
  await setStock(db, me, { item: line.item, title: line.title, dept: line.dept }, 'have');
}

// A line for a product that ran out: one per product for each time it runs out in a week, numbered by the
// ones of that week already bought or removed, so two phones marking it out at once make the same line.
export const homeLineId = (key: string, weekStart: string, n: number) => `h:${weekStart}:${n}:${key}`;

// «Закончилось»: the product goes back on the list. A line closed as «есть дома» opens again; a line still to
// buy is left alone; otherwise a new line appears.
export async function runOut(db: LocalDb, me: Member, s: HomeStock, ctx: { items: ShoppingItem[]; marks: Map<string, ShoppingMark>; weekStart: string }): Promise<'reopened' | 'added' | 'already'> {
  await setStock(db, me, { item: s.item, title: s.title, dept: s.dept }, 'out');
  const mine = ctx.items.filter((i) => !i.deleted_at && stockKey(i) === s.key);
  const home = mine.find((i) => ctx.marks.get(i.id)?.at_home);
  if (home) {
    const m = ctx.marks.get(home.id)!;
    await writeLocal(db, 'shopping_marks', [{ ...withoutStamp(m), at_home: false, by_member: me.id }]);
    return 'reopened';
  }
  if (mine.some((i) => !ctx.marks.get(i.id)?.bought)) return 'already';
  const prefix = `h:${ctx.weekStart}:`;
  const earlier = (await db.shopping_items.where('household_id').equals(me.household_id).toArray())
    .filter((i) => i.id.startsWith(prefix) && i.id.endsWith(`:${s.key}`));
  const marks = await db.shopping_marks.bulkGet(earlier.map((i) => i.id));
  const n = earlier.filter((i, k) => i.deleted_at || marks[k]?.bought).length;
  await writeLocal(db, 'shopping_items', [{
    id: homeLineId(s.key, ctx.weekStart, n), household_id: me.household_id, week_id: null, offer_id: null, source: 'home', item: s.item,
    title: s.title, qty: null, unit: null, qty_text: '', dept: s.dept, urgent: false, est_price: null, added_by: me.id, deleted_at: null,
  }]);
  return 'added';
}

const withoutStamp = (m: ShoppingMark) => { const { updated_at: _u, ...rest } = m; return rest; };

// «Есть дома» on a line closes it without buying (no spending) and puts its product at home. Before the server
// has the column it does nothing and says so.
export async function setAtHome(db: LocalDb, item: ShoppingItem, me: Member, on: boolean, prev?: ShoppingMark): Promise<boolean> {
  if (!(await stockOn(db))) return false;
  await writeLocal(db, 'shopping_marks', [{
    item_id: item.id, household_id: item.household_id, bought: false, by_member: me.id, price_real: prev?.price_real ?? null, at_home: on,
    ...(prev && 'bought_at' in prev ? { bought_at: null } : {}),
  }]);
  if (on && !NOT_STOCKED.includes(item.dept)) await setStock(db, me, { item: item.item, title: item.title, dept: item.dept }, 'have');
  return true;
}
