import { writeLocal, writeWeekLocal } from '../../data/sync';
import { regenerateWeekList } from '../shop/menuList';
import type { LocalDb, Week } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEALS } from './week';

// template null: an empty week, to pick dishes only for the days that need them.
// listDays: the days the shopping list is for, left out until the server has the column.
export async function setWeekFromTemplate(db: LocalDb, a: { household: string; startsOn: string; template: string | null; status: 'proposed' | 'approved'; by: string; existing?: Week; listDays?: number[] | null }): Promise<Week> {
  const week: Week = {
    id: a.existing?.id ?? crypto.randomUUID(),
    household_id: a.household,
    starts_on: a.startsOn,
    template_id: a.template,
    status: a.status,
    proposed_by: a.status === 'proposed' ? a.by : a.existing?.proposed_by ?? null,
    approved_by: a.status === 'approved' ? a.by : null,
    ...(a.listDays !== undefined ? { list_days: a.listDays } : {}),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  const empty = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => MEALS.map((meal) => ({ day, meal, dish_id: null, side_id: null, salad_id: null, simple: null })));
  const src = a.template === null ? empty : await db.template_slots.where('template_id').equals(a.template).toArray();
  // A half-downloaded template would make a week with holes nobody chose; the server refuses to approve those.
  if (src.length < 28) throw new Error('template_not_loaded');
  await writeWeekLocal(db, week, src.map((s) => ({
    week_id: week.id, household_id: a.household, day: s.day, meal: s.meal,
    dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple,
  })));
  await regenerateWeekList(db, week.id);
  return week;
}

export async function voteWeek(db: LocalDb, week: Week, member: Member, value: 'yes' | 'changes', comment = '') {
  await writeLocal(db, 'votes', [{ week_id: week.id, member_id: member.id, household_id: week.household_id, value, comment }]);
}

export async function approveWeek(db: LocalDb, week: Week, parent: Member) {
  await writeLocal(db, 'weeks', [{ ...week, status: 'approved', approved_by: parent.id }]);
  await regenerateWeekList(db, week.id);
}

// What a week's shopping list holds right after it was built: lines from the menu and their rough cost.
export async function weekListStats(db: LocalDb, weekId: string): Promise<{ count: number; cost: number }> {
  const items = (await db.shopping_items.where('week_id').equals(weekId).toArray()).filter((i) => i.source === 'menu' && !i.deleted_at);
  return { count: items.length, cost: items.reduce((sum, i) => sum + (i.est_price ?? 0), 0) };
}

// The days from today to Sunday, for a week set after its Monday; the whole week otherwise.
export const daysFrom = (day: number): number[] | null => (day > 0 ? [0, 1, 2, 3, 4, 5, 6].filter((d) => d >= day) : null);

export async function setListDays(db: LocalDb, week: Week, days: number[] | null) {
  await writeLocal(db, 'weeks', [{ ...week, list_days: days && days.length < 7 ? [...days].sort((x, y) => x - y) : null }]);
  await regenerateWeekList(db, week.id);
}
