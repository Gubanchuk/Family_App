import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { pendingCount, pullTable, pushOutbox, rejectionText, syncNow, writeLocal } from './sync';

const slot = (dish: string) => ({ week_id: 'w1', household_id: 'h1', day: 1, meal: 'dinner', dish_id: dish, side_id: null, salad_id: null, simple: null });

describe('sync', () => {
  it('keeps a change made offline and sends it when the network is back', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
    expect((await syncNow(db, fake.client as never)).offline).toBe(true);
    expect(await pendingCount(db)).toBe(1);

    const reopened = createLocalDb(db.name);
    expect(await pendingCount(reopened)).toBe(1);

    fake.setOffline(false);
    const r = await syncNow(reopened, fake.client as never);
    expect(r.pushed).toBe(1);
    expect(await pendingCount(reopened)).toBe(0);
  });

  it('pulls rows changed on another phone and moves the cursor', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    expect(await pullTable(db, fake.client as never, 'week_slots')).toBe(1);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-kotlety');
    expect(await pullTable(db, fake.client as never, 'week_slots')).toBe(0);
  });

  it('does not overwrite a change still waiting to be sent', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    fake.setOffline(false);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    await pullTable(db, fake.client as never, 'week_slots');
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
  });

  it('rolls a refused change back to the server version and explains why', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('week_slots', slot('mn-kotlety'));
    await pullTable(db, fake.client as never, 'week_slots');
    fake.reject('week_slots', 'not_a_parent');
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    const r = await pushOutbox(db, fake.client as never);
    expect(r.rejected).toEqual(['not_a_parent']);
    expect(await pendingCount(db)).toBe(0);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-kotlety');
    expect(rejectionText('not_a_parent')).toBe('Менять утверждённую неделю могут только родители. Вернули как было.');
  });

  it('pages through large tables', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    for (let i = 0; i < 2300; i += 1) fake.serverRow('week_templates', { id: `t${i}`, household_id: null, name: `T${i}`, season: ['any'], note: '', deleted_at: null });
    expect(await pullTable(db, fake.client as never, 'week_templates')).toBe(2300);
    expect(await db.week_templates.count()).toBe(2300);
  });
});
