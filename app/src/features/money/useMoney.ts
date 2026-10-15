// useMoney.ts
import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb } from '../../data/db';
import { MONEY_TABLES } from './types';

export function useMoney(db: LocalDb, h: string) {
  return useLiveQuery(async () => {
    const [payments, marks, entries, items, shopMarks, budgets, missing] = await Promise.all([
      // Deleted payments too: past months keep what was paid for them.
      db.payments.where('household_id').equals(h).toArray(),
      db.payment_marks.where('household_id').equals(h).toArray(),
      db.money_entries.where('household_id').equals(h).filter((e) => !e.deleted_at).toArray(),
      // Bought lines of the shopping list count as spending by themselves.
      db.shopping_items.where('household_id').equals(h).toArray(),
      db.shopping_marks.toArray(),
      db.budgets.where('household_id').equals(h).filter((b) => !b.deleted_at).toArray(),
      db.meta.get('missing_tables'),
    ]);
    // Budgets go to the server only once a full pull confirmed it has the table.
    const budgetsReady = Array.isArray(missing?.value) && !(missing.value as string[]).includes('budgets');
    return { payments, marks, entries, items, shopMarks: shopMarks.filter((m) => m.household_id === h), budgets, budgetsReady };
  }, [db, h]);
}

// Like the board: the tab waits for a full pull that confirmed the server has the money tables.
export function useMoneyReady(db: LocalDb): boolean {
  return useLiveQuery(async () => {
    const missing = (await db.meta.get('missing_tables'))?.value as string[] | undefined;
    return Array.isArray(missing) && !MONEY_TABLES.some((t) => missing.includes(t));
  }, [db]) ?? false;
}
