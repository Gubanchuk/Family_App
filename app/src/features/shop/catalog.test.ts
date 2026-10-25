import { describe, expect, it } from 'vitest';
import type { Ingredient, ShoppingItem, ShoppingMark } from '../../data/db';
import { buildCatalog, frequent, searchCatalog } from './catalog';

const v = (item: string, unit = 'г', dept = 'Овощи и фрукты'): Ingredient => ({ item, unit, dept, grp: 'veg', piece_weight: null, piece_name: null, pantry: false });
const vocab = new Map([v('помидоры'), v('картофель'), v('молоко', 'мл', 'Молочное и яйца'), v('яйца куриные', 'шт', 'Молочное и яйца')].map((x) => [x.item, x]));
const prices = new Map([['помидоры', 0.25], ['картофель', 0.045]]);
let n = 0;
const line = (p: Partial<ShoppingItem>): ShoppingItem => ({
  id: `u:${(n += 1)}`, household_id: 'h', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Чипсы', qty: null, unit: null, qty_text: '',
  dept: 'Другое', urgent: false, est_price: null, added_by: null, updated_at: `2026-10-2${n}T10:00:00Z`, deleted_at: null, ...p,
});
const bought = (i: ShoppingItem, price_real: number | null = null): [string, ShoppingMark] => [i.id, { item_id: i.id, household_id: 'h', bought: true, by_member: null, price_real, updated_at: '' }];

describe('catalog', () => {
  it('lists dictionary products with their price and unit', () => {
    const c = buildCatalog({ vocab, prices, items: [], marks: new Map() });
    const tomato = c.find((p) => p.item === 'помидоры')!;
    expect(tomato).toMatchObject({ title: 'Помидоры', unit: 'г', price: 0.25, custom: false });
    expect(c.find((p) => p.item === 'яйца куриные')!.unit).toBe('шт');
  });

  it('remembers an own product from its newest line with an amount, price per unit from what was paid', () => {
    const old = line({ title: 'Сыр Ламбер', qty: 300, unit: 'г', est_price: 300, dept: 'Молочное и яйца' });
    const text = line({ title: 'сыр ламбер ', qty_text: 'кусок' });
    const c = buildCatalog({ vocab, prices, items: [old, text], marks: new Map([bought(old, 330)]) });
    const own = c.filter((p) => p.custom);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ title: 'Сыр Ламбер', unit: 'г', dept: 'Молочное и яйца', price: 1.1, uses: 1 });
  });

  it('forgets an own product whose only line was removed, and skips names of the dictionary', () => {
    const gone = line({ title: 'Чипсы', deleted_at: '2026-10-25T00:00:00Z' });
    const milk = line({ title: 'Молоко', qty_text: '2 л' });
    expect(buildCatalog({ vocab, prices, items: [gone, milk], marks: new Map() }).filter((p) => p.custom)).toEqual([]);
  });

  it('finds by start, by word and by stem, most bought first', () => {
    const a = line({ item: 'картофель', title: 'Картофель' });
    const c = buildCatalog({ vocab, prices, items: [a], marks: new Map([bought(a)]) });
    expect(searchCatalog(c, 'карт').map((p) => p.item)).toEqual(['картофель']);
    expect(searchCatalog(c, 'помидор').map((p) => p.item)).toEqual(['помидоры']);
    expect(searchCatalog(c, 'куриные').map((p) => p.item)).toEqual(['яйца куриные']);
    expect(searchCatalog(c, '')).toEqual([]);
    expect(frequent(c).map((p) => p.item)).toEqual(['картофель']);
  });
});
