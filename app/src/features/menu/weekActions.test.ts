import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import { approveWeek, setWeekFromTemplate, voteWeek } from './weekActions';
import { seedMenu } from './testData';
import type { Member } from '../family/useFamily';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };

describe('week actions', () => {
  it('builds a week of 28 meals from a template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-12', template: 'autumn', status: 'approved', by: 'm-papa' });
    expect(w.status).toBe('approved');
    expect(await db.week_slots.where('week_id').equals(w.id).count()).toBe(28);
    const queued = await db.outbox.where('table').equals('weeks').toArray();
    expect(queued.map((o) => o.rpc)).toEqual(['save_week']);
    expect((queued[0].row.p_slots as unknown[]).length).toBe(28);
  });

  it('switches an existing week to another template keeping its id', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const existing = (await db.weeks.get('w-cur'))!;
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-12', template: 'quick', status: 'approved', by: 'm-papa', existing });
    expect(w.id).toBe('w-cur');
    expect((await db.week_slots.get(['w-cur', 0, 'dinner']))?.dish_id).toBe('mn-plov');
  });

  it('records votes and a parent approval', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-19', template: 'quick', status: 'proposed', by: 'm-son' });
    await voteWeek(db, w, son, 'yes');
    await approveWeek(db, w, papa);
    expect((await db.votes.get([w.id, 'm-son']))?.value).toBe('yes');
    expect((await db.weeks.get(w.id))?.status).toBe('approved');
    expect((await db.weeks.get(w.id))?.approved_by).toBe('m-papa');
  });

  it('starts the vote over when the proposal changes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const w = await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-19', template: 'quick', status: 'proposed', by: 'm-son' });
    await voteWeek(db, w, son, 'yes');
    await setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-19', template: 'autumn', status: 'proposed', by: 'm-papa', existing: (await db.weeks.get(w.id))! });
    expect(await db.votes.where('week_id').equals(w.id).count()).toBe(0);
  });

  it('does not build a week from a template whose days have not loaded', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.template_slots.where('template_id').equals('quick').delete();
    await expect(setWeekFromTemplate(db, { household: 'h1', startsOn: '2026-10-19', template: 'quick', status: 'proposed', by: 'm-son' })).rejects.toThrow('template_not_loaded');
    expect(await db.weeks.count()).toBe(0);
  });
});
