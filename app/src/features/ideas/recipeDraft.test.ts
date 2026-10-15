import { describe, expect, it } from 'vitest';
import { canSave, emptyDraft, missingOf, toRows } from './recipeDraft';

const full = () => ({ ...emptyDraft(), name: ' Мамины сырники ', category: 'breakfast' as const, time: '25', servings: '4', rows: [{ item: 'творог', qty: '500', toTaste: false, note: '' }, { item: 'соль', qty: '', toTaste: true, note: '' }], steps: ['Смешать', ' ', 'Обжарить'] });

describe('own recipe draft', () => {
  it('saves only with a name, a kind, portions, a product and a step', () => {
    expect(canSave(full())).toBe(true);
    expect(canSave({ ...full(), name: ' ' })).toBe(false);
    expect(canSave({ ...full(), rows: [] })).toBe(false);
    expect(canSave({ ...full(), steps: ['  '] })).toBe(false);
    expect(canSave({ ...full(), servings: '0' })).toBe(false);
    expect(canSave({ ...full(), rows: [{ item: 'творог', qty: '', toTaste: false, note: '' }] })).toBe(false);
  });
  it('turns the draft into a recipe of the family with its meals and products', () => {
    const { recipe, ingredients } = toRows(full());
    expect(recipe).toMatchObject({ name: 'Мамины сырники', category: 'breakfast', meals: ['breakfast'], time_total: 25, servings: 4, collections: ['ours'], steps: ['Смешать', 'Обжарить'] });
    expect(String(recipe.id)).toMatch(/^own-/);
    expect(ingredients).toEqual([
      { pos: 0, item: 'творог', qty: 500, to_taste: false, note: '', optional: false },
      { pos: 1, item: 'соль', qty: null, to_taste: true, note: '', optional: false },
    ]);
  });
  it('names what is still missing before the recipe can be saved', () => {
    expect(missingOf(emptyDraft())).toEqual(['название', 'что это', 'порции', 'продукт', 'шаг']);
    expect(missingOf({ ...full(), rows: [{ item: 'творог', qty: '', toTaste: false, note: '' }] })).toEqual(['количество: творог']);
    expect(missingOf(full())).toEqual([]);
  });
});
