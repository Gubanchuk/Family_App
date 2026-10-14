import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../data/db';
import { buildMenuList, formatQty, listTotals, rub, type SlotIn } from './build';

const v = (item: string, unit: string, dept: string, pantry = false): Ingredient => ({ item, unit, dept, grp: 'x', piece_weight: null, piece_name: null, pantry });
const vocab = new Map([
  v('творог', 'г', 'Молочное и яйца'), v('яйца', 'шт', 'Молочное и яйца'), v('мука', 'г', 'Бакалея', true),
  v('свёкла', 'г', 'Овощи и фрукты'), v('фарш', 'г', 'Мясо и птица'), v('гречка', 'г', 'Бакалея'), v('кефир', 'мл', 'Молочное и яйца'), v('зелень', 'г', 'Овощи и фрукты'),
].map((x) => [x.item, x]));
const servings = new Map([['syr', 4], ['borsch', 8], ['kotl', 4], ['grech', 4]]);
const ingredientsOf = new Map([
  ['syr', [{ item: 'творог', qty: 500 }, { item: 'яйца', qty: 1 }, { item: 'мука', qty: 60 }]],
  ['borsch', [{ item: 'свёкла', qty: 400 }, { item: 'зелень', qty: null }]],
  ['kotl', [{ item: 'фарш', qty: 600 }, { item: 'яйца', qty: 1 }]],
  ['grech', [{ item: 'гречка', qty: 250 }]],
]);
const prices = new Map([['творог', 0.6], ['яйца', 12], ['свёкла', 0.04], ['фарш', 0.5], ['гречка', 0.1]]);
const slot = (day: number, meal: SlotIn['meal'], dish: string | null, side: string | null = null, simple: SlotIn['simple'] = null): SlotIn => ({ day, meal, dish_id: dish, side_id: side, salad_id: null, simple });
const build = (slots: SlotIn[], portions = 3.5) => buildMenuList({ slots, servings, ingredientsOf, vocab, prices, portions });
const line = (lines: ReturnType<typeof build>, item: string) => lines.find((l) => l.item === item);

describe('buildMenuList', () => {
  it('scales every dish to the family portions', () => {
    const l = build([slot(0, 'breakfast', 'syr'), slot(1, 'breakfast', 'syr')]);
    expect(line(l, 'творог')?.qty).toBeCloseTo(500 * (3.5 / 4) * 2);
    expect(line(l, 'яйца')?.qty).toBeCloseTo(1.75);
  });

  it('counts a soup once per pot of consecutive days and again after a break', () => {
    const l = build([slot(0, 'lunch', 'borsch'), slot(1, 'lunch', 'borsch'), slot(2, 'lunch', 'borsch'), slot(4, 'lunch', 'borsch')]);
    expect(line(l, 'свёкла')?.qty).toBe(800);
  });

  it('leaves out what is always at home and keeps to-taste items without a number', () => {
    const l = build([slot(0, 'breakfast', 'syr'), slot(0, 'lunch', 'borsch')]);
    expect(line(l, 'мука')).toBeUndefined();
    expect(line(l, 'зелень')).toEqual({ item: 'зелень', qty: null, unit: 'г', dept: 'Овощи и фрукты', est: null });
  });

  it('adds sides and simple snacks per person', () => {
    const l = build([slot(0, 'dinner', 'kotl', 'grech'), slot(0, 'snack', null, null, { simple: 'Кефир', items: [{ item: 'кефир', qty: 200 }] })]);
    expect(line(l, 'гречка')?.qty).toBeCloseTo(250 * 0.875);
    expect(line(l, 'кефир')?.qty).toBe(700);
    expect(line(l, 'кефир')?.est).toBeNull();
  });

  it('prices lines and sorts them in store order', () => {
    const l = build([slot(0, 'dinner', 'kotl', 'grech'), slot(0, 'breakfast', 'syr')]);
    expect(line(l, 'фарш')?.est).toBeCloseTo(600 * 0.875 * 0.5);
    expect(l.map((x) => x.dept)).toEqual(['Молочное и яйца', 'Молочное и яйца', 'Мясо и птица', 'Бакалея']);
  });
});

describe('formatQty and money', () => {
  it('rounds weights up for the shop', () => {
    expect(formatQty(1750, 'г')).toBe('1,8 кг');
    expect(formatQty(975, 'г')).toBe('1 кг');
    expect(formatQty(410, 'г')).toBe('450 г');
    expect(formatQty(20, 'г')).toBe('50 г');
    expect(formatQty(1500, 'мл')).toBe('1,5 л');
    expect(formatQty(9.625, 'шт')).toBe('10 шт');
    expect(formatQty(null, 'г')).toBe('по вкусу');
  });
  it('formats rubles', () => {
    expect(rub(1050.4).replace(/\s/g, ' ')).toBe('1 050 ₽');
  });
  it('totals bought and left, counting items without a price', () => {
    expect(listTotals([
      { est: 100, real: 120, bought: true }, { est: 50, real: null, bought: true },
      { est: 300, real: null, bought: false }, { est: null, real: null, bought: false },
    ])).toEqual({ count: 4, doneCount: 2, bought: 170, left: 300, unpriced: 1 });
  });
});
