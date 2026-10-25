import { describe, expect, it } from 'vitest';
import { addDaysIso, dayOfWeek, fitsMeal, mondayOf, potChange, potNote, soupBatches, soupOn, weekLabel, type SlotLike } from './week';

describe('week dates', () => {
  it('takes Monday in local time on a late Sunday evening', () => {
    expect(mondayOf(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-12');
  });
  it('starts a new week right after Sunday midnight', () => {
    expect(mondayOf(new Date(2026, 9, 19, 0, 30))).toBe('2026-10-19');
  });
  it('counts days from Monday', () => {
    expect(dayOfWeek(new Date(2026, 9, 13))).toBe(1);
    expect(dayOfWeek(new Date(2026, 9, 18))).toBe(6);
  });
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-10-26', 6)).toBe('2026-11-01');
  });
  it('labels a week inside one month and across two', () => {
    expect(weekLabel('2026-10-12')).toBe('12–18 октября');
    expect(weekLabel('2026-10-26')).toBe('26 октября – 1 ноября');
  });
});

describe('soup pots', () => {
  const lunch = (day: number, dish: string | null): SlotLike => ({ day, meal: 'lunch', dish_id: dish });
  const slots = [lunch(0, 'sp-borsch'), lunch(1, 'sp-borsch'), lunch(2, 'sp-borsch'), lunch(3, 'sp-ukha'), lunch(4, 'sp-ukha'), lunch(5, null), lunch(6, 'sp-borsch'),
    { day: 0, meal: 'dinner', dish_id: 'sp-borsch' } as SlotLike];

  it('groups consecutive days with the same soup into one pot', () => {
    expect(soupBatches(slots)).toEqual([
      { dish_id: 'sp-borsch', from: 0, to: 2 },
      { dish_id: 'sp-ukha', from: 3, to: 4 },
      { dish_id: 'sp-borsch', from: 6, to: 6 },
    ]);
  });
  it('tells which day of the pot it is', () => {
    expect(soupOn(slots, 1)).toEqual({ dish_id: 'sp-borsch', nth: 2, of: 3 });
    expect(soupOn(slots, 5)).toBeNull();
  });
});

describe('fitsMeal', () => {
  it('matches dishes to meals', () => {
    expect(fitsMeal({ category: 'main', meals: ['dinner'] }, 'dinner')).toBe(true);
    expect(fitsMeal({ category: 'soup', meals: ['lunch'] }, 'lunch')).toBe(true);
    expect(fitsMeal({ category: 'dessert', meals: ['snack'] }, 'snack')).toBe(true);
    expect(fitsMeal({ category: 'breakfast', meals: ['breakfast'] }, 'dinner')).toBe(false);
    expect(fitsMeal({ category: 'main', meals: ['breakfast', 'dinner'] }, 'breakfast')).toBe(true);
  });
});

describe('replacing a lunch from a pot of soup', () => {
  const lunches = (ids: Array<string | null>): SlotLike[] => ids.map((dish_id, day) => ({ day, meal: 'lunch', dish_id }));
  const week = lunches(['borsch', 'borsch', 'borsch', 'ukha', 'ukha', null, null]);
  it('says the pot gets shorter when its last or first day is replaced', () => {
    expect(potNote(potChange(week, 2, 'shchi')!, 'Борщ')).toBe('Борщ теперь на 2 дня вместо 3.');
    expect(potNote(potChange(week, 0, 'shchi')!, 'Борщ')).toBe('Борщ теперь на 2 дня вместо 3, со вторника.');
  });
  it('says where the second pot begins when a middle day is replaced', () => {
    expect(potNote(potChange(week, 1, 'shchi')!, 'Борщ')).toBe('Борщ теперь на 1 день вместо 3, со среды — новая кастрюля.');
  });
  it('says nothing for a lunch outside a pot or replaced by the same soup', () => {
    expect(potChange(week, 5, 'shchi')).toBeNull();
    expect(potChange(week, 1, 'borsch')).toBeNull();
    expect(potChange(lunches(['borsch', 'ukha']), 0, 'shchi')).toBeNull();
  });
});
