import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import Icon from '../shell/Icon';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import StoryFrame from './StoryFrame';
import { ago, step, type Group } from './order';
import { REACTIONS, type Reaction, type Story, type StoryView } from './types';

const PHOTO_MS = 6000;
const HOLD_MS = 220;

type Own = { viewers: (s: Story) => void; edit: (s: Story) => void; remove: (s: Story) => void; more: () => void };

// children: sheets opened from the viewer («Кто посмотрел», «Удалить?»). They render inside the
// layer so they sit on top of the story, and the story waits while one is open (held).
export default function StoryViewer({ groups, start, me, members, views, urls, now, onViewed, onReact, onClose, onOwn, held = false, children }: {
  groups: Group[]; start: { g: number; i: number }; me: Member; members: Member[]; views: StoryView[]; urls: Map<string, string>; now: Date;
  onViewed: (s: Story) => void; onReact: (s: Story, r: Reaction | null) => void; onClose: () => void; onOwn: Own; held?: boolean; children?: ReactNode;
}) {
  const [wanted, setPos] = useState(start);
  // Ready and progress belong to one story: moving on starts the next one from zero.
  const [readyId, setReadyId] = useState<string | null>(null);
  const [pressed, setPaused] = useState(false);
  const paused = pressed || held;
  const [prog, setProg] = useState<{ id: string; p: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout>; held: boolean } | null>(null);
  // A story whose day ran out while the viewer was open is passed over, going the same way.
  const alive = (s: Story) => Date.parse(s.expires_at) > now.getTime();
  const settle = (p: { g: number; i: number } | null, dir: 1 | -1) => {
    let cur = p;
    while (cur && !alive(groups[cur.g].stories[cur.i])) {
      const further = step(cur, dir, groups);
      cur = further && (further.g !== cur.g || further.i !== cur.i) ? further : null;
    }
    return cur;
  };
  const pos = settle(wanted, 1);
  const group = pos ? groups[pos.g] : undefined;
  const story = pos ? group?.stories[pos.i] : undefined;
  const ready = !!story && readyId === story.id;
  const progress = story && prog?.id === story.id ? prog.p : 0;
  const setProgress = (p: number) => { if (story) setProg({ id: story.id, p }); };
  const author = members.find((m) => m.id === group?.memberId);
  const mine = story?.member_id === me.id;
  const myReaction = views.find((v) => v.story_id === story?.id && v.member_id === me.id)?.reaction ?? null;
  const seenCount = views.filter((v) => v.story_id === story?.id && v.member_id !== me.id).length;

  const go = (dir: 1 | -1) => {
    if (!pos) { onClose(); return; }
    const next = settle(step(pos, dir, groups), dir);
    if (!next) { onClose(); return; }
    if (next.g !== pos.g || next.i !== pos.i) setPos(next);
  };

  // Nothing left alive to show: the viewer closes itself.
  useEffect(() => { if (!pos) onClose(); }, [pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seen once it is actually on screen.
  useEffect(() => { if (ready && story && !mine) onViewed(story); }, [ready, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Photos run on a clock; videos report their own time.
  useEffect(() => {
    if (!ready || paused || !story || story.kind !== 'photo') return;
    const startAt = Date.now() - progress * PHOTO_MS;
    const t = window.setInterval(() => {
      const p = (Date.now() - startAt) / PHOTO_MS;
      if (p >= 1) { window.clearInterval(t); go(1); } else setProgress(p);
    }, 50);
    return () => window.clearInterval(t);
  }, [ready, paused, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = video.current;
    if (!v || story?.kind !== 'video') return;
    const tick = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
    const end = () => go(1);
    v.addEventListener('timeupdate', tick);
    v.addEventListener('ended', end);
    return () => { v.removeEventListener('timeupdate', tick); v.removeEventListener('ended', end); };
  }, [story?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = video.current;
    if (!v || !ready || story?.kind !== 'video') return;
    if (paused) { v.pause(); return; }
    v.muted = muted;
    // Sound first; a phone that refuses plays it silent and shows the sound button.
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  }, [ready, paused, muted, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story || !author || !group || !pos) return null;

  const down = (e: PointerEvent) => {
    const t = setTimeout(() => { if (press.current) { press.current.held = true; setPaused(true); } }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t, held: false };
  };
  // A finger that moves is a swipe, not a hold: the pause timer stops once it travels 10 px.
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (p && !p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.t);
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.t);
    setPaused(false);
    if (e.clientY - p.y > 80) { onClose(); return; }
    if (p.held) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <div className="story-layer" role="dialog" aria-modal="true" aria-label={`Сторис: ${author.name}`}>
      <StoryFrame key={story.id} kind={story.kind} src={urls.get(story.path) ?? null} overlays={story.overlays} videoRef={video} onReady={() => setReadyId(story.id)} onFail={() => go(1)}>
        <div className="sv-tap" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { press.current = null; setPaused(false); }} />
        <div className="sv-top">
          <div className="sv-bars">
            {group.stories.map((s, i) => <i key={s.id}><b style={{ width: `${i < pos.i ? 100 : i === pos.i ? progress * 100 : 0}%` }} /></i>)}
          </div>
          <div className="sv-who">
            <span className="av sm" style={{ ['--c' as string]: memberColor(author.color) }} aria-hidden="true"><AvatarFace member={author} /></span>
            <b>{author.name}</b><small>{ago(story.created_at, now)}</small>
            <button type="button" className="sv-x" aria-label="Закрыть" onClick={onClose}><Icon name="x" /></button>
          </div>
        </div>
        {muted && story.kind === 'video' ? <button type="button" className="sv-sound" onClick={() => setMuted(false)}>🔇 Включить звук</button> : null}
      </StoryFrame>
      {mine ? (
        <div className="sv-bottom">
          <button type="button" className="sv-pill" aria-label={`Посмотрели: ${seenCount}`} onClick={() => onOwn.viewers(story)}>👁 {seenCount}</button>
          <button type="button" className="sv-pill" onClick={() => onOwn.edit(story)}>Изменить надписи</button>
          <button type="button" className="sv-pill" onClick={onOwn.more}>Ещё сторис</button>
          <button type="button" className="sv-pill" aria-label="Удалить сторис" onClick={() => onOwn.remove(story)}>Удалить</button>
        </div>
      ) : (
        <div className="sv-bottom sv-react" role="group" aria-label="Реакции">
          {REACTIONS.map((r) => (
            <button key={r} type="button" aria-label={`Реакция ${r}`} aria-pressed={myReaction === r} onClick={() => onReact(story, myReaction === r ? null : r)}>{r}</button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
