import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type Ingredient, type LocalDb, type ShoppingItem, type ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { setBought, setRealPrice } from './shopActions';
import { homeLineId, runOut, setAtHome, setStock, stockKey } from './stock';

const mama: Member = { id: 'm-mama', household_id: 'h1', user_id: 'u2', name: 'Мама', color: '#E0457B', role: 'parent', is_owner: false, portion: 1 };
const ing = (item: string, dept: string, pantry = false): Ingredient => ({ item, unit: 'г', dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
const vocab = new Map([ing('молоко', 'Молочное и яйца'), ing('соль', 'Бакалея', true)].map((v) => [v.item, v]));
const WEEK = '2026-10-12';
const line = (id: string, a: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Хлеб', qty: null, unit: null, qty_text: '', dept: 'Хлеб', urgent: false, est_price: null, added_by: 'm-mama', updated_at: 'x', deleted_at: null, ...a });
const milkLine = line('m:w:молоко', { source: 'menu', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', week_id: 'w' });

async function fresh(withColumn = true): Promise<LocalDb> {
  const db = createLocalDb(`t-${Math.random()}`);
  if (withColumn) await db.meta.put({ key: 'features', value: ['homeCart'] });
  return db;
}
const stock = (db: LocalDb, key: string) => db.home_stock.get(['h1', key]);
const outboxRows = async (db: LocalDb, table: string) => (await db.outbox.toArray()).filter((o) => o.table === table).map((o) => o.row);

describe('home stock', () => {
  it('one product whatever the case and spaces', () => {
    expect(stockKey({ item: null, title: ' Хлеб  бородинский ' })).toBe(stockKey({ item: null, title: 'хлеб Бородинский' }));
    expect(stockKey({ item: null, title: 'Ёлка' })).toBe('t:елка');
    expect(stockKey({ item: 'молоко', title: 'Молоко 3,2%' })).toBe('молоко');
  });

  it('bought food goes home, clothes and staples do not', async () => {
    const db = await fresh();
    await setBought(db, milkLine, mama, true, undefined, { vocab });
    expect(await stock(db, 'молоко')).toMatchObject({ state: 'have', title: 'Молоко', dept: 'Молочное и яйца', by_member: 'm-mama' });
    await setBought(db, line('u:1', { title: 'Носки', dept: 'Одежда и обувь' }), mama, true, undefined, { vocab });
    await setBought(db, line('m:w:соль', { source: 'menu', item: 'соль', title: 'Соль', dept: 'Бакалея' }), mama, true, undefined, { vocab });
    expect(await db.home_stock.count()).toBe(1);
  });

  it('out reopens a line kept as at home', async () => {
    const db = await fresh();
    const mark: ShoppingMark = { item_id: milkLine.id, household_id: 'h1', bought: false, by_member: 'm-mama', price_real: null, at_home: true, updated_at: 'x' };
    await db.shopping_marks.put(mark);
    await setStock(db, mama, { item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' }, 'have');
    const s = (await stock(db, 'молоко'))!;
    expect(await runOut(db, mama, s, { items: [milkLine], marks: new Map([[milkLine.id, mark]]), weekStart: WEEK })).toBe('reopened');
    expect(await db.shopping_marks.get(milkLine.id)).toMatchObject({ at_home: false, bought: false });
    expect(await db.shopping_items.count()).toBe(0);
    expect((await stock(db, 'молоко'))?.state).toBe('out');
  });

  it('out adds one line when the list has none', async () => {
    const db = await fresh();
    await setStock(db, mama, { item: null, title: 'Хлеб бородинский', dept: 'Хлеб' }, 'have');
    const s = (await stock(db, 't:хлеб бородинский'))!;
    expect(await runOut(db, mama, s, { items: [], marks: new Map(), weekStart: WEEK })).toBe('added');
    const [added] = await db.shopping_items.toArray();
    expect(added).toMatchObject({ id: homeLineId('t:хлеб бородинский', WEEK, 0, 'h1'), source: 'home', title: 'Хлеб бородинский', dept: 'Хлеб', item: null, added_by: 'm-mama' });
  });

  it('out does nothing when the line is still to buy', async () => {
    const db = await fresh();
    await setStock(db, mama, { item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' }, 'have');
    expect(await runOut(db, mama, (await stock(db, 'молоко'))!, { items: [milkLine], marks: new Map(), weekStart: WEEK })).toBe('already');
    expect(await db.shopping_items.count()).toBe(0);
  });

  it('two phones marking one product out make one line', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const db = await fresh();
      await setStock(db, mama, { item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' }, 'have');
      await runOut(db, mama, (await stock(db, 'молоко'))!, { items: [], marks: new Map(), weekStart: WEEK });
      ids.push((await db.shopping_items.toArray())[0].id);
    }
    expect(ids[0]).toBe(ids[1]);
  });

  it('a product bought this week and out again gets a new line', async () => {
    const db = await fresh();
    const first = line(homeLineId('молоко', WEEK, 0, 'h1'), { source: 'home', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' });
    const bought: ShoppingMark = { item_id: first.id, household_id: 'h1', bought: true, by_member: 'm-mama', price_real: null, updated_at: 'x' };
    await db.shopping_items.put(first);
    await db.shopping_marks.put(bought);
    await setStock(db, mama, { item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца' }, 'have');
    expect(await runOut(db, mama, (await stock(db, 'молоко'))!, { items: [first], marks: new Map([[first.id, bought]]), weekStart: WEEK })).toBe('added');
    expect((await db.shopping_items.toArray()).map((i) => i.id).sort()).toEqual([first.id, homeLineId('молоко', WEEK, 1, 'h1')].sort());
  });

  it('closes a line as at home and puts its product home', async () => {
    const db = await fresh();
    expect(await setAtHome(db, milkLine, mama, true)).toBe(true);
    expect(await db.shopping_marks.get(milkLine.id)).toMatchObject({ bought: false, at_home: true });
    expect((await stock(db, 'молоко'))?.state).toBe('have');
  });

  it('a price keeps the line at home', async () => {
    const db = await fresh();
    await setAtHome(db, milkLine, mama, true);
    await setRealPrice(db, milkLine, mama, 90, await db.shopping_marks.get(milkLine.id));
    expect(await db.shopping_marks.get(milkLine.id)).toMatchObject({ at_home: true, bought: false, price_real: 90 });
  });

  it('buying a line kept as at home opens it as bought', async () => {
    const db = await fresh();
    await setAtHome(db, milkLine, mama, true);
    await setBought(db, milkLine, mama, true, await db.shopping_marks.get(milkLine.id), { vocab });
    expect(await db.shopping_marks.get(milkLine.id)).toMatchObject({ at_home: false, bought: true });
  });

  it('does not send at_home before the server has it', async () => {
    const db = await fresh(false);
    expect(await setAtHome(db, milkLine, mama, true)).toBe(false);
    expect(await db.outbox.count()).toBe(0);
    await setBought(db, milkLine, mama, true, { item_id: milkLine.id, household_id: 'h1', bought: false, by_member: null, price_real: null, updated_at: 'x' }, { vocab });
    expect((await outboxRows(db, 'shopping_marks'))[0]).not.toHaveProperty('at_home');
    expect(await outboxRows(db, 'home_stock')).toEqual([]);
  });
});
