import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft } from './recipeDraft';

type Call = { table: string; op: string; arg?: unknown; eq?: [string, unknown] };
const calls: Call[] = [];
let failInsert = false;

// A recorder in place of the Supabase client: each chain ends in a promise with { error }.
vi.mock('../../lib/supabase', () => {
  const from = (table: string) => {
    const done = (c: Call) => { calls.push(c); return Promise.resolve({ error: c.op === 'insert' && failInsert ? { message: 'network' } : null }); };
    return {
      upsert: (arg: unknown) => done({ table, op: 'upsert', arg }),
      insert: (arg: unknown) => done({ table, op: 'insert', arg }),
      delete: () => ({ eq: (k: string, v: unknown) => done({ table, op: 'delete', eq: [k, v] }) }),
      update: (arg: unknown) => ({ eq: (k: string, v: unknown) => done({ table, op: 'update', arg, eq: [k, v] }) }),
    };
  };
  return { supabase: { from } };
});
vi.mock('../../data/content', () => ({ loadContent: vi.fn(async () => ({ loaded: true, counts: {} })) }));

const { saveRecipe } = await import('./recipeApi');
const draft = () => ({ ...emptyDraft(), id: 'own-1', name: 'Сырники', category: 'breakfast' as const, time: '25', servings: '4', rows: [{ item: 'творог', qty: '500', toTaste: false, note: '' }], steps: ['Смешать'] });

describe('saveRecipe', () => {
  beforeEach(() => { calls.length = 0; failInsert = false; });

  it('replaces the products and moves the base version only after they are in', async () => {
    await saveRecipe('h', draft(), false);
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual(['recipes.upsert', 'recipe_ingredients.delete', 'recipe_ingredients.insert', 'recipes.update']);
    expect(calls[1].eq).toEqual(['recipe_id', 'own-1']);
    expect(calls[3].arg).toHaveProperty('updated_at');
  });

  it('hides a new recipe again when its products did not save, so nobody sees an empty card', async () => {
    failInsert = true;
    await expect(saveRecipe('h', draft(), true)).rejects.toThrow();
    const last = calls[calls.length - 1];
    expect(`${last.table}.${last.op}`).toBe('recipes.update');
    expect(last.arg).toHaveProperty('deleted_at');
    expect(last.eq).toEqual(['id', 'own-1']);
  });
});
