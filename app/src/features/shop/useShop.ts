import { useLiveQuery } from 'dexie-react-hooks';
import type { DishOffer, HomeStock, LocalDb, Recipe, ShoppingItem, ShoppingMark } from '../../data/db';
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
    const offers = new Map((await db.dish_offers.where('household_id').equals(householdId).toArray()).map((o) => [o.id, o]));
    // Recipe names of offered dishes, so a line for one can say which dish it is for.
    const dishes = new Map((await db.recipes.bulkGet([...new Set([...offers.values()].map((o) => o.dish_id))])).filter((r): r is Recipe => !!r).map((r) => [r.id, r.name]));
    const trips = (await db.shop_trips.where('household_id').equals(householdId).toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const stock = (await db.home_stock.where('household_id').equals(householdId).toArray()).filter((s) => !s.deleted_at) as HomeStock[];
    return { weeks, items, marks, offers, dishes, lastTrip: trips[0] ?? null, stock, start };
  }, [db, householdId, start]);
}

// Menu lines belong to one week; hand-added and offered lines show with any week.
// What a week's list shows: the week's menu lines, hand-added lines that are still to buy or were bought
// this week, and lines for dishes offered within the week (not declined). Older lines stay on the server.
export function visibleItems(items: ShoppingItem[], weekId: string | null, ctx: { weekStart: string; marks: Map<string, ShoppingMark>; offers: Map<string, DishOffer> }) {
  const weekEnd = addDaysIso(ctx.weekStart, 6);
  return items.filter((i) => {
    if (i.source === 'menu') return i.week_id === weekId;
    // A hand-added line, or one for a product that ran out at home, shows until it is closed, then through the week.
    if (i.source === 'manual' || i.source === 'home') { const m = ctx.marks.get(i.id); return !(m?.bought || m?.at_home) || m.updated_at >= ctx.weekStart; }
    const o = i.offer_id ? ctx.offers.get(i.offer_id) : undefined;
    return !!o && o.status !== 'declined' && !o.deleted_at && o.on_date >= ctx.weekStart && o.on_date <= weekEnd;
  });
}

export function groupByDept(items: ShoppingItem[], marks: Map<string, ShoppingMark>) {
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) groups.set(i.dept, [...(groups.get(i.dept) ?? []), i]);
  const done = (i: ShoppingItem) => Number(closed(marks.get(i.id)));
  return [...groups.entries()]
    .sort(([a], [b]) => deptRank(a) - deptRank(b))
    .map(([dept, list]) => ({ dept, items: list.sort((a, b) => done(a) - done(b) || Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title, 'ru')) }));
}

// A line is off the list when it is bought or kept «at home».
export const closed = (m: ShoppingMark | undefined) => !!(m?.bought || m?.at_home);
