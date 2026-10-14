import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createLocalDb, KEY_FIELDS } from './db';
import { fakeSupabase } from './fakeSupabase';
import { SyncProvider, useSync } from './SyncProvider';
import { writeLocal } from './sync';

function Probe() {
  const s = useSync();
  return <p>{s.offline ? 'offline' : 'online'} · {s.pending}</p>;
}

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
});
