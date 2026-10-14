import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { loadContent } from './content';

function server() {
  const store: Record<string, Record<string, unknown>[]> = {
    ingredients: [{ item: 'морковь', unit: 'г', dept: 'Овощи и фрукты', grp: 'veg', piece_weight: 100, piece_name: null, pantry: false }],
    prices: [{ item: 'морковь', price_per_unit: 0.035, source: 'Магнит, Краснодар', note: null, collected: '2026-10-13' }],
    recipes: Array.from({ length: 229 }, (_, i) => ({ id: `r${i}`, name: `Блюдо ${i}`, category: 'main', meals: ['dinner'] })),
    recipe_ingredients: Array.from({ length: 2400 }, (_, i) => ({ recipe_id: `r${i % 229}`, pos: Math.floor(i / 229), item: 'морковь', qty: 100 })),
    recipe_sides: [{ recipe_id: 'r0', side_id: 'r1' }],
  };
  return fakeSupabase(store, { ...KEY_FIELDS, ingredients: ['item'], prices: ['item'], recipes: ['id'], recipe_ingredients: ['recipe_id', 'pos'], recipe_sides: ['recipe_id', 'side_id'] });
}

describe('loadContent', { timeout: 30_000 }, () => {
  it('loads every page of the recipe base', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const r = await loadContent(db, server().client as never, { now: new Date('2026-10-14T00:00:00Z') });
    expect(r.loaded).toBe(true);
    expect(await db.recipes.count()).toBe(229);
    expect(await db.recipe_ingredients.count()).toBe(2400);
    expect(await db.prices.count()).toBe(1);
  });

  it('skips a fresh copy and reloads a week-old one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = server();
    await loadContent(db, fake.client as never, { now: new Date('2026-10-14T00:00:00Z') });
    expect((await loadContent(db, fake.client as never, { now: new Date('2026-10-15T00:00:00Z') })).loaded).toBe(false);
    expect((await loadContent(db, fake.client as never, { now: new Date('2026-10-22T00:00:00Z') })).loaded).toBe(true);
  });

  it('keeps the old copy when the network is down', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = server();
    await loadContent(db, fake.client as never, { now: new Date('2026-10-14T00:00:00Z') });
    fake.setOffline(true);
    const r = await loadContent(db, fake.client as never, { force: true, now: new Date('2026-10-22T00:00:00Z') });
    expect(r.loaded).toBe(false);
    expect(await db.recipes.count()).toBe(229);
  });
});

describe('loadContent safety', () => {
  it('does not replace the recipe base with an empty answer', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.recipes.put({ id: 'r1', name: 'Борщ' } as never);
    const empty = fakeSupabase({ ingredients: [], prices: [], recipes: [], recipe_ingredients: [], recipe_sides: [] }, { ...KEY_FIELDS, ingredients: ['item'], prices: ['item'], recipes: ['id'], recipe_ingredients: ['recipe_id', 'pos'], recipe_sides: ['recipe_id', 'side_id'] });
    expect((await loadContent(db, empty.client as never, { force: true })).loaded).toBe(false);
    expect(await db.recipes.count()).toBe(1);
  });
});
