import { writeLocal } from '../../data/sync';
import type { LocalDb, Week, WeekSlot } from '../../data/db';

export async function saveWeekAsTemplate(db: LocalDb, week: Week, slots: WeekSlot[], name: string): Promise<string> {
  const id = `h-${crypto.randomUUID()}`;
  await writeLocal(db, 'week_templates', [{ id, household_id: week.household_id, name: name.trim(), season: ['any'], note: 'Своя неделя семьи', deleted_at: null }]);
  await writeLocal(db, 'template_slots', slots.map((s) => ({ template_id: id, day: s.day, meal: s.meal, dish_id: s.dish_id, side_id: s.side_id, salad_id: s.salad_id, simple: s.simple })));
  return id;
}
