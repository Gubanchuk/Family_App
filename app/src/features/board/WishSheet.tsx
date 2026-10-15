import { useState, type FormEvent } from 'react';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { addToWish, removeWish, saveWish, wishDone } from './boardActions';
import type { Wish } from './types';

const toInt = (s: string) => { const n = Math.round(Number(s.replace(/\s/g, '').replace(',', '.'))); return Number.isFinite(n) && n > 0 ? n : null; };

// A new wish, or an open one: its piggy bank, «Сбылось», edit and delete for the owner and parents.
export default function WishSheet({ me, members, db, wish, onClose }: { me: Member; members: Member[]; db: LocalDb; wish: Wish | null; onClose: () => void }) {
  const toast = useToast();
  const parent = me.role === 'parent';
  const canEdit = !wish || wish.owner_id === me.id || parent;
  const [editing, setEditing] = useState(!wish);
  const [title, setTitle] = useState(wish?.title ?? '');
  const [price, setPrice] = useState(wish?.price ? String(wish.price) : '');
  const [owner, setOwner] = useState(wish?.owner_id ?? me.id);
  const [sum, setSum] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    await saveWish(db, me, { id: wish?.id, owner_id: owner, title, price: toInt(price) }, wish ?? undefined);
    toast({ text: wish ? 'Хотелка сохранена' : 'Хотелка на доске' });
    onClose();
  };
  if (wish && !editing) {
    return (
      <Sheet title={wish.title} sub={wish.price ? `${rub(wish.price)} · в копилке ${rub(wish.saved)}` : undefined} onClose={onClose}
        actions={canEdit ? <div className="btns fill"><button type="button" className="btn soft" onClick={() => setEditing(true)}>Изменить</button><button type="button" className="btn" onClick={async () => { await wishDone(db, wish); toast({ text: `«${wish.title}» сбылось!` }); onClose(); }}>Сбылось</button></div> : undefined}>
        {canEdit ? (
          <form className="inline-add" style={{ margin: '0 16px' }} onSubmit={async (e) => { e.preventDefault(); const n = toInt(sum); if (!n) return; await addToWish(db, wish, n); toast({ text: `В копилку +${rub(n)}` }); onClose(); }}>
            <label className="field">Положить в копилку, ₽<input inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="1000" /></label>
            <button type="submit" className="btn soft" disabled={!toInt(sum)}>Положить</button>
          </form>
        ) : <p className="note" style={{ margin: '0 16px 16px' }}>Копилку ведёт {members.find((m) => m.id === wish.owner_id)?.name ?? 'владелец'} и родители.</p>}
        {canEdit ? <button type="button" className="more" style={{ margin: '8px 16px 16px' }} onClick={async () => { await removeWish(db, wish); toast({ text: 'Хотелка удалена' }); onClose(); }}>Удалить хотелку</button> : null}
      </Sheet>
    );
  }
  return (
    <Sheet title={wish ? 'Изменить хотелку' : 'Новая хотелка'} onClose={onClose} keepOnBackdrop={!!title.trim()}
      actions={<button type="submit" form="wish-form" className="btn" disabled={!title.trim()}>Сохранить</button>}>
      <form id="wish-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Что хочется<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus placeholder="Например, велосипед" /></label>
        <label className="field">Сколько стоит, ₽<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Можно не писать" /></label>
        {parent ? (
          <fieldset className="kin-pick">
            <legend>Чья</legend>
            <div className="picks">{members.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>{m.id === me.id ? 'Моя' : m.name}</button>)}</div>
          </fieldset>
        ) : null}
      </form>
    </Sheet>
  );
}
