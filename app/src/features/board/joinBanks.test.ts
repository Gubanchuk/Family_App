import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { joinBanks } from './boardActions';

describe('joinBanks', () => {
  it('moves the goal into the wish and takes it back', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.wishes.put({ id: 'w1', household_id: 'h', owner_id: 'son', title: 'Велосипед', price: 20000, saved: 1000, done_at: null, created_by: 'son', updated_at: 'x', deleted_at: null });
    await db.goals.put({ id: 'g1', household_id: 'h', owner_id: 'son', title: 'Велосипед', target: 25000, saved: 4000, steps: [], created_by: 'son', updated_at: 'x', deleted_at: null });
    await db.deposits.put({ id: 'd1', household_id: 'h', wish_id: null, goal_id: 'g1', member_id: 'son', amount: 500, created_at: 'x', updated_at: 'x', deleted_at: null });
    const r = await joinBanks(db, { kind: 'wish', id: 'w1' }, { kind: 'goal', id: 'g1' });
    expect(r?.moved).toBe(4500);
    expect(await db.wishes.get('w1')).toMatchObject({ saved: 5500, price: 20000 });
    expect((await db.goals.get('g1'))?.deleted_at).toBeTruthy();
    await r!.undo();
    expect(await db.wishes.get('w1')).toMatchObject({ saved: 1000, price: 20000 });
    expect((await db.goals.get('g1'))?.deleted_at).toBeNull();
  });

  it('keeps the goal and removes the wish the other way round; a removed item is not joined', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.wishes.put({ id: 'w1', household_id: 'h', owner_id: 'son', title: 'Велосипед', price: null, saved: 1500, done_at: null, created_by: 'son', updated_at: 'x', deleted_at: null });
    await db.goals.put({ id: 'g1', household_id: 'h', owner_id: 'son', title: 'Велосипед', target: 25000, saved: 0, steps: [], created_by: 'son', updated_at: 'x', deleted_at: null });
    const r = await joinBanks(db, { kind: 'goal', id: 'g1' }, { kind: 'wish', id: 'w1' });
    expect((await db.goals.get('g1'))?.saved).toBe(1500);
    expect((await db.wishes.get('w1'))?.deleted_at).toBeTruthy();
    expect(r?.moved).toBe(1500);
    expect(await joinBanks(db, { kind: 'goal', id: 'g1' }, { kind: 'wish', id: 'w1' })).toBeNull();
  });
});
