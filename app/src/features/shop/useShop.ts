import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import { addDaysIso, mondayOf } from '../menu/week';
import { deptRank } from './build';

export function useShop(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const next = addDaysIso(start, 7);
  return useLiveQuery(async () => {
    const weeks = (await db.weeks.where('household_id').equals(householdId).toArray())
      .filter((w) => !w.deleted_at && w.status === 'approved' && (w.starts_on === start || w.starts_on === next))
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const items = (await db.shopping_items.where('household_id').equals(householdId).toArray()).filter((i) => !i.deleted_at);
    const marks = new Map((await db.shopping_marks.bulkGet(items.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
    const trips = (await db.shop_trips.where('household_id').equals(householdId).toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at));
    return { weeks, items, marks, lastTrip: trips[0] ?? null };
  }, [db, householdId, start]);
}

// Menu lines belong to one week; hand-added and offered lines show with any week.
export const visibleItems = (items: ShoppingItem[], weekId: string | null) => items.filter((i) => i.source !== 'menu' || i.week_id === weekId);

export function groupByDept(items: ShoppingItem[], marks: Map<string, ShoppingMark>) {
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) groups.set(i.dept, [...(groups.get(i.dept) ?? []), i]);
  const done = (i: ShoppingItem) => Number(!!marks.get(i.id)?.bought);
  return [...groups.entries()]
    .sort(([a], [b]) => deptRank(a) - deptRank(b))
    .map(([dept, list]) => ({ dept, items: list.sort((a, b) => done(a) - done(b) || Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title, 'ru')) }));
}
