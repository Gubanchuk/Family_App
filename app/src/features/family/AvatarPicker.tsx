import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import AvatarFace from './AvatarFace';
import { memberColor } from './colors';
import { clampCrop, type AvatarCrop } from '../../lib/image';

export type PhotoChoice = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: File; crop: AvatarCrop };

const VIEW = 200;

// The circle shows what will be saved: drag to move the picture, the slider to zoom.
export default function AvatarPicker({ name, color, avatarPath, value, onChange }: {
  name: string; color: string; avatarPath: string | null | undefined; value: PhotoChoice; onChange: (p: PhotoChoice) => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const file = value.kind === 'new' ? value.file : null;
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setSize(null);
    onChange({ kind: 'new', file: f, crop: { x: 0.5, y: 0.5, zoom: 1 } });
  };
  const crop = value.kind === 'new' ? value.crop : null;
  const set = (c: AvatarCrop) => { if (value.kind === 'new' && size) onChange({ ...value, crop: clampCrop(size.w, size.h, c) }); };
  const scale = size && crop ? (VIEW * crop.zoom) / Math.min(size.w, size.h) : 1;
  const down = (e: PointerEvent<HTMLDivElement>) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !crop || !size) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    set({ ...crop, x: crop.x - dx / (size.w * scale), y: crop.y - dy / (size.h * scale) });
  };

  return (
    <div className="avatar-pick">
      {value.kind === 'new' && src ? (
        <>
          <div className="crop" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
            <img src={src} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={size && crop ? { width: size.w * scale, height: size.h * scale, left: VIEW / 2 - crop.x * size.w * scale, top: VIEW / 2 - crop.y * size.h * scale } : { visibility: 'hidden' }} />
          </div>
          <label className="field">Приблизить
            <input type="range" min={1} max={4} step={0.01} value={crop?.zoom ?? 1} onChange={(e) => crop && set({ ...crop, zoom: Number(e.target.value) })} />
          </label>
        </>
      ) : (
        <span className="av xl" style={{ ['--c' as string]: memberColor(color) }} aria-hidden="true">
          {value.kind === 'remove' ? name.slice(0, 1) : <AvatarFace member={{ name, avatar_path: avatarPath }} />}
        </span>
      )}
      <div className="btns">
        <label className="btn soft sm">Выбрать фото<input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {value.kind === 'new' || (avatarPath && value.kind === 'keep') ? (
          <button type="button" className="btn soft sm" onClick={() => onChange(value.kind === 'new' && !avatarPath ? { kind: 'keep' } : { kind: 'remove' })}>Убрать фото</button>
        ) : null}
      </div>
    </div>
  );
}
