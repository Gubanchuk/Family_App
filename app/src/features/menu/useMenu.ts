import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, Recipe } from '../../data/db';
import { addDaysIso, mondayOf } from './week';

export function useMenu(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const nextStart = addDaysIso(start, 7);
  return useLiveQuery(async () => {
    const weekAt = (s: string) => db.weeks.where('[household_id+starts_on]').equals([householdId, s]).filter((w) => !w.deleted_at).first();
    const [week, nextWeek] = await Promise.all([weekAt(start), weekAt(nextStart)]);
    const slotsOf = async (id?: string) => (id ? db.week_slots.where('week_id').equals(id).toArray() : []);
    const [slots, nextSlots, nextVotes, recipes, templates] = await Promise.all([
      slotsOf(week?.id), slotsOf(nextWeek?.id),
      nextWeek ? db.votes.where('week_id').equals(nextWeek.id).toArray() : Promise.resolve([]),
      db.recipes.toArray(),
      db.week_templates.filter((t) => !t.deleted_at && (t.household_id === null || t.household_id === householdId)).toArray(),
    ]);
    const weekEnd = addDaysIso(start, 6);
    const offers = (await db.dish_offers.where('household_id').equals(householdId).toArray())
      .filter((o) => !o.deleted_at && o.status !== 'declined' && o.on_date >= start && o.on_date <= weekEnd);
    return {
      current: { start, week, slots },
      next: { start: nextStart, week: nextWeek, slots: nextSlots, votes: nextVotes },
      recipes: new Map<string, Recipe>(recipes.map((r) => [r.id, r])),
      offers,
      templates: templates.sort((a, b) => Number(a.household_id !== null) - Number(b.household_id !== null) || a.name.localeCompare(b.name, 'ru')),
    };
  }, [db, householdId, start]);
}
