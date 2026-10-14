import { describe, expect, it } from 'vitest';
import { blockedBy, recipeMatches } from './search';
import { RECIPES } from '../menu/testData';

const syrniki = RECIPES.find((r) => r.id === 'br-syrniki')!;

describe('search', () => {
  it('finds a dish by name or by a product in it, ignoring ё and case', () => {
    expect(recipeMatches('сырн', syrniki, ['творог'])).toBe(true);
    expect(recipeMatches('ТВОРОГ', syrniki, ['творог'])).toBe(true);
    expect(recipeMatches('курица', syrniki, ['творог'])).toBe(false);
    expect(recipeMatches('', syrniki, [])).toBe(true);
  });
  it('blocks a dish with a product the family does not eat, by whole word', () => {
    const ne = (ref: string, kind: 'item' | 'dish' = 'item') => ({ household_id: 'h1', kind, ref, updated_at: 'x', deleted_at: null });
    expect(blockedBy(syrniki, ['творог', 'яйца'], [ne('творог')])).toBe('творог');
    expect(blockedBy(syrniki, ['печенье'], [ne('печень')])).toBeNull();
    expect(blockedBy(syrniki, ['курица целая'], [ne('курица')])).toBe('курица');
    expect(blockedBy(syrniki, [], [ne('br-syrniki', 'dish')])).toBe('Сырники');
  });

  it('blocks a dish by its name, typed into «Не едим»', () => {
    const ne = { household_id: 'h1', kind: 'item' as const, ref: 'сырники', updated_at: 'x', deleted_at: null };
    expect(blockedBy(syrniki, ['творог'], [ne])).toBe('сырники');
    expect(blockedBy({ ...syrniki, name: 'Сырники с изюмом' }, [], [ne])).toBe('сырники');
    expect(blockedBy({ ...syrniki, name: 'Ленивые сырники' }, [], [ne])).toBeNull();
  });
});
