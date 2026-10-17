import { useLiveQuery } from 'dexie-react-hooks';
import type { LocalDb } from './db';
import type { Feature } from './sync';

// True once a sync found the column behind the feature on the server (see COLUMN_FEATURES).
export function useFeature(db: LocalDb, f: Feature): boolean {
  return useLiveQuery(async () => ((await db.meta.get('features'))?.value as Feature[] | undefined)?.includes(f) ?? false, [db, f]) ?? false;
}
