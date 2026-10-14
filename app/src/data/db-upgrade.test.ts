import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS, slotKey, V1_STORES } from './db';

describe('local db version 2', () => {
  it('keeps weeks stored by version 1 and adds the shopping tables', async () => {
    const name = `t-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores(V1_STORES);
    await old.open();
    await old.table('weeks').put({ id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: null, updated_at: 'x', deleted_at: null });
    old.close();
    const db = createLocalDb(name);
    expect(await db.weeks.count()).toBe(1);
    expect(await db.shopping_marks.count()).toBe(0);
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'грибы', updated_at: 'x', deleted_at: null });
    expect(await db.not_eat.get(['h1', 'item', 'грибы'])).toBeTruthy();
  });

  it('knows the keys of the new tables', () => {
    expect(KEY_FIELDS.shopping_marks).toEqual(['item_id']);
    expect(slotKey('not_eat', { household_id: 'h', kind: 'item', ref: 'грибы' })).toBe('h|item|грибы');
  });
});
