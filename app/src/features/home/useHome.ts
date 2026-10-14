import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb, Recipe, ShoppingMark } from '../../data/db';
import { addDaysIso, dayOfWeek, mondayOf } from '../menu/week';
import { visibleItems } from '../shop/useShop';

export function useHome(db: LocalDb, householdId: string, today: Date) {
  const start = mondayOf(today);
  const todayIso = addDaysIso(start, dayOfWeek(today));
  return useLiveQuery(async () => {
    const week = await db.weeks.where('[household_id+starts_on]').equals([householdId, start]).filter((w) => !w.deleted_at).first();
    const slots = week ? await db.week_slots.where('week_id').equals(week.id).toArray() : [];
    const ids = [...new Set(slots.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]).filter((x): x is string => !!x))];
    const offers = (await db.dish_offers.where('household_id').equals(householdId).toArray()).filter((o) => !o.deleted_at && o.status !== 'declined' && o.on_date === todayIso);
    const recipes = new Map((await db.recipes.bulkGet([...ids, ...offers.map((o) => o.dish_id)])).filter((r): r is Recipe => !!r).map((r) => [r.id, r]));
    const all = (await db.shopping_items.where('household_id').equals(householdId).toArray()).filter((i) => !i.deleted_at);
    const marks = new Map((await db.shopping_marks.bulkGet(all.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
    const offerMap = new Map((await db.dish_offers.where('household_id').equals(householdId).toArray()).map((o) => [o.id, o]));
    const items = visibleItems(all, week?.status === 'approved' ? week.id : null, { weekStart: start, marks, offers: offerMap });
    return { week, slots, recipes, offers, items, marks, todayIso };
  }, [db, householdId, start, todayIso]);
}
