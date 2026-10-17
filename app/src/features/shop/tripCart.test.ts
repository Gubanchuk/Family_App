import { describe, expect, it } from 'vitest';
import type { DishOffer, Ingredient, ShopTrip, ShoppingItem, ShoppingMark, WeekSlot } from '../../data/db';
import { activeTrips, cartFromPicks, cartRows, pickLabel, type Pick } from './tripCart';

const ing = (item: string, unit: string, dept: string, pantry = false): Ingredient => ({ item, unit, dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
const vocab = new Map([ing('творог', 'г', 'Молочное и яйца'), ing('яйца', 'шт', 'Молочное и яйца'), ing('мука', 'г', 'Бакалея'), ing('соль', 'г', 'Бакалея', true),
  ing('молоко', 'мл', 'Молочное и яйца'), ing('рис', 'г', 'Бакалея'), ing('свёкла', 'г', 'Овощи и фрукты'), ing('овсяные хлопья', 'г', 'Бакалея')].map((v) => [v.item, v]));
const build = {
  servings: new Map([['br-syrniki', 4], ['mn-plov', 4], ['sp-borsch', 8], ['br-kasha', 4]]),
  ingredientsOf: new Map([
    ['br-syrniki', [{ item: 'творог', qty: 500 }, { item: 'яйца', qty: 1 }, { item: 'мука', qty: 60 }, { item: 'соль', qty: 2 }]],
    ['br-kasha', [{ item: 'овсяные хлопья', qty: 200 }, { item: 'молоко', qty: 500 }]],
    ['mn-plov', [{ item: 'рис', qty: 300 }]],
    ['sp-borsch', [{ item: 'свёкла', qty: 400 }]],
  ]),
  vocab, prices: new Map<string, number>(), portions: 3.5,
  isSoup: (id: string) => id.startsWith('sp-'),
};
const WEEK = '2026-10-12';
const slot = (day: number, meal: WeekSlot['meal'], dish_id: string | null): WeekSlot => ({ week_id: 'w', day, meal, dish_id, side_id: null, salad_id: null, simple: null, updated_at: 'x' } as WeekSlot);
// Tuesday 13 Oct is day 1; tomorrow (day 2) has syrniki for breakfast and borsch from Monday's pot for lunch.
const slots = [slot(0, 'lunch', 'sp-borsch'), slot(1, 'lunch', 'sp-borsch'), slot(2, 'lunch', 'sp-borsch'), slot(2, 'breakfast', 'br-syrniki'), slot(2, 'snack', 'br-kasha'), slot(2, 'dinner', 'mn-plov')];
const line = (item: string, a: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: `m:w:${item}`, household_id: 'h1', week_id: 'w', offer_id: null, source: 'menu', item, title: item, qty: null, unit: null, qty_text: '', dept: vocab.get(item)?.dept ?? 'Другое', urgent: false, est_price: null, added_by: null, updated_at: 'x', deleted_at: null, ...a });
const lines = ['творог', 'яйца', 'мука', 'молоко', 'рис', 'свёкла', 'овсяные хлопья'].map((i) => line(i));
const mark = (id: string, a: Partial<ShoppingMark>): ShoppingMark => ({ item_id: id, household_id: 'h1', bought: false, by_member: null, price_real: null, updated_at: 'x', ...a });
const cart = (picks: Pick[], extra: { offers?: DishOffer[]; marks?: Map<string, ShoppingMark> } = {}) =>
  cartFromPicks({ picks, slots, offers: extra.offers ?? [], weekStart: WEEK, build, lines, marks: extra.marks ?? new Map(), dishName: (id) => ({ 'br-syrniki': 'Сырники', 'mn-plov': 'Плов' })[id] ?? id });

describe('trip cart', () => {
  it('breakfast tomorrow takes the week lines of its products', () => {
    const r = cart([{ kind: 'meal', day: 2, meal: 'breakfast' }]);
    expect(r.lines.map((l) => l.id).sort()).toEqual(['m:w:мука', 'm:w:творог', 'm:w:яйца']);
    expect(r.lines.find((l) => l.id === 'm:w:творог')?.hint).toBe('на завтрак: 450 г');
    expect(r.skipped).toEqual([{ item: 'соль', why: 'pantry' }]);
  });

  it('a soup already in the pot needs nothing', () => {
    expect(cart([{ kind: 'meal', day: 2, meal: 'lunch' }]).lines).toEqual([]);
  });

  it('a dish taken instead replaces the menu dish', () => {
    const offer: DishOffer = { id: 'o1', household_id: 'h1', from_member: 'a', to_member: null, dish_id: 'mn-plov', on_date: '2026-10-14', meal: 'breakfast', how: 'instead', status: 'taken', taken_by: 'a', updated_at: 'x', deleted_at: null };
    expect(cart([{ kind: 'meal', day: 2, meal: 'breakfast' }], { offers: [offer] }).lines.map((l) => l.id)).toEqual(['m:w:рис']);
  });

  it('bought, at home and pantry stay out with a reason', () => {
    const marks = new Map([['m:w:творог', mark('m:w:творог', { bought: true })], ['m:w:мука', mark('m:w:мука', { at_home: true })]]);
    const r = cart([{ kind: 'meal', day: 2, meal: 'breakfast' }], { marks });
    expect(r.lines.map((l) => l.id)).toEqual(['m:w:яйца']);
    expect(r.skipped).toEqual(expect.arrayContaining([{ item: 'творог', why: 'bought' }, { item: 'мука', why: 'home' }, { item: 'соль', why: 'pantry' }]));
  });

  it('a product with no line in the list is named as absent', () => {
    const r = cartFromPicks({ picks: [{ kind: 'dish', day: 2, dish_id: 'mn-plov' }], slots, offers: [], weekStart: WEEK, build, lines: [], marks: new Map(), dishName: () => 'Плов' });
    expect(r).toEqual({ lines: [], skipped: [{ item: 'рис', why: 'absent' }] });
  });

  it('two picks add up', () => {
    const r = cart([{ kind: 'meal', day: 2, meal: 'snack' }, { kind: 'dish', day: 3, dish_id: 'br-kasha' }]);
    expect(r.lines.find((l) => l.id === 'm:w:молоко')?.hint).toBe('на выбранное: 900 мл');
    // The same dish of the same day picked twice is cooked once.
    expect(cart([{ kind: 'meal', day: 2, meal: 'snack' }, { kind: 'dish', day: 2, dish_id: 'br-kasha' }]).lines.find((l) => l.id === 'm:w:молоко')?.hint).toBe('на выбранное: 450 мл');
  });

  it('names a single dish in the hint', () => {
    expect(cart([{ kind: 'dish', day: 2, dish_id: 'mn-plov' }]).lines).toEqual([{ id: 'm:w:рис', hint: 'на «Плов»: 300 г' }]);
  });

  it('a day of next week reads its own soup pot', () => {
    // Days run on from this week: 7 is next Monday. Next week's pot starts on Monday, so Monday's lunch buys it.
    const next = [slot(7, 'lunch', 'sp-borsch'), slot(8, 'lunch', 'sp-borsch')];
    const r = cartFromPicks({ picks: [{ kind: 'meal', day: 7, meal: 'lunch' }], slots: next, offers: [], weekStart: WEEK, build, lines, marks: new Map(), dishName: () => '' });
    expect(r.lines.map((l) => l.id)).toEqual(['m:w:свёкла']);
    expect(cartFromPicks({ picks: [{ kind: 'meal', day: 8, meal: 'lunch' }], slots: next, offers: [], weekStart: WEEK, build, lines, marks: new Map(), dishName: () => '' }).lines).toEqual([]);
  });

  it('labels a trip on Sunday for Monday as tomorrow', () => {
    expect(pickLabel([{ kind: 'meal', day: 7, meal: 'breakfast' }], 6, () => '')).toBe('завтрак на завтра');
    expect(pickLabel([{ kind: 'meal', day: 8, meal: 'dinner' }], 6, () => '')).toBe('ужин на вторник');
  });

  it('labels a trip by what it is for', () => {
    const name = (id: string) => (id === 'mn-plov' ? 'Плов' : id);
    expect(pickLabel([{ kind: 'meal', day: 2, meal: 'breakfast' }], 1, name)).toBe('завтрак на завтра');
    expect(pickLabel([{ kind: 'meal', day: 1, meal: 'lunch' }], 1, name)).toBe('обед на сегодня');
    expect(pickLabel([{ kind: 'meal', day: 3, meal: 'dinner' }, { kind: 'dish', day: 3, dish_id: 'mn-plov' }], 1, name)).toBe('ужин на четверг, плов');
  });
});

describe('who is shopping', () => {
  const now = new Date('2026-10-13T10:00:00Z');
  const trip = (id: string, member: string, started: string, a: Partial<ShopTrip> = {}): ShopTrip => ({ id, household_id: 'h1', member_id: member, started_at: started, updated_at: 'x', ...a });

  it('one trip per person, three hours', () => {
    const list = [
      trip('t1', 'papa', '2026-10-13T08:00:00Z'), trip('t2', 'papa', '2026-10-13T09:30:00Z'),
      trip('t3', 'mama', '2026-10-13T06:30:00Z'), trip('t4', 'son', '2026-10-13T09:00:00Z', { ended_at: '2026-10-13T09:40:00Z' }),
      trip('t5', 'baba', '2026-10-13T07:30:00Z'),
    ];
    expect(activeTrips(list, now).map((t) => t.id)).toEqual(['t2', 't5']);
  });

  it('skips cart lines that are gone', () => {
    const t = trip('t', 'papa', '2026-10-13T09:00:00Z', { items: [{ id: 'm:w:творог', hint: 'на завтрак: 450 г' }, { id: 'm:w:нет', hint: null }] });
    const gone = line('яйца', { id: 'm:w:нет', deleted_at: '2026-10-13T09:10:00Z' });
    expect(cartRows(t, [lines[0], gone], new Map())).toEqual([{ item: lines[0], hint: 'на завтрак: 450 г', addedBy: null }]);
  });

  it('takes lines added by others during the trip', () => {
    const t = trip('t', 'papa', '2026-10-13T09:00:00Z', { items: [] });
    const bread = line('хлеб', { id: 'u:1', source: 'manual', item: null, title: 'Хлеб', dept: 'Хлеб', added_by: 'son', created_at: '2026-10-13T09:20:00Z' });
    const before = line('хлеб', { id: 'u:2', source: 'manual', item: null, title: 'Батон', dept: 'Хлеб', added_by: 'son', created_at: '2026-10-13T08:20:00Z' });
    const own = line('хлеб', { id: 'u:3', source: 'manual', item: null, title: 'Сок', dept: 'Другое', added_by: 'papa', created_at: '2026-10-13T09:25:00Z' });
    // The shopper's own line added in the shop is in the cart too, unnamed; one not synced yet counts by its local time.
    const unsynced = line('сок', { id: 'u:4', source: 'manual', item: null, title: 'Вода', dept: 'Другое', added_by: 'papa', updated_at: '2026-10-13T09:30:00Z' });
    expect(cartRows(t, [bread, before, own, unsynced], new Map())).toEqual([
      { item: bread, hint: null, addedBy: 'son' }, { item: own, hint: null, addedBy: null }, { item: unsynced, hint: null, addedBy: null },
    ]);
  });
});
