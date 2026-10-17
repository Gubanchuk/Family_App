import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { localDb, type LocalDb } from './db';
import { loadContent } from './content';
import { rejectionText, syncNow } from './sync';
import { withTimeout } from '../features/probe/checks';
import { refreshLists } from '../features/shop/menuList';

type SyncState = { syncing: boolean; offline: boolean; syncedAt: string | null; message: string };
type Ctx = SyncState & { pending: number; syncNow: () => Promise<void>; dismiss: () => void };
export const SyncContext = createContext<Ctx>({ syncing: false, offline: false, pending: 0, syncedAt: null, message: '', syncNow: async () => {}, dismiss: () => {} });
export const useSync = () => useContext(SyncContext);

const REALTIME = ['weeks', 'week_slots', 'votes', 'dish_offers', 'shopping_items', 'shopping_marks', 'shop_trips', 'not_eat'];
// Tables that came later get their own channel, opened once a pull has shown the server has them:
// before their migration an unknown table could break the family channel above.
const LATER = ['wishes', 'wish_metoo', 'wish_gifts', 'needs', 'goals', 'requests', 'payments', 'payment_marks', 'money_entries', 'deposits', 'budgets', 'home_stock'];

export function SyncProvider({ householdId, portions = 3.5, isParent = false, now, children, client = supabase, db = localDb, onSynced }: { householdId: string; portions?: number; isParent?: boolean; now?: Date; children: ReactNode; client?: SupabaseClient; db?: LocalDb; onSynced?: () => void }) {
  const [state, setState] = useState<SyncState>({ syncing: false, offline: false, syncedAt: null, message: '' });
  const pending = useLiveQuery(() => db.outbox.count(), [db]) ?? 0;
  const running = useRef(false);
  const again = useRef(false);
  // Kept in a ref: a new callback on every render must not restart syncing and resubscribe.
  const synced = useRef(onSynced);
  useEffect(() => { synced.current = onSynced; }, [onSynced]);

  const run = useCallback(async () => {
    // A call that arrives mid-run is remembered and served right after, not dropped.
    if (running.current) { again.current = true; return; }
    running.current = true;
    setState((s) => ({ ...s, syncing: true }));
    try {
      do {
        again.current = false;
        // A watchdog frees the next run even if something below never settles.
        await withTimeout((async () => {
          // Changes go out first: the weekly recipe download must not hold them back.
          const r = await syncNow(db, client);
          if (!r.offline) await loadContent(db, client);
          // A week approved or edited on another phone gets its shopping list here; parents keep the list.
          if (isParent) await refreshLists(db, householdId, now ?? new Date());
          const syncedAt = ((await db.meta.get('synced_at'))?.value as string | undefined) ?? null;
          setState((s) => ({ syncing: false, offline: r.offline, syncedAt, message: r.rejected.map(rejectionText).find(Boolean) ?? s.message }));
          // The family itself is not synced to the phone: someone who joined since the start is fetched here.
          if (!r.offline) synced.current?.();
        })(), 120_000);
      } while (again.current);
    } catch {
      setState((s) => ({ ...s, syncing: false }));
    } finally {
      running.current = false;
    }
  }, [client, db, householdId, isParent, now]);

  useEffect(() => { db.meta.put({ key: 'family_portions', value: portions }); }, [db, portions]);

  // A local change starts a sync shortly after, so it reaches the family before the phone is locked.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => { run(); }, 600);
    return () => window.clearTimeout(t);
  }, [pending, run]);

  useEffect(() => {
    run();
    const onOnline = () => { run(); };
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60_000);
    const channel = client.channel(`family-${householdId}`);
    for (const table of REALTIME) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` } as never, () => { run(); });
    }
    channel.subscribe();
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      client.removeChannel(channel);
    };
  }, [client, householdId, run]);

  const missing = useLiveQuery(async () => (await db.meta.get('missing_tables'))?.value as string[] | undefined, [db]);
  const later = Array.isArray(missing) ? LATER.filter((t) => !missing.includes(t)).join(',') : '';
  useEffect(() => {
    if (!later) return;
    const channel = client.channel(`family-more-${householdId}`);
    for (const table of later.split(',')) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` } as never, () => { run(); });
    }
    channel.subscribe();
    return () => { client.removeChannel(channel); };
  }, [client, householdId, later, run]);

  const dismiss = useCallback(() => setState((s) => ({ ...s, message: '' })), []);
  return <SyncContext.Provider value={{ ...state, pending, syncNow: run, dismiss }}>{children}</SyncContext.Provider>;
}
