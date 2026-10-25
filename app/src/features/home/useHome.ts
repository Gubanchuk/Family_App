import { useLiveQuery } from 'dexie-react-hooks';
import { bankOf } from '../board/boardMath';
import type { LocalDb, Recipe, ShoppingMark } from '../../data/db';
import { addDaysIso, dayOfWeek, mondayOf } from '../menu/week';
import { visibleItems } from '../shop/useShop';
import { tripLines } from '../shop/tripActions';

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
    // The family's next trip, whatever week its lines are from.
    const trip = tripLines(all, marks);
    // The board: requests and goals live there, Home shows what needs attention.
    const [requests, goals, wishes, payments, paymentMarks, deposits] = await Promise.all([
      db.requests.where('household_id').equals(householdId).filter((r) => !r.deleted_at).toArray(),
      db.goals.where('household_id').equals(householdId).filter((g) => !g.deleted_at).toArray(),
      db.wishes.where('household_id').equals(householdId).filter((w) => !w.deleted_at && !w.done_at).toArray(),
      // Money reaches parents' phones only; for a child these are empty.
      db.payments.where('household_id').equals(householdId).filter((p) => !p.deleted_at).toArray(),
      db.payment_marks.where('household_id').equals(householdId).toArray(),
      db.deposits.where('household_id').equals(householdId).toArray(),
    ]);
    return { week, slots, recipes, offers, items, trip, marks, todayIso, requests, goals, wishes, payments, paymentMarks, bank: bankOf(deposits) };
  }, [db, householdId, start, todayIso]);
}
