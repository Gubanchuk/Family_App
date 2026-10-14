import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { SyncProvider, useSync } from './SyncProvider';
import { writeLocal } from './sync';
import { seedMenu } from '../features/menu/testData';

function Probe() {
  const s = useSync();
  return <><p>{s.offline ? 'offline' : 'online'} · {s.pending}</p>{s.message ? <button type="button" onClick={s.dismiss}>{s.message}</button> : null}</>;
}
const withChannel = (fake: ReturnType<typeof fakeSupabase>) => Object.assign(fake.client as object, { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} });
const vote = { week_id: 'w1', member_id: 'm1', household_id: 'h1', value: 'yes', comment: '' };

describe('SyncProvider', () => {
  it('sends queued changes when the browser comes back online', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.setOffline(true);
    await writeLocal(db, 'votes', [{ week_id: 'w1', member_id: 'm1', household_id: 'h1', value: 'yes', comment: '' }]);
    const client = Object.assign(fake.client as object, { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} });
    render(<SyncProvider householdId="h1" client={client as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText('offline · 1')).toBeInTheDocument());
    fake.setOffline(false);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
  });

  it('sends a change made online right away, without waiting for the timer', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    render(<SyncProvider householdId="h1" portions={3.5} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
    await act(async () => { await writeLocal(db, 'votes', [vote]); });
    await waitFor(() => expect(store.votes).toHaveLength(1), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
  });

  it('sends changes before downloading the recipe base', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    fake.hang('ingredients');
    await writeLocal(db, 'votes', [vote]);
    render(<SyncProvider householdId="h1" portions={3.5} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(store.votes).toHaveLength(1));
  });

  it('keeps a refusal message until it is dismissed', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    fake.reject('votes', 'not_a_parent');
    await writeLocal(db, 'votes', [vote]);
    render(<SyncProvider householdId="h1" portions={3.5} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    const msg = await screen.findByRole('button', { name: /Менять утверждённую неделю могут только родители/ });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Менять утверждённую неделю/ })).toBeInTheDocument();
    await userEvent.click(msg);
    expect(screen.queryByRole('button', { name: /Менять утверждённую неделю/ })).toBeNull();
  });

  it('syncs when the app comes back to the screen', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const store: Record<string, Record<string, unknown>[]> = {};
    const fake = fakeSupabase(store, KEY_FIELDS);
    fake.setOffline(true);
    render(<SyncProvider householdId="h1" portions={3.5} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText(/offline/)).toBeInTheDocument());
    await act(async () => { await writeLocal(db, 'votes', [vote]); });
    fake.setOffline(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(store.votes).toHaveLength(1));
  });

  it('remembers the family portions and listens to shopping changes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const fake = fakeSupabase({}, KEY_FIELDS);
    const tables: string[] = [];
    const channel = { on(_e: unknown, f: { table: string }) { tables.push(f.table); return this; }, subscribe() { return this; } };
    const client = Object.assign(fake.client as object, { channel: () => channel, removeChannel() {} });
    render(<SyncProvider householdId="h1" portions={3.5} client={client as never} db={db}><Probe /></SyncProvider>);
    await waitFor(async () => expect((await db.meta.get('family_portions'))?.value).toBe(3.5));
    expect(tables).toEqual(expect.arrayContaining(['shopping_items', 'shopping_marks', 'dish_offers', 'shop_trips', 'not_eat']));
  });

  it('builds the shopping list of an approved week that arrived from another phone', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const fake = fakeSupabase({}, KEY_FIELDS);
    render(<SyncProvider householdId="h1" portions={3.5} isParent now={new Date(2026, 9, 13)} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    await waitFor(async () => expect(await db.shopping_items.count()).toBeGreaterThan(0));
  });

  it('leaves the list to the parents', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const fake = fakeSupabase({}, KEY_FIELDS);
    render(<SyncProvider householdId="h1" portions={3.5} now={new Date(2026, 9, 13)} client={withChannel(fake) as never} db={db}><Probe /></SyncProvider>);
    await waitFor(() => expect(screen.getByText('online · 0')).toBeInTheDocument());
    expect(await db.shopping_items.count()).toBe(0);
  });
});
