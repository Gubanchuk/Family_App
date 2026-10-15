import { describe, expect, it } from 'vitest';
import { memberName, nextStep, progress, stepsDone } from './boardMath';
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
