import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../data/db';
import { guessIngredient } from './shopActions';

const ing = (item: string, dept: string): Ingredient => ({ item, unit: 'г', dept, grp: 'x', piece_weight: null, piece_name: null, pantry: false });
const vocab = new Map([ing('хлеб белый', 'Хлеб'), ing('хлеб ржаной', 'Хлеб'), ing('сыр твёрдый', 'Молочное и яйца'), ing('помидоры', 'Овощи и фрукты'), ing('молоко', 'Молочное и яйца')].map((v) => [v.item, v]));

describe('guessIngredient', () => {
  it('finds the exact product first', () => {
    expect(guessIngredient('Молоко', vocab)).toEqual({ exact: true, dept: 'Молочное и яйца', item: 'молоко' });
  });
  it('puts a short everyday name into the right department', () => {
    expect(guessIngredient('Хлеб', vocab)).toEqual({ exact: false, dept: 'Хлеб', item: null });
    expect(guessIngredient('сыр', vocab)?.dept).toBe('Молочное и яйца');
    expect(guessIngredient('помидор', vocab)?.dept).toBe('Овощи и фрукты');
  });
  it('leaves things that are not food to «Другое»', () => {
    expect(guessIngredient('Салфетки', vocab)).toBeNull();
  });
});
