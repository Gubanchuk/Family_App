import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type Week } from '../../data/db';
import { canEditWeek, replaceDay, replaceMeal } from './actions';
import { RECIPES, seedMenu, templateDays } from './testData';
import type { Member } from '../family/useFamily';

const week: Week = { id: 'w-cur', household_id: 'h1', starts_on: '2026-10-12', template_id: 'autumn', status: 'approved', proposed_by: null, approved_by: 'm-papa', updated_at: 'x', deleted_at: null };
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('menu actions', () => {
  it('replaces one meal with a day of another template and queues it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const src = templateDays('quick', 'mn-plov', 'sp-ukha').find((s) => s.day === 4 && s.meal === 'dinner')!;
    await replaceMeal(db, week, 1, 'dinner', { fromSlot: src });
    const s = await db.week_slots.get(['w-cur', 1, 'dinner']);
    expect([s?.dish_id, s?.side_id]).toEqual(['mn-plov', 'side-grechka']);
    expect(await db.outbox.count()).toBe(1);
  });

  it('replaces one meal with any recipe and its first side', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await replaceMeal(db, week, 2, 'dinner', { recipe: RECIPES.find((r) => r.id === 'mn-plov')!, sides: [] });
    const s = await db.week_slots.get(['w-cur', 2, 'dinner']);
    expect([s?.dish_id, s?.side_id]).toEqual(['mn-plov', null]);
  });

  it('replaces a whole day with four meals of another day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await replaceDay(db, week, 1, templateDays('quick', 'mn-plov', 'sp-ukha').filter((s) => s.day === 5));
    const day = await db.week_slots.where('week_id').equals('w-cur').filter((s) => s.day === 1).toArray();
    expect(day.map((s) => s.dish_id).sort()).toEqual(['br-kasha', 'mn-plov', 'sn-yabloki', 'sp-ukha'].sort());
    expect(await db.outbox.count()).toBe(4);
  });

  it('lets only parents edit an approved week', () => {
    expect(canEditWeek(papa, week)).toBe(true);
    expect(canEditWeek({ ...papa, role: 'child' }, week)).toBe(false);
    expect(canEditWeek({ ...papa, role: 'child' }, { ...week, status: 'proposed' })).toBe(true);
  });
});
