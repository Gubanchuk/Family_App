import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb } from '../../data/db';
import { BOARD_TABLES, type Deposit, type Goal, type Need, type Request, type Wish, type WishGift, type WishMetoo } from './types';
import { bankOf } from './boardMath';

export type BoardData = { wishes: Wish[]; metoo: WishMetoo[]; gifts: WishGift[]; needs: Need[]; goals: Goal[]; requests: Request[]; deposits: Deposit[]; bank: Map<string, number>; depositsReady: boolean };

const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export function useBoard(db: LocalDb, householdId: string): BoardData | undefined {
  return useLiveQuery(async () => {
    const [wishes, metoo, gifts, needs, goals, requests, deposits, missing] = await Promise.all([
      db.wishes.where('household_id').equals(householdId).toArray(),
      db.wish_metoo.where('household_id').equals(householdId).toArray(),
      db.wish_gifts.where('household_id').equals(householdId).toArray(),
      db.needs.where('household_id').equals(householdId).toArray(),
      db.goals.where('household_id').equals(householdId).toArray(),
      db.requests.where('household_id').equals(householdId).toArray(),
      db.deposits.where('household_id').equals(householdId).toArray(),
      db.meta.get('missing_tables'),
    ]);
    const live_deposits = live(deposits);
    // Deposits go to the server only once a full pull confirmed it has the table.
    const depositsReady = Array.isArray(missing?.value) && !(missing.value as string[]).includes('deposits');
    return { wishes: live(wishes), metoo: live(metoo), gifts: live(gifts), needs: live(needs), goals: live(goals), requests: live(requests), deposits: live_deposits, bank: bankOf(live_deposits), depositsReady };
  }, [db, householdId]);
}

// The board shows once a full pull confirmed the server has its tables. An install from before the
// board has synced_at but no missing_tables yet, and must not show the tab on that alone.
export function useBoardReady(db: LocalDb): boolean {
  return useLiveQuery(async () => {
    const missing = (await db.meta.get('missing_tables'))?.value as string[] | undefined;
    return Array.isArray(missing) && !BOARD_TABLES.some((t) => missing.includes(t));
  }, [db]) ?? false;
}
