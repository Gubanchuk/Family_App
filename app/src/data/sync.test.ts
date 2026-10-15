import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { missingTables, pendingCount, pullTable, pushOutbox, rejectionText, syncNow, writeLocal, writeWeekLocal } from './sync';

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

  it('skips a table the server does not have yet and remembers it, without calling it offline', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('weeks', { id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: null, deleted_at: null });
    fake.missing('shop_trips');
    const r = await syncNow(db, fake.client as never);
    expect(r.offline).toBe(false);
    expect(await db.weeks.get('w1')).toBeTruthy();
    expect(await missingTables(db)).toEqual(['shop_trips']);
  });

  it('keeps board rows on the phone and sends them like any other change', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    await writeLocal(db, 'requests', [{ id: 'r1', household_id: 'h1', from_id: 'm1', to_id: 'm2', title: 'Вынести мусор', due_on: null, urgent: false, status: 'open', done_at: null, deleted_at: null }]);
    expect((await db.requests.get('r1'))?.title).toBe('Вынести мусор');
    expect((await syncNow(db, fake.client as never)).pushed).toBe(1);
  });

  it('keeps money rows on the phone and sends them', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    await writeLocal(db, 'money_entries', [{ id: 'e1', household_id: 'h1', kind: 'expense', amount: 1200, category: 'Продукты', member_id: 'm1', on_date: '2026-10-15', note: '', created_by: 'm1', deleted_at: null }]);
    expect((await db.money_entries.get('e1'))?.amount).toBe(1200);
    expect((await syncNow(db, fake.client as never)).pushed).toBe(1);
  });

  it('keeps a change for a table the server lacks queued and still sends everything else', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.missing('requests');
    await writeLocal(db, 'requests', [{ id: 'r1', household_id: 'h1', from_id: 'm1', to_id: 'm2', title: 'Мусор', due_on: null, urgent: false, status: 'open', done_at: null, deleted_at: null }]);
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    const r = await syncNow(db, fake.client as never);
    expect(r.offline).toBe(false);
    expect(r.pushed).toBe(1);
    expect(await pendingCount(db)).toBe(1);
    expect(await missingTables(db)).toContain('requests');
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

describe('sync: weeks and server trouble', () => {
  const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
  const weekRow = (id: string) => ({ id, household_id: 'h1', starts_on: '2026-10-19', template_id: 'quick', status: 'proposed', proposed_by: 'm-son', approved_by: null, deleted_at: null });
  const meals = (id: string) => Array.from({ length: 28 }, (_, i) => ({ week_id: id, household_id: 'h1', day: Math.floor(i / 4), meal: MEALS[i % 4], dish_id: 'mn-plov', side_id: null, salad_id: null, simple: null }));

  it('sends a week and its meals as one call', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    await writeWeekLocal(db, weekRow('w1'), meals('w1'));
    expect(await pendingCount(db)).toBe(1);
    expect(await db.week_slots.where('week_id').equals('w1').count()).toBe(28);
    expect((await pushOutbox(db, fake.client as never)).pushed).toBe(1);
    expect(store.week_slots).toHaveLength(28);
    expect(store.weeks).toHaveLength(1);
  });

  it('keeps a change when the server has a temporary failure', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.failWrite('week_slots', { message: 'JWT expired', code: 'PGRST301' });
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    const r = await pushOutbox(db, fake.client as never);
    expect(r).toEqual({ pushed: 0, stopped: 'network', rejected: [] });
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
    expect((await pushOutbox(db, fake.client as never)).pushed).toBe(1);
  });

  it('keeps a refused change when the server copy cannot be read back', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.reject('week_slots', 'not_a_parent');
    fake.failRead('week_slots');
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    expect((await pushOutbox(db, fake.client as never)).stopped).toBe('network');
    expect(await pendingCount(db)).toBe(1);
  });

  it('drops the meals and vote of a refused week and says why', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    fake.serverRow('weeks', { ...weekRow('w-mama'), proposed_by: 'm-mama' });
    await writeWeekLocal(db, weekRow('w-son'), meals('w-son'));
    await writeLocal(db, 'votes', [{ week_id: 'w-son', member_id: 'm-son', household_id: 'h1', value: 'yes', comment: '' }]);
    const r = await pushOutbox(db, fake.client as never);
    expect(r.rejected).toHaveLength(1);
    expect(rejectionText(r.rejected[0])).toBe('На эту неделю уже есть предложение. Посмотрите его в Меню.');
    expect(await pendingCount(db)).toBe(0);
    expect(await db.weeks.get('w-son')).toBeUndefined();
    expect(await db.week_slots.where('week_id').equals('w-son').count()).toBe(0);
    expect(await db.votes.where('week_id').equals('w-son').count()).toBe(0);
  });

  it('does not let a pull overwrite a week waiting to be sent', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.serverRow('week_slots', { ...meals('w1')[5], dish_id: 'mn-kotlety' });
    await writeWeekLocal(db, weekRow('w1'), meals('w1'));
    await pullTable(db, fake.client as never, 'week_slots');
    expect((await db.week_slots.get(['w1', 1, 'lunch']))?.dish_id).toBe('mn-plov');
  });
});

describe('sync without a session', () => {
  it('keeps everything on the phone instead of writing as an anonymous visitor', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    const client = Object.assign(fake.client as object, { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } });
    await writeLocal(db, 'week_slots', [slot('mn-plov')]);
    const r = await syncNow(db, client as never);
    expect(r.offline).toBe(true);
    expect(await pendingCount(db)).toBe(1);
    expect(store.week_slots ?? []).toHaveLength(0);
    expect((await db.week_slots.get(['w1', 1, 'dinner']))?.dish_id).toBe('mn-plov');
  });
});

describe('quiet refusals', () => {
  it('says nothing when the server keeps a line someone already bought', () => {
    expect(rejectionText('already_bought')).toBe('');
  });
});
