import { useEffect, useMemo } from 'react';
import Icon from './Icon';
import { usePhotoUrl } from '../family/avatarUrls';
import type { PhotoEdit } from '../../lib/photos';

// The record's photo as it will be saved: the picked file, the stored one, or an empty place to add one.
export default function PhotoField({ path, value, onChange }: { path: string | null | undefined; value: PhotoEdit; onChange: (v: PhotoEdit) => void }) {
  const file = value.kind === 'new' ? value.file : null;
  const local = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  const stored = usePhotoUrl(value.kind === 'keep' ? path : null);
  const src = local ?? (value.kind === 'keep' ? stored : null);
  const has = value.kind === 'new' || (value.kind === 'keep' && !!path);
  const input = <input type="file" accept="image/*" hidden aria-label={has ? 'Заменить фото' : 'Добавить фото'} onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange({ kind: 'new', file: f }); e.target.value = ''; }} />;
  if (!has) return <label className="photo-add"><Icon name="plus" />Добавить фото{input}</label>;
  return (
    <div className="photo-field">
      {src ? <img src={src} alt="" /> : <span className="photo-wait" aria-hidden="true" />}
      <div className="btns">
        <label className="btn soft sm">Заменить{input}</label>
        <button type="button" className="btn soft sm" onClick={() => onChange(value.kind === 'new' && !path ? { kind: 'keep' } : { kind: 'remove' })}>Убрать фото</button>
      </div>
    </div>
  );
}

// A stored photo, or nothing while there is none (or no link yet).
export function Photo({ path, className }: { path: string | null | undefined; className?: string }) {
  const src = usePhotoUrl(path);
  return path && src ? <img className={className} src={src} alt="" loading="lazy" /> : null;
}
