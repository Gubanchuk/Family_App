import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { localDb, type LocalDb } from './db';
import { loadContent } from './content';
import { pendingCount, rejectionText, syncNow } from './sync';

type SyncState = { syncing: boolean; offline: boolean; pending: number; syncedAt: string | null; message: string };
type Ctx = SyncState & { syncNow: () => Promise<void> };
const SyncContext = createContext<Ctx>({ syncing: false, offline: false, pending: 0, syncedAt: null, message: '', syncNow: async () => {} });
export const useSync = () => useContext(SyncContext);

export function SyncProvider({ householdId, children, client = supabase, db = localDb }: { householdId: string; children: ReactNode; client?: SupabaseClient; db?: LocalDb }) {
  const [state, setState] = useState<SyncState>({ syncing: false, offline: false, pending: 0, syncedAt: null, message: '' });
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, syncing: true }));
    try {
      await loadContent(db, client);
      const r = await syncNow(db, client);
      const syncedAt = ((await db.meta.get('synced_at'))?.value as string | undefined) ?? null;
      setState({ syncing: false, offline: r.offline, pending: await pendingCount(db), syncedAt, message: r.rejected.length ? rejectionText(r.rejected[0]) : '' });
    } catch {
      setState((s) => ({ ...s, syncing: false }));
    } finally {
      running.current = false;
    }
  }, [client, db]);

  useEffect(() => {
    run();
    const onOnline = () => { run(); };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60_000);
    const channel = client.channel(`family-${householdId}`);
    for (const table of ['weeks', 'week_slots', 'votes']) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` } as never, () => { run(); });
    }
    channel.subscribe();
    return () => { window.removeEventListener('online', onOnline); window.clearInterval(timer); client.removeChannel(channel); };
  }, [client, householdId, run]);

  return <SyncContext.Provider value={{ ...state, syncNow: run }}>{children}</SyncContext.Provider>;
}
