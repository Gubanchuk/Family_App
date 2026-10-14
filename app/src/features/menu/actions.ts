import { writeLocal } from '../../data/sync';
import type { LocalDb, Recipe, TemplateSlot, Week, WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Meal } from './week';

type Source = { fromSlot: TemplateSlot | WeekSlot } | { recipe: Recipe; sides: string[] };

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
}

export async function replaceDay(db: LocalDb, week: Week, day: number, src: Array<TemplateSlot | WeekSlot>) {
  await writeLocal(db, 'week_slots', src.map((s) => slotRow(week, day, s.meal, s)));
}
