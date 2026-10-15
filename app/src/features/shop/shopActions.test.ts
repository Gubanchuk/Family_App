import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../data/db';
import { guessDept, guessIngredient } from './shopActions';

const ing = (item: string, dept: string): Ingredient => ({ item, unit: 'г', dept, grp: 'x', piece_weight: null, piece_name: null, pantry: false });
const vocab = new Map([ing('хлеб белый', 'Хлеб'), ing('хлеб ржаной', 'Хлеб'), ing('сыр твёрдый', 'Молочное и яйца'), ing('помидоры', 'Овощи и фрукты'), ing('молоко', 'Молочное и яйца'), ing('соль', 'Бакалея'), ing('мука пшеничная', 'Бакалея')].map((v) => [v.item, v]));

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

describe('guessDept', () => {
  it('puts household, pharmacy and clothes where they belong, food by the vocabulary', () => {
    expect(guessDept('Стиральный порошок', vocab)).toBe('Для дома');
    expect(guessDept('Туалетная бумага', vocab)).toBe('Для дома');
    expect(guessDept('Влажные салфетки для Димы', vocab)).toBe('Для дома');
    expect(guessDept('Парацетамол в таблетках', vocab)).toBe('Аптека');
    expect(guessDept('Пластырь', vocab)).toBe('Аптека');
    expect(guessDept('Носки Диме', vocab)).toBe('Одежда и обувь');
    expect(guessDept('Кроссовки', vocab)).toBe('Одежда и обувь');
    expect(guessDept('Молоко', vocab)).toBe('Молочное и яйца');
    expect(guessDept('Хлеб', vocab)).toBe('Хлеб');
    expect(guessDept('Подарок учителю', vocab)).toBe('Другое');
  });
  it('keeps food lines that mention a bag or iodine in their food department', () => {
    expect(guessDept('Молоко 2 пакета', vocab)).toBe('Молочное и яйца');
    expect(guessDept('Мука 2 пакета', vocab)).toBe('Бакалея');
    expect(guessDept('Соль йодированная', vocab)).toBe('Бакалея');
    expect(guessDept('Таблетки для посудомоечной машины', vocab)).toBe('Для дома');
    expect(guessDept('Перчатки резиновые', vocab)).toBe('Для дома');
    expect(guessDept('Брюква', vocab)).toBe('Другое');
  });
});
