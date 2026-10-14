import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import { signOutHere } from './signOut';

describe('signing out on this phone', () => {
  it('waits when changes have not reached the server yet', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.outbox.add({ table: 'votes', row: {}, created_at: 'x', tries: 0 });
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    expect(await signOutHere({ db, signOut, force: false })).toEqual({ done: false, pending: 1 });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('clears the family data from the phone so the next account starts clean', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.outbox.add({ table: 'votes', row: {}, created_at: 'x', tries: 0 });
    await db.weeks.put({ id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: null, status: 'approved', proposed_by: null, approved_by: null, updated_at: 'x', deleted_at: null });
    localStorage.setItem('fa.members.u1', '[]');
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    expect(await signOutHere({ db, signOut, force: true })).toEqual({ done: true, pending: 1 });
    expect(signOut).toHaveBeenCalled();
    const reopened = createLocalDb(db.name);
    expect(await reopened.weeks.count()).toBe(0);
    expect(await reopened.outbox.count()).toBe(0);
    expect(localStorage.getItem('fa.members.u1')).toBeNull();
  });

  it('stops pushes to this phone', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const unsubscribe = vi.fn(() => Promise.resolve());
    await signOutHere({ db, signOut: () => Promise.resolve(), force: false, unsubscribe });
    expect(unsubscribe).toHaveBeenCalled();
  });
});
