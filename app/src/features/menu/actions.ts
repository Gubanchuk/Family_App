import { writeLocal } from '../../data/sync';
import { regenerateWeekList } from '../shop/menuList';
import { cancelOffer } from '../ideas/offerActions';
import type { DishOffer, LocalDb, Recipe, TemplateSlot, Week, WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Meal } from './week';

type Parts = Pick<WeekSlot, 'dish_id' | 'side_id' | 'salad_id' | 'simple'>;
export type Source = { fromSlot: Parts } | { recipe: Recipe; sides: string[] };
// A meal nobody cooks: it stays in the week as «Не выбрано» and buys nothing.
export const NO_MEAL: Parts = { dish_id: null, side_id: null, salad_id: null, simple: null };

const slotRow = (week: Week, day: number, meal: Meal, s: Pick<WeekSlot, 'dish_id' | 'side_id' | 'salad_id' | 'simple'>) => ({
  week_id: week.id, household_id: week.household_id, day, meal,
  dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple,
});

export const canEditWeek = (me: Member, week: Week) => me.role === 'parent' || week.status !== 'approved';

export async function replaceMeal(db: LocalDb, week: Week, day: number, meal: Meal, src: Source) {
  const s = 'fromSlot' in src
    ? src.fromSlot
    : { dish_id: src.recipe.id, side_id: meal === 'dinner' ? src.sides[0] ?? null : null, salad_id: null, simple: null };
  await writeLocal(db, 'week_slots', [slotRow(week, day, meal, s)]);
  await regenerateWeekList(db, week.id);
}

// Puts a dish on a meal, or clears it with NO_MEAL. A dish someone took «instead» of this meal goes too,
// or it would still stand over the new choice. Returns the way back for «Отменить».
export async function changeMeal(db: LocalDb, week: Week, day: number, meal: Meal, src: Source, swap?: DishOffer): Promise<() => Promise<void>> {
  const before = await db.week_slots.get([week.id, day, meal]);
  const undoSwap = swap ? await cancelOffer(db, swap) : null;
  await replaceMeal(db, week, day, meal, src);
  return async () => {
    await replaceMeal(db, week, day, meal, { fromSlot: before ?? NO_MEAL });
    await undoSwap?.();
  };
}

export async function replaceDay(db: LocalDb, week: Week, day: number, src: Array<TemplateSlot | WeekSlot>) {
  await writeLocal(db, 'week_slots', src.map((s) => slotRow(week, day, s.meal, s)));
  await regenerateWeekList(db, week.id);
}
