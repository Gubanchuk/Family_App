import { describe, expect, it, vi } from 'vitest';
import type { Ingredient } from '../../data/db';
import { fetchRecipe, fromPage, matchLine } from './recipeImport';

const v = (item: string, unit = 'г'): Ingredient => ({ item, unit, dept: 'Другое', grp: 'x', piece_weight: null, piece_name: null, pantry: false });
const vocab = [v('творог'), v('яйца', 'шт'), v('мука'), v('молоко', 'мл'), v('соль'), v('лук репчатый'), v('лук зелёный'), v('фасоль'), v('сахар')];

describe('recipe by link', () => {
  it('finds a product of the vocabulary in a line and converts its amount', () => {
    expect(matchLine('Творог 9% — 500 г', vocab)).toEqual({ item: 'творог', qty: '500', toTaste: false, note: '' });
    expect(matchLine('Яйца — 2 шт.', vocab)).toMatchObject({ item: 'яйца', qty: '2' });
    expect(matchLine('2 яйца', vocab)).toMatchObject({ item: 'яйца', qty: '2' });
    expect(matchLine('Молоко 0,5 л', vocab)).toMatchObject({ item: 'молоко', qty: '500' });
    expect(matchLine('Мука — 1,5 кг', vocab)).toMatchObject({ item: 'мука', qty: '1500' });
    expect(matchLine('Соль по вкусу', vocab)).toMatchObject({ item: 'соль', toTaste: true, qty: '' });
    expect(matchLine('Фасоль консервированная — 1 банка', vocab)).toMatchObject({ item: 'фасоль', qty: '', note: '1 банка' });
    expect(matchLine('Лук репчатый — 1 шт.', vocab)).toMatchObject({ item: 'лук репчатый' });
    expect(matchLine('Сахар 2 ст. л.', vocab)).toMatchObject({ item: 'сахар', qty: '', note: '2 ст. л.' });
    expect(matchLine('Ванилин на кончике ножа', vocab)).toBeNull();
  });

  it('fills a draft and names the lines it could not place', () => {
    const r = fromPage({ name: 'Сырники', servings: 4, minutes: 30, ingredients: ['Творог — 500 г', 'Яйца — 2 шт.', 'Ванилин — щепотка', 'Творог для подачи'], steps: ['Смешать.', 'Обжарить.'], site: 'eda.ru' }, vocab, 'https://eda.ru/r/1');
    expect(r.patch).toMatchObject({ name: 'Сырники', servings: '4', time: '30', steps: ['Смешать.', 'Обжарить.'], source: 'https://eda.ru/r/1' });
    expect(r.patch.rows?.map((x) => x.item)).toEqual(['творог', 'яйца']);
    expect(r.unmatched).toEqual(['Ванилин — щепотка']);
  });

  it('turns any failure into one plain answer', async () => {
    expect(await fetchRecipe('https://eda.ru/r/1', vi.fn(async () => ({ data: { recipe: { name: 'x' } }, error: null })) as never)).toEqual({ name: 'x' });
    expect(await fetchRecipe('https://eda.ru/r/1', vi.fn(async () => ({ data: { error: 'no_recipe' }, error: null })) as never)).toBeNull();
    expect(await fetchRecipe('https://eda.ru/r/1', vi.fn(async () => ({ data: null, error: new Error('down') })) as never)).toBeNull();
    expect(await fetchRecipe('https://eda.ru/r/1', vi.fn(async () => { throw new Error('offline'); }) as never)).toBeNull();
  });
});
