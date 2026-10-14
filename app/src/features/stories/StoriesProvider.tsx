import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useSync } from '../../data/SyncProvider';
import type { Member } from '../family/useFamily';
import { cleanupStories, loadStories } from './storiesApi';
import { liveStories, ringOf, seenBy } from './order';
import { StoriesContext } from './storiesContext';
import type { Story, StoryView } from './types';

export default function StoriesProvider({ me, children }: { me: Member; members: Member[]; children: ReactNode }) {
  const { syncedAt } = useSync();
  const h = me.household_id;
  const [data, setData] = useState<{ stories: Story[]; views: StoryView[] } | null>(null);
  const [available, setAvailable] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => loadStories(h).catch(() => null).then((r) => {
    if (r === 'missing') { setAvailable(false); return; }
    if (r) { setAvailable(true); setData(r); }
  }), [h]);

  // Every finished sync re-reads the stories too.
  useEffect(() => { void reload(); }, [reload, syncedAt]);
  useEffect(() => { cleanupStories(h).catch(() => {}); }, [h]);
  // Rings follow the clock: a story that turns 24 hours old leaves within a minute.
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);
  // Its own channel: before the migration the tables are unknown, and that must not break family sync.
  useEffect(() => {
    const channel = supabase.channel(`stories-${h}`);
    for (const table of ['stories', 'story_views']) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${h}` } as never, () => { reload(); });
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [h, reload]);

  const live = useMemo(() => liveStories(data?.stories ?? [], now), [data, now]);
  const seen = useMemo(() => seenBy(data?.views ?? [], me.id), [data, me.id]);
  const value = useMemo(() => ({
    available,
    ringOf: (memberId: string) => ringOf(memberId, live, seen, me.id),
    openViewer: () => {},
    // Runs inside the tap, so the phone lets the file picker open.
    compose: () => input.current?.click(),
  }), [available, live, seen, me.id]);

  return (
    <StoriesContext.Provider value={value}>
      {children}
      <input ref={input} type="file" accept="image/*,video/*" hidden aria-label="Файл для сторис" onChange={(e) => { e.target.value = ''; }} />
    </StoriesContext.Provider>
  );
}
