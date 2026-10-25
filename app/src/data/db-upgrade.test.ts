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

  it('adds the assistant threads as a local table that never syncs', async () => {
    const name = `t-${Math.random()}`;
    const old = new Dexie(name);
    old.version(7).stores({ ...V1_STORES, home_stock: '[household_id+key], household_id' });
    await old.open();
    await old.table('home_stock').put({ household_id: 'h1', key: 'молоко', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', state: 'have', by_member: null, updated_at: 'x', deleted_at: null });
    old.close();
    const db = createLocalDb(name);
    expect(await db.home_stock.count()).toBe(1);
    await db.assistant_chats.put({ id: 'c1', member_id: 'm1', messages: [{ role: 'user', content: [{ type: 'text', text: 'Привет' }] }], snapshot_hash: 'abc', updated_at: 'x' });
    expect((await db.assistant_chats.get('c1'))?.messages).toHaveLength(1);
    expect(Object.keys(KEY_FIELDS)).not.toContain('assistant_chats');
    expect(await db.outbox.count()).toBe(0);
  });

  it('knows the keys of the new tables', () => {
    expect(KEY_FIELDS.shopping_marks).toEqual(['item_id']);
    expect(slotKey('not_eat', { household_id: 'h', kind: 'item', ref: 'грибы' })).toBe('h|item|грибы');
  });

  it('moves the one conversation of version 8 into the list of conversations', async () => {
    const name = `t-${Math.random()}`;
    const old = new Dexie(name);
    old.version(8).stores({ ...V1_STORES, home_stock: '[household_id+key], household_id', assistant_threads: 'member_id' });
    await old.open();
    await old.table('assistant_threads').put({ member_id: 'm1', messages: [{ role: 'user', content: [{ type: 'text', text: 'Что на ужин?' }] }], snapshot_hash: 'abc', updated_at: '2026-10-25T08:00:00Z' });
    await old.table('assistant_threads').put({ member_id: 'm2', messages: [], snapshot_hash: '', updated_at: '2026-10-25T08:00:00Z' });
    old.close();
    const db = createLocalDb(name);
    const chats = await db.assistant_chats.toArray();
    expect(chats.map((c) => [c.member_id, c.messages.length])).toEqual([['m1', 1]]);
  });
});
