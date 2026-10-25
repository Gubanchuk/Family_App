import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type LocalDb, type ShopTrip, type ShoppingItem, type ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Product } from './catalog';
import { addProductLine, endSummary, pullToTrip, setInTrip, tripLines, tripTotals, updateLine } from './tripActions';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const potato: Product = { key: 'картофель', title: 'Картофель', item: 'картофель', unit: 'г', dept: 'Овощи и фрукты', price: 0.045, sell: { sell: 'weight', step: 500 }, pieceWeight: 120, custom: false, uses: 0 };
const curd: Product = { key: 'творог 5%', title: 'Творог 5%', item: 'творог 5%', unit: 'г', dept: 'Молочное и яйца', price: 0.6, sell: { sell: 'pack', size: 200, pack: 'пачка' }, pieceWeight: null, custom: false, uses: 0 };
const line = (id: string, a: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Хлеб', qty: null, unit: null, qty_text: '', dept: 'Хлеб', urgent: false, est_price: null, added_by: 'm-papa', updated_at: '2026-10-25T08:00:00Z', deleted_at: null, ...a });
const mark = (id: string, a: Partial<ShoppingMark> = {}): [string, ShoppingMark] => [id, { item_id: id, household_id: 'h1', bought: false, by_member: null, price_real: null, updated_at: '2026-10-25T08:00:00Z', ...a }];

async function fresh(withColumn = true): Promise<LocalDb> {
  const db = createLocalDb(`t-${Math.random()}`);
  if (withColumn) await db.meta.put({ key: 'features', value: ['homeCart', 'tripList'] });
  return db;
}
const outboxRows = async (db: LocalDb) => (await db.outbox.toArray()).filter((o) => o.table === 'shopping_items').map((o) => o.row as Partial<ShoppingItem>);

describe('trip actions', () => {
  it('adds a product with its amount, text and estimate, in the trip', async () => {
    const db = await fresh();
    const r = await addProductLine(db, papa, { product: curd, title: curd.title, qty: 400, unit: 'г', pricePerUnit: 0.6, dept: curd.dept, inTrip: true });
    const row = await db.shopping_items.get(r.id);
    expect(row).toMatchObject({ item: 'творог 5%', qty: 400, unit: 'г', qty_text: '2 пачки · 400 г', est_price: 240, in_trip: true, source: 'manual' });
  });

  it('adds to the open line of the same product instead of a second one', async () => {
    const db = await fresh();
    const a = await addProductLine(db, papa, { product: potato, title: 'Картофель', qty: 1000, unit: 'г', pricePerUnit: 0.045, dept: potato.dept, inTrip: true });
    const b = await addProductLine(db, papa, { product: potato, title: 'Картофель', qty: 500, unit: 'г', pricePerUnit: 0.045, dept: potato.dept, inTrip: true });
    expect(b).toEqual({ id: a.id, merged: true });
    expect(await db.shopping_items.get(a.id)).toMatchObject({ qty: 1500, qty_text: '1,5 кг', est_price: 68 });
    expect(await db.shopping_items.count()).toBe(1);
  });

  it('sends no trip mark before the server has the column', async () => {
    const db = await fresh(false);
    await addProductLine(db, papa, { product: potato, title: 'Картофель', qty: 500, unit: 'г', pricePerUnit: 0.045, dept: potato.dept, inTrip: true });
    expect((await outboxRows(db)).every((r) => !('in_trip' in r))).toBe(true);
    await setInTrip(db, [line('u:1')], true);
    expect(await db.outbox.count()).toBe(1);
  });

  it('puts a line typed while someone is in the shop straight into the trip', async () => {
    const db = await fresh();
    await db.shop_trips.put({ id: 't1', household_id: 'h1', member_id: 'm-mama', started_at: new Date(Date.now() - 600_000).toISOString(), updated_at: '' } as ShopTrip);
    const r = await addProductLine(db, papa, { product: null, title: 'чипсы', qty: 1, unit: 'уп', pricePerUnit: 120, dept: 'Другое', inTrip: false });
    expect(await db.shopping_items.get(r.id)).toMatchObject({ title: 'Чипсы', in_trip: true, est_price: 120, qty_text: '1 уп.' });
  });

  it('rounds list lines up to what the shop sells when they join the trip', async () => {
    const db = await fresh();
    const menu = line('m:w:картофель', { source: 'menu', item: 'картофель', title: 'Картофель', qty: 1237.5, unit: 'г', est_price: 56, week_id: 'w' });
    await db.shopping_items.put(menu);
    await pullToTrip(db, [menu], [potato]);
    expect(await db.shopping_items.get(menu.id)).toMatchObject({ in_trip: true, qty: 1500, qty_text: '1,5 кг', est_price: 68 });
  });

  it('saves a new amount and a typed price in one write without losing either', async () => {
    const db = await fresh();
    const l = line('u:2', { item: 'картофель', title: 'Картофель', qty: 1000, unit: 'г', est_price: 45, in_trip: true });
    await db.shopping_items.put(l);
    await updateLine(db, l, { qty: 2000, est: 150 }, potato);
    expect(await db.shopping_items.get('u:2')).toMatchObject({ qty: 2000, qty_text: '2 кг', est_price: 150 });
  });

  it('counts what is in the cart and what is left, unpriced lines apart', () => {
    const ls = [line('a', { in_trip: true, est_price: 100 }), line('b', { in_trip: true, est_price: 50 }), line('c', { in_trip: true }), line('d', { in_trip: true, est_price: 30 })];
    const marks = new Map([mark('a', { bought: true, price_real: 120 }), mark('d', { at_home: true })]);
    expect(tripTotals(ls, marks)).toEqual({ count: 3, total: 170, inCart: { count: 1, sum: 120 }, left: { count: 2, sum: 50 }, unpriced: 1 });
    expect(endSummary(ls, marks)).toEqual({ count: 1, sum: 120, left: ['Хлеб', 'Хлеб'] });
  });

  it('shows the open trip lines before the shop and keeps lines bought during the trip in view', () => {
    const trip = { id: 't', household_id: 'h1', member_id: 'm-papa', started_at: '2026-10-25T09:00:00Z', updated_at: '' } as ShopTrip;
    const ls = [line('open', { in_trip: true }), line('old', { in_trip: true }), line('now', { in_trip: true }), line('list')];
    const marks = new Map([mark('old', { bought: true, bought_at: '2026-10-24T09:00:00Z' }), mark('now', { bought: true, bought_at: '2026-10-25T09:30:00Z' })]);
    expect(tripLines(ls, marks).map((l) => l.id)).toEqual(['open']);
    expect(tripLines(ls, marks, trip).map((l) => l.id)).toEqual(['open', 'now']);
  });
});
