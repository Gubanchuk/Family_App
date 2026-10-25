import { describe, expect, it } from 'vitest';
import { formatAmount, hasForms, inputUnit, lineEstimate, measure, nextQty, parseTyped, plural, SHOP_UNITS, sellOf, stepOf, unitPriceLabel } from './units';

describe('shop units', () => {
  it('has Russian forms for every pack word in the file', () => {
    const words = [...new Set(Object.values(SHOP_UNITS).flatMap((s) => (s.sell === 'pack' ? [s.pack] : [])))];
    expect(words.filter((w) => !hasForms(w))).toEqual([]);
  });

  it('says pack words in the right form', () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural('пачка', n))).toEqual(['пачка', 'пачки', 'пачек', 'пачек', 'пачка', 'пачки', 'пачек']);
  });

  it('writes grams under a kilo and kilos from one', () => {
    expect(measure(300, 'г')).toBe('300 г');
    expect(measure(1500, 'г')).toBe('1,5 кг');
    expect(measure(1250, 'мл')).toBe('1,25 л');
  });

  it('counts packs when the amount is whole packs, else writes the weight', () => {
    const pack = { sell: 'pack' as const, size: 200, pack: 'пачка' };
    expect(formatAmount(400, 'г', pack)).toBe('2 пачки · 400 г');
    expect(formatAmount(350, 'г', pack)).toBe('350 г');
    expect(formatAmount(300, 'г', { sell: 'piece', step: 1 }, 100)).toBe('3 шт');
    expect(formatAmount(10, 'шт')).toBe('10 шт');
    expect(formatAmount(2, 'уп')).toBe('2 уп.');
    expect(formatAmount(null, 'г')).toBe('');
  });

  it('steps on the grid and never below one step', () => {
    expect(nextQty(1237, 500, 1)).toBe(1500);
    expect(nextQty(1500, 500, 1)).toBe(2000);
    expect(nextQty(1237, 500, -1)).toBe(1000);
    expect(nextQty(500, 500, -1)).toBe(500);
    expect(nextQty(null, 10, 1)).toBe(10);
  });

  it('takes a pack, a piece weight or the weight step for one press', () => {
    expect(stepOf({ sell: 'pack', size: 900, pack: 'пакет' }, 'мл')).toBe(900);
    expect(stepOf({ sell: 'piece', step: 1 }, 'г', 120)).toBe(120);
    expect(stepOf({ sell: 'piece', step: 10 }, 'шт')).toBe(10);
    expect(stepOf({ sell: 'weight', step: 500 }, 'г')).toBe(500);
  });

  it('falls back to plain units for a product the file does not know', () => {
    expect(sellOf('нет такого', 'г')).toEqual({ sell: 'weight', step: 100 });
    expect(sellOf(null, 'уп')).toEqual({ sell: 'piece', step: 1 });
  });

  it('labels prices per kilo, litre, pack and piece', () => {
    expect(unitPriceLabel(0.045, 'г', { sell: 'weight', step: 500 })).toBe('≈ 45 ₽/кг');
    expect(unitPriceLabel(0.6, 'г', { sell: 'pack', size: 200, pack: 'пачка' })).toBe('≈ 120 ₽/пачка');
    expect(unitPriceLabel(11, 'шт', { sell: 'piece', step: 10 })).toBe('≈ 11 ₽/шт');
    expect(unitPriceLabel(null, 'г', { sell: 'weight', step: 500 })).toBe('');
  });

  it('prices a line and reads typed amounts', () => {
    expect(lineEstimate(1500, 0.045)).toBe(68);
    expect(lineEstimate(1500, null)).toBeNull();
    expect(parseTyped('1,3', 1000)).toBe(1300);
    expect(parseTyped('0', 1000)).toBeNull();
    expect(parseTyped('abc', 1)).toBeNull();
    expect(inputUnit({ sell: 'weight', step: 500 }, 'г')).toEqual({ label: 'кг', factor: 1000, decimals: true });
    expect(inputUnit({ sell: 'pack', size: 200, pack: 'пачка' }, 'г')).toEqual({ label: 'пачек', factor: 200, decimals: false });
  });
});
