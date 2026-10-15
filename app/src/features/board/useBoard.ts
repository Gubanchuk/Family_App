import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb } from '../../data/db';
import { BOARD_TABLES, type Goal, type Need, type Request, type Wish, type WishGift, type WishMetoo } from './types';

export type BoardData = { wishes: Wish[]; metoo: WishMetoo[]; gifts: WishGift[]; needs: Need[]; goals: Goal[]; requests: Request[] };

const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export function useBoard(db: LocalDb, householdId: string): BoardData | undefined {
  return useLiveQuery(async () => {
    const [wishes, metoo, gifts, needs, goals, requests] = await Promise.all([
      db.wishes.where('household_id').equals(householdId).toArray(),
      db.wish_metoo.where('household_id').equals(householdId).toArray(),
      db.wish_gifts.where('household_id').equals(householdId).toArray(),
      db.needs.where('household_id').equals(householdId).toArray(),
      db.goals.where('household_id').equals(householdId).toArray(),
      db.requests.where('household_id').equals(householdId).toArray(),
    ]);
    return { wishes: live(wishes), metoo: live(metoo), gifts: live(gifts), needs: live(needs), goals: live(goals), requests: live(requests) };
  }, [db, householdId]);
}

// The board shows once the server has its tables; before the migration sync reports them missing.
export function useBoardReady(db: LocalDb): boolean {
  return useLiveQuery(async () => {
    const synced = await db.meta.get('synced_at');
    const missing = ((await db.meta.get('missing_tables'))?.value as string[] | undefined) ?? [];
    return !!synced && !BOARD_TABLES.some((t) => missing.includes(t));
  }, [db]) ?? false;
}
