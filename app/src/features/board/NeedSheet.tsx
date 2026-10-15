import { useState, type FormEvent } from 'react';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { removeNeed, saveNeed } from './boardActions';
import type { Need } from './types';

const toInt = (s: string) => { const n = Math.round(Number(s.replace(/\s/g, '').replace(',', '.'))); return Number.isFinite(n) && n > 0 ? n : null; };

export default function NeedSheet({ me, members, db, need, onClose }: { me: Member; members: Member[]; db: LocalDb; need: Need | null; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(need?.title ?? '');
  const [forId, setFor] = useState<string | null>(need ? need.for_id : null);
  const [note, setNote] = useState(need?.note ?? '');
  const [due, setDue] = useState(need?.due_on ?? '');
  const [price, setPrice] = useState(need?.price ? String(need.price) : '');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    await saveNeed(db, me, { id: need?.id, for_id: forId, title, note, due_on: due || null, price: toInt(price) }, need ?? undefined);
    toast({ text: need ? 'Сохранено' : `«${title.trim()}» на доске` });
    onClose();
  };
  return (
    <Sheet title={need ? 'Изменить' : 'Надо купить'} onClose={onClose} keepOnBackdrop={!!title.trim() && !need}
      actions={<button type="submit" form="need-form" className="btn" disabled={!title.trim()}>Сохранить</button>}>
      <form id="need-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Что купить<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus={!need} placeholder="Например, зимние ботинки" /></label>
        <fieldset className="kin-pick">
          <legend>Для кого</legend>
          <div className="picks">
            <button type="button" className="pick" aria-pressed={forId === null} onClick={() => setFor(null)}>Для дома</button>
            {members.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={forId === m.id} onClick={() => setFor(m.id)}>{m.name}</button>)}
          </div>
        </fieldset>
        <label className="field">Пометка<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={40} placeholder="Размер, рост, цвет" /></label>
        <label className="field">К какому числу<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="field">Примерно стоит, ₽<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Можно не писать" /></label>
        {need ? <button type="button" className="more" onClick={async () => { await removeNeed(db, need); toast({ text: 'Удалено' }); onClose(); }}>Удалить</button> : null}
      </form>
    </Sheet>
  );
}
