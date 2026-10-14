import { writeLocal, writeWeekLocal } from '../../data/sync';
import type { LocalDb, Week } from '../../data/db';
import type { Member } from '../family/useFamily';

export async function setWeekFromTemplate(db: LocalDb, a: { household: string; startsOn: string; template: string; status: 'proposed' | 'approved'; by: string; existing?: Week }): Promise<Week> {
  const week: Week = {
    id: a.existing?.id ?? crypto.randomUUID(),
    household_id: a.household,
    starts_on: a.startsOn,
    template_id: a.template,
    status: a.status,
    proposed_by: a.status === 'proposed' ? a.by : a.existing?.proposed_by ?? null,
    approved_by: a.status === 'approved' ? a.by : null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  const src = await db.template_slots.where('template_id').equals(a.template).toArray();
  // A half-downloaded template would make a week with empty days; the server refuses to approve those.
  if (src.length < 28) throw new Error('template_not_loaded');
  await writeWeekLocal(db, week, src.map((s) => ({
    week_id: week.id, household_id: a.household, day: s.day, meal: s.meal,
    dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple,
  })));
  return week;
}

export async function voteWeek(db: LocalDb, week: Week, member: Member, value: 'yes' | 'changes', comment = '') {
  await writeLocal(db, 'votes', [{ week_id: week.id, member_id: member.id, household_id: week.household_id, value, comment }]);
}

export async function approveWeek(db: LocalDb, week: Week, parent: Member) {
  await writeLocal(db, 'weeks', [{ ...week, status: 'approved', approved_by: parent.id }]);
}
