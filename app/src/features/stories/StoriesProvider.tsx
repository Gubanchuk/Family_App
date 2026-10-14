import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useSync } from '../../data/SyncProvider';
import type { Member } from '../family/useFamily';
import { cleanupStories, deleteStory, loadStories, markViewed, postStory, saveOverlays, setReaction, storyUrls } from './storiesApi';
import { firstUnseen, groupsFrom, liveStories, ringOf, seenBy } from './order';
import { StoriesContext } from './storiesContext';
import StoryViewer from './StoryViewer';
import StoryEditor from './StoryEditor';
import ViewersSheet from './ViewersSheet';
import Sheet from '../menu/Sheet';
import { useToast } from '../shell/toastContext';
import { kindOf, preparePhoto, prepareVideo } from './prepare';
import type { Overlay, Prepared, Story, StoryView } from './types';

type StoriesData = { stories: Story[]; views: StoryView[] };
// The last list is kept on the phone, so rings show at once and without network.
const cacheKey = (h: string) => `fa.stories.${h}`;
function cached(h: string): StoriesData | null {
  try { const raw = localStorage.getItem(cacheKey(h)); return raw ? (JSON.parse(raw) as StoriesData) : null; } catch { return null; }
}

export default function StoriesProvider({ me, members, children }: { me: Member; members: Member[]; children: ReactNode }) {
  const { syncedAt } = useSync();
  const h = me.household_id;
  const [data, setData] = useState<StoriesData | null>(() => cached(me.household_id));
  const [available, setAvailable] = useState(() => cached(me.household_id) !== null);
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [draft, setDraft] = useState<File | null>(null);
  const [edit, setEdit] = useState<Story | null>(null);

  const reload = useCallback(() => loadStories(h).catch(() => null).then((r) => {
    if (r === 'missing') { setAvailable(false); return; }
    if (r) {
      setAvailable(true);
      setData(r);
      try { localStorage.setItem(cacheKey(h), JSON.stringify(r)); } catch { /* storage unavailable */ }
    }
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
      <input ref={input} type="file" accept="image/*,video/*" hidden aria-label="Файл для сторис" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setDraft(f); }} />
      {viewer && data ? (
        <ViewerHost me={me} members={members} startId={viewer} stories={live} views={data.views} now={now}
          onClose={() => setViewer(null)} onChanged={reload} onCompose={() => { setViewer(null); input.current?.click(); }}
          onEdit={(s) => { setViewer(null); setEdit(s); }} />
      ) : null}
      {draft ? <ComposerHost key={`${draft.name}-${draft.size}-${draft.lastModified}`} me={me} file={draft} onDone={() => { setDraft(null); reload(); }} /> : null}
      {edit ? <CaptionHost story={edit} onDone={() => { setEdit(null); reload(); }} /> : null}
    </StoriesContext.Provider>
  );
}

function ViewerHost({ me, members, startId, stories, views, now, onClose, onChanged, onCompose, onEdit }: {
  me: Member; members: Member[]; startId: string; stories: Story[]; views: StoryView[]; now: Date; onClose: () => void; onChanged: () => void; onCompose: () => void; onEdit: (s: Story) => void;
}) {
  const toast = useToast();
  const [watch, setWatch] = useState<Story | null>(null);
  const [doomed, setDoomed] = useState<Story | null>(null);
  // The queue is fixed when the viewer opens, so a story arriving meanwhile does not shift what is on screen.
  const [groups] = useState(() => groupsFrom([me.id, ...members.filter((m) => m.id !== me.id).map((m) => m.id)], stories, startId, seenBy(views, me.id), me.id));
  const [start] = useState(() => ({ g: 0, i: groups[0] && groups[0].memberId !== me.id ? firstUnseen(groups[0].stories, seenBy(views, me.id)) : 0 }));
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  const [mine, setMine] = useState<StoryView[]>([]);
  useEffect(() => { storyUrls(groups.flatMap((g) => g.stories)).then(setUrls).catch(() => setUrls(new Map())); }, [groups]);
  if (!urls || !groups.length) return null;
  // Reactions show at once; the server copy catches up on the next reload.
  const shown = [...views.filter((v) => !mine.some((x) => x.story_id === v.story_id && x.member_id === v.member_id)), ...mine];
  const remove = async (s: Story) => {
    try {
      await deleteStory(s);
      toast({ text: 'Сторис удалена' });
      onChanged();
      onClose();
    } catch {
      toast({ text: 'Не получилось удалить. Проверьте интернет.' });
    }
  };
  return (
    <>
      <StoryViewer groups={groups} start={start} me={me} members={members} views={shown} urls={urls} now={now} onClose={onClose}
        onViewed={(s) => { markViewed(s, me).catch(() => {}); }}
        onReact={(s, r) => {
          setMine((v) => [...v.filter((x) => x.story_id !== s.id), { story_id: s.id, member_id: me.id, viewed_at: new Date().toISOString(), reaction: r }]);
          setReaction(s, me, r).then(onChanged).catch(() => {});
        }}
        onOwn={{ viewers: setWatch, edit: onEdit, remove: setDoomed, more: onCompose }} held={!!watch || !!doomed}>
      {watch ? <ViewersSheet story={watch} views={shown} members={members} onClose={() => setWatch(null)} /> : null}
      {doomed ? (
        <Sheet title="Удалить сторис?" sub="Её больше никто не увидит." onClose={() => setDoomed(null)}
          actions={<div className="btns fill"><button type="button" className="btn soft" onClick={() => setDoomed(null)}>Оставить</button>
            <button type="button" className="btn" onClick={() => remove(doomed)}>Удалить</button></div>}>
          <span />
        </Sheet>
      ) : null}
      </StoryViewer>
    </>
  );
}

function ComposerHost({ me, file, onDone }: { me: Member; file: File; onDone: () => void }) {
  const kind = kindOf(file);
  const toast = useToast();
  const src = useMemo(() => (kind ? URL.createObjectURL(file) : null), [file, kind]);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState('');
  const [sendError, setSendError] = useState('');
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  // The file is shrunk while captions are being added.
  const [job] = useState<Promise<Prepared> | null>(() => {
    if (!kind) return null;
    const p = kind === 'photo' ? preparePhoto(file) : prepareVideo(file, setProgress);
    p.catch((e: Error) => setFailed(e.message === 'refuse' ? 'Этот телефон не может сжать видео. Снимите до 30 секунд.' : kind === 'photo' ? 'Не получилось открыть фото.' : 'Не получилось подготовить видео.'));
    return p;
  });
  const publish = async (items: Overlay[]) => {
    if (!navigator.onLine) { setSendError('Нет интернета. Сторис отправится, когда нажмёте «Опубликовать» снова.'); return; }
    setSendError('');
    try {
      const p = await job!;
      await postStory(me, p, items);
      toast({ text: p.trimmed ? 'Сторис выложена. Видео обрезано до 30 секунд.' : 'Сторис выложена' });
      onDone();
    } catch {
      if (!failed) setSendError('Не получилось отправить. Проверьте интернет и нажмите «Опубликовать» снова.');
    }
  };
  const error = kind ? failed : 'Этот файл не фото и не видео.';
  const status = kind === 'video' && progress < 1 ? `Готовим видео… ${Math.round(progress * 100)}%` : 'Отправляем…';
  return <StoryEditor kind={kind ?? 'photo'} src={src} initial={[]} status={status} publishLabel="Опубликовать" error={error || sendError} onPublish={publish} onClose={onDone} />;
}

function CaptionHost({ story, onDone }: { story: Story; onDone: () => void }) {
  const toast = useToast();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    storyUrls([story]).then((m) => { setSrc(m.get(story.path) ?? null); if (!m.get(story.path)) setError('Нет интернета.'); }).catch(() => setError('Нет интернета.'));
  }, [story]);
  const save = async (items: Overlay[]) => {
    try {
      await saveOverlays(story, items);
      toast({ text: 'Надписи сохранены' });
      onDone();
    } catch {
      setError('Не получилось сохранить. Проверьте интернет.');
    }
  };
  return <StoryEditor kind={story.kind} src={src} initial={story.overlays} status="Сохраняем…" publishLabel="Сохранить" error={error} onPublish={save} onClose={onDone} />;
}
