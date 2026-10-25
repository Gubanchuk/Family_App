import { features } from '../../data/sync';
import type { LocalDb } from '../../data/db';
import { activeTrips } from './tripCart';

// The trip mark for a new line, once the server keeps it: in the trip while someone is in the shop (they want it
// now), or always (a product that ran out at home is for the next trip). Nothing before the column exists.
export async function tripMark(db: LocalDb, householdId: string, always = false, now = new Date()): Promise<{ in_trip?: boolean }> {
  if (!(await features(db)).has('tripList')) return {};
  if (always) return { in_trip: true };
  return { in_trip: activeTrips(await db.shop_trips.where('household_id').equals(householdId).toArray(), now).length > 0 };
}
