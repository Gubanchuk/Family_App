import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useSync } from '../../data/SyncProvider';
import type { Member } from '../family/useFamily';
import { cleanupStories, loadStories, markViewed, setReaction, storyUrls } from './storiesApi';
import { firstUnseen, groupsFrom, liveStories, ringOf, seenBy } from './order';
import { StoriesContext } from './storiesContext';
import StoryViewer from './StoryViewer';
import type { Story, StoryView } from './types';

export default function StoriesProvider({ me, members, children }: { me: Member; members: Member[]; children: ReactNode }) {
  const { syncedAt } = useSync();
  const h = me.household_id;
  const [data, setData] = useState<{ stories: Story[]; views: StoryView[] } | null>(null);
  const [available, setAvailable] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<string | null>(null);

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
    openViewer: (memberId: string) => setViewer(memberId),
    // Runs inside the tap, so the phone lets the file picker open.
    compose: () => input.current?.click(),
  }), [available, live, seen, me.id]);

  return (
    <StoriesContext.Provider value={value}>
      {children}
      <input ref={input} type="file" accept="image/*,video/*" hidden aria-label="Файл для сторис" onChange={(e) => { e.target.value = ''; }} />
      {viewer && data ? (
        <ViewerHost me={me} members={members} startId={viewer} stories={live} views={data.views} now={now}
          onClose={() => setViewer(null)} onChanged={reload} onCompose={() => { setViewer(null); input.current?.click(); }} />
      ) : null}
    </StoriesContext.Provider>
  );
}

function ViewerHost({ me, members, startId, stories, views, now, onClose, onChanged, onCompose }: {
  me: Member; members: Member[]; startId: string; stories: Story[]; views: StoryView[]; now: Date; onClose: () => void; onChanged: () => void; onCompose: () => void;
}) {
  // The queue is fixed when the viewer opens, so a story arriving meanwhile does not shift what is on screen.
  const [groups] = useState(() => groupsFrom([me.id, ...members.filter((m) => m.id !== me.id).map((m) => m.id)], stories, startId, seenBy(views, me.id), me.id));
  const [start] = useState(() => ({ g: 0, i: groups[0] && groups[0].memberId !== me.id ? firstUnseen(groups[0].stories, seenBy(views, me.id)) : 0 }));
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  const [mine, setMine] = useState<StoryView[]>([]);
  useEffect(() => { storyUrls(groups.flatMap((g) => g.stories)).then(setUrls).catch(() => setUrls(new Map())); }, [groups]);
  if (!urls || !groups.length) return null;
  // Reactions show at once; the server copy catches up on the next reload.
  const shown = [...views.filter((v) => !mine.some((x) => x.story_id === v.story_id && x.member_id === v.member_id)), ...mine];
  return (
    <StoryViewer groups={groups} start={start} me={me} members={members} views={shown} urls={urls} now={now} onClose={onClose}
      onViewed={(s) => { markViewed(s, me).catch(() => {}); }}
      onReact={(s, r) => {
        setMine((v) => [...v.filter((x) => x.story_id !== s.id), { story_id: s.id, member_id: me.id, viewed_at: new Date().toISOString(), reaction: r }]);
        setReaction(s, me, r).then(onChanged).catch(() => {});
      }}
      onOwn={{ viewers: () => {}, edit: () => {}, remove: () => {}, more: onCompose }} />
  );
}
