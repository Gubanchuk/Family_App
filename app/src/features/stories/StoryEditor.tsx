import { useEffect, useReducer, useRef, useState, type PointerEvent } from 'react';
import Icon from '../shell/Icon';
import Sheet from '../menu/Sheet';
import StoryFrame, { OverlayView } from './StoryFrame';
import { EMOJIS, editor, initialEditor } from './editorState';
import { moved, overTrash, pinched, type Pt } from './gestures';
import { TEXT_COLORS, type Overlay, type TextStyle } from './types';
import { useBackClose } from '../../lib/backClose';

const STYLES: TextStyle[] = ['plain', 'box', 'glass'];
const STYLE_NAME: Record<TextStyle, string> = { plain: 'Без фона', box: 'На плашке', glass: 'На тёмном' };

type Drag = { id: string; start: Overlay; pts: Map<number, Pt>; first: Map<number, Pt>; moved: boolean };

// Captions and stickers over the picture: one finger moves, two scale and turn, the bin at the
// bottom removes; a tap on a caption reopens it for typing.
export default function StoryEditor({ kind, src, initial, status, publishLabel, error, onPublish, onClose }: {
  kind: 'photo' | 'video'; src: string | null; initial: Overlay[]; status: string; publishLabel: string; error: string;
  onPublish: (items: Overlay[]) => Promise<void>; onClose: () => void;
}) {
  const [s, dispatch] = useReducer(editor, initial, initialEditor);
  const [emoji, setEmoji] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [trash, setTrash] = useState<'off' | 'shown' | 'hot'>('off');
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  // A video plays silently on a loop while captions are placed over it.
  useEffect(() => { const v = video.current; if (v) { v.muted = true; v.loop = true; v.play().catch(() => {}); } }, [src]);
  const editing = s.items.find((o) => o.id === s.editing);

  const box = () => { const r = frame.current!.getBoundingClientRect(); return { r, w: r.width || 1, h: r.height || 1 }; };
  const down = (o: Overlay) => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    if (drag.current?.id === o.id) {
      drag.current.pts.set(e.pointerId, p);
      drag.current.first = new Map(drag.current.pts);
      drag.current.start = o;
      return;
    }
    drag.current = { id: o.id, start: o, pts: new Map([[e.pointerId, p]]), first: new Map([[e.pointerId, p]]), moved: false };
    dispatch({ t: 'select', id: o.id });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { r, w, h } = box();
    const keys = [...d.pts.keys()];
    if (keys.length >= 2) {
      const [a, b] = keys;
      dispatch({ t: 'patch', id: d.id, patch: pinched(d.start, d.first.get(a)!, d.first.get(b)!, d.pts.get(a)!, d.pts.get(b)!) });
      d.moved = true;
      return;
    }
    const f = d.first.get(keys[0])!;
    const p = d.pts.get(keys[0])!;
    if (Math.hypot(p.x - f.x, p.y - f.y) > 6) d.moved = true;
    if (!d.moved) return;
    dispatch({ t: 'patch', id: d.id, patch: moved(d.start, p.x - f.x, p.y - f.y, { w, h }) });
    setTrash(overTrash({ x: p.x - r.left, y: p.y - r.top }, { w, h }) ? 'hot' : 'shown');
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.pts.delete(e.pointerId);
    if (d.pts.size) { d.first = new Map(d.pts); d.start = s.items.find((o) => o.id === d.id) ?? d.start; return; }
    drag.current = null;
    const o = s.items.find((x) => x.id === d.id);
    if (trash === 'hot') dispatch({ t: 'remove', id: d.id });
    else if (!d.moved && o?.type === 'text') dispatch({ t: 'edit', id: d.id });
    setTrash('off');
  };

  const publish = async () => { setBusy(true); try { await onPublish(s.items); } finally { setBusy(false); } };
  const close = () => (s.items.length ? setLeaving(true) : onClose());
  // Back while typing a caption finishes the caption; otherwise it works like the cross.
  useBackClose(() => (editing ? dispatch({ t: 'done' }) : close()));

  return (
    <div className="story-layer se" role="dialog" aria-modal="true" aria-label="Сторис">
      <div ref={frame} className="se-frame" onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => dispatch({ t: 'select', id: null })}>
        <StoryFrame kind={kind} src={src} overlays={[]} videoRef={video}>
          {s.items.map((o) => (o.id === s.editing ? null : <OverlayView key={o.id} o={o} selected={o.id === s.selected} onPointerDown={down(o)} />))}
        </StoryFrame>
        {trash !== 'off' ? <span className={`se-trash${trash === 'hot' ? ' hot' : ''}`} aria-hidden="true">🗑</span> : null}
      </div>
      <div className="se-tools">
        <button type="button" className="sv-x" aria-label="Закрыть" onClick={close}><Icon name="x" /></button>
        <button type="button" className="sv-pill" aria-label="Надпись" onClick={() => dispatch({ t: 'add-text' })}>Aa</button>
        <button type="button" className="sv-pill" aria-label="Наклейка" onClick={() => setEmoji(true)}>☺</button>
      </div>
      <div className="sv-bottom se-bottom">
        {error ? <p className="se-error" role="alert">{error}</p> : null}
        <button type="button" className="btn se-publish" disabled={busy || !!error || !src} onClick={publish}>{busy && status ? status : publishLabel}</button>
      </div>
      {editing && editing.type === 'text' ? (
        <div className="se-type">
          <textarea aria-label="Текст надписи" autoFocus value={editing.text} maxLength={200}
            style={editing.style === 'box' ? { color: '#111111', background: editing.color } : { color: editing.color }}
            onChange={(e) => dispatch({ t: 'patch', id: editing.id, patch: { text: e.target.value } })} />
          <div className="se-colors">
            {TEXT_COLORS.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={editing.color === c} style={{ background: c }} onClick={() => dispatch({ t: 'patch', id: editing.id, patch: { color: c } })} />)}
          </div>
          <div className="se-row">
            <button type="button" className="sv-pill" onClick={() => dispatch({ t: 'patch', id: editing.id, patch: { style: STYLES[(STYLES.indexOf(editing.style) + 1) % STYLES.length] } })}>{STYLE_NAME[editing.style]}</button>
            <button type="button" className="sv-pill" onClick={() => dispatch({ t: 'done' })}>Готово</button>
          </div>
        </div>
      ) : null}
      {emoji ? (
        <Sheet title="Наклейки" onClose={() => setEmoji(false)}>
          <div className="se-emojis">
            {EMOJIS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { dispatch({ t: 'add-emoji', char: c }); setEmoji(false); }}>{c}</button>)}
          </div>
        </Sheet>
      ) : null}
      {leaving ? (
        <Sheet title="Выйти без публикации?" sub="Надписи и наклейки пропадут." onClose={() => setLeaving(false)}
          actions={<div className="btns fill"><button type="button" className="btn soft" onClick={() => setLeaving(false)}>Остаться</button><button type="button" className="btn" onClick={onClose}>Выйти без публикации</button></div>}>
          <span />
        </Sheet>
      ) : null}
    </div>
  );
}
