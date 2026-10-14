import { useEffect, useRef, useState, type PointerEvent } from 'react';
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

export default function StoryViewer({ groups, start, me, members, views, urls, now, onViewed, onReact, onClose, onOwn }: {
  groups: Group[]; start: { g: number; i: number }; me: Member; members: Member[]; views: StoryView[]; urls: Map<string, string>; now: Date;
  onViewed: (s: Story) => void; onReact: (s: Story, r: Reaction | null) => void; onClose: () => void; onOwn: Own;
}) {
  const [pos, setPos] = useState(start);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout>; held: boolean } | null>(null);
  const group = groups[pos.g];
  const story = group?.stories[pos.i];
  const author = members.find((m) => m.id === group?.memberId);
  const mine = story?.member_id === me.id;
  const myReaction = views.find((v) => v.story_id === story?.id && v.member_id === me.id)?.reaction ?? null;
  const seenCount = views.filter((v) => v.story_id === story?.id && v.member_id !== me.id).length;

  const go = (dir: 1 | -1) => {
    const next = step(pos, dir, groups);
    if (!next) { onClose(); return; }
    if (next.g !== pos.g || next.i !== pos.i) { setPos(next); setReady(false); setProgress(0); }
  };

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

  if (!story || !author) return null;

  const down = (e: PointerEvent) => {
    const t = setTimeout(() => { if (press.current) { press.current.held = true; setPaused(true); } }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t, held: false };
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.t);
    if (p.held) { setPaused(false); return; }
    if (e.clientY - p.y > 80) { onClose(); return; }
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <div className="story-layer" role="dialog" aria-modal="true" aria-label={`Сторис: ${author.name}`}>
      <StoryFrame key={story.id} kind={story.kind} src={urls.get(story.path) ?? null} overlays={story.overlays} videoRef={video} onReady={() => setReady(true)}>
        <div className="sv-tap" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; setPaused(false); }} />
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
    </div>
  );
}
