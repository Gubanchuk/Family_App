import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, slotKey } from './db';

describe('local db', () => {
  it('finds a week by family and Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.weeks.put({ id: 'w1', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: null, updated_at: '2026-10-12T08:00:00Z', deleted_at: null });
    const w = await db.weeks.where('[household_id+starts_on]').equals(['h1', '2026-10-12']).first();
    expect(w?.id).toBe('w1');
  });

  it('keeps the outbox in the order of writes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.outbox.add({ table: 'week_slots', row: { week_id: 'w1', day: 0, meal: 'dinner' }, created_at: 'a', tries: 0 });
    await db.outbox.add({ table: 'votes', row: { week_id: 'w1', member_id: 'm1' }, created_at: 'b', tries: 0 });
    expect((await db.outbox.orderBy('seq').toArray()).map((o) => o.table)).toEqual(['week_slots', 'votes']);
  });

  it('builds stable keys for every synced table', () => {
    expect(slotKey('week_slots', { week_id: 'w', day: 2, meal: 'lunch' })).toBe('w|2|lunch');
    expect(slotKey('votes', { week_id: 'w', member_id: 'm' })).toBe('w|m');
    expect(slotKey('weeks', { id: 'w' })).toBe('w');
    expect(slotKey('template_slots', { template_id: 't', day: 0, meal: 'snack' })).toBe('t|0|snack');
  });
});
