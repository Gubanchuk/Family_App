import { describe, expect, it } from 'vitest';
import { memberName, nextStep, progress, stepsDone, twinOf } from './boardMath';
import type { Goal } from './types';

const goal = (steps: Array<[string, boolean]>): Goal => ({ id: 'g', household_id: 'h', owner_id: null, title: 'Море', target: 120000, saved: 40000, steps: steps.map(([t, done], i) => ({ id: String(i), t, done })), created_by: null, updated_at: '', deleted_at: null });

describe('board maths', () => {
  it('measures a piggy bank and never runs past full', () => {
    expect(progress(40000, 120000)).toBeCloseTo(1 / 3);
    expect(progress(130000, 120000)).toBe(1);
    expect(progress(0, null)).toBe(0);
  });
  it('names the next undone step and counts the done ones', () => {
    const g = goal([['Выбрать место', true], ['Накопить на билеты', false], ['Забронировать', false]]);
    expect(nextStep(g)).toBe('накопить на билеты');
    expect(stepsDone(g)).toEqual([1, 3]);
    expect(nextStep(goal([['Всё', true]]))).toBeNull();
  });
  it('falls back to «Кто-то» for someone who left the family', () => {
    expect(memberName([{ id: 'a', name: 'Оля' }], 'b')).toBe('Кто-то');
  });
});

describe('sums typed by hand', () => {
  it('accepts sensible ruble sums and refuses absurd ones that the server would never take', async () => {
    const { parseRub } = await import('./boardMath');
    expect(parseRub('25 000')).toBe(25000);
    expect(parseRub('1200,6')).toBe(1201);
    expect(parseRub('')).toBeNull();
    expect(parseRub('0')).toBeNull();
    expect(parseRub('99999999999')).toBeNull();
    expect(parseRub('10000001')).toBeNull();
    expect(parseRub('10000000')).toBe(10000000);
  });
});

describe('twinOf', () => {
  const bike = { id: 'g1', title: 'Новый велосипед', owner_id: 'son', saved: 8000, total: 25000 };
  it('finds the same thing in another word form for the same person', () => {
    expect(twinOf('Велосипед', 'son', [bike])?.id).toBe('g1');
    expect(twinOf('Хочу велосипеда', 'son', [bike])?.id).toBe('g1');
  });
  it('leaves other people, filler words and short words alone', () => {
    expect(twinOf('Велосипед', 'mama', [bike])).toBeNull();
    expect(twinOf('Новый телефон', 'son', [bike])).toBeNull();
    expect(twinOf('Кот', 'son', [{ ...bike, title: 'Кот' }])).toBeNull();
  });
});

