import { useState, type FormEvent } from 'react';
import { parseRub, rubOk } from './boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { putIn, removeWish, saveWish, takeBack, wishDone } from './boardActions';
import type { Deposit, Wish } from './types';
import DepositHistory from './DepositHistory';
import SeenBy from './SeenBy';
import PhotoField, { Photo } from '../shell/PhotoField';
import { useFeature } from '../../data/useFeature';
import { dropOldPhoto, photoPathFor, type PhotoEdit } from '../../lib/photos';


// A new wish, or an open one: its piggy bank, «Сбылось», edit and delete for the owner and parents.
export default function WishSheet({ me, members, db, wish, deposits = [], banked, ready = false, onClose }: {
  me: Member; members: Member[]; db: LocalDb; wish: Wish | null; deposits?: Deposit[]; banked?: number; ready?: boolean; onClose: () => void;
}) {
  const toast = useToast();
  const parent = me.role === 'parent';
  const canEdit = !wish || wish.owner_id === me.id || parent;
  const [editing, setEditing] = useState(!wish);
  const [title, setTitle] = useState(wish?.title ?? '');
  const [price, setPrice] = useState(wish?.price ? String(wish.price) : '');
  const [owner, setOwner] = useState(wish?.owner_id ?? me.id);
  const [sum, setSum] = useState('');
  const hasPhotos = useFeature(db, 'photos');
  const hasSeen = useFeature(db, 'visibility');
  const [id] = useState(() => wish?.id ?? crypto.randomUUID());
  const [photo, setPhoto] = useState<PhotoEdit>({ kind: 'keep' });
  const [seen, setSeen] = useState<string[] | null>(wish?.visible_to ?? null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    let photo_path: string | null | undefined;
    // The wish itself waits offline in the outbox; a new photo has to reach the server first.
    try { photo_path = hasPhotos ? await photoPathFor(me.household_id, 'wishes', id, photo) : undefined; } catch {
      toast({ text: 'Не получилось загрузить фото: нужен интернет. Попробуйте ещё раз.' });
      setBusy(false);
      return;
    }
    await saveWish(db, me, { id, owner_id: owner, title, price: parseRub(price), photo_path, ...(hasSeen ? { visible_to: seen } : {}) }, wish ?? undefined);
    await dropOldPhoto(wish?.photo_path, photo_path);
    toast({ text: wish ? 'Хотелка сохранена' : 'Хотелка на доске' });
    onClose();
  };
  // With deposits anyone in the family can chip in; before them only the owner and parents change the wish.
  const canPut = ready || canEdit;
  if (wish && !editing) {
    const inBank = banked ?? wish.saved;
    return (
      <Sheet title={wish.title} sub={wish.price ? `${rub(wish.price)} · в копилке ${rub(inBank)}` : `в копилке ${rub(inBank)}`} onClose={onClose}
        actions={canEdit ? <div className="btns fill"><button type="button" className="btn soft" onClick={() => setEditing(true)}>Изменить</button><button type="button" className="btn" onClick={async () => { await wishDone(db, wish); toast({ text: `«${wish.title}» сбылось!` }); onClose(); }}>Сбылось</button></div> : undefined}>
        <Photo path={wish.photo_path} className="sheet-photo" />
        {canPut ? (
          <form className="inline-add" style={{ margin: '0 16px' }} onSubmit={async (e) => { e.preventDefault(); const n = parseRub(sum); if (!n) return; await putIn(db, me, { wish }, n, ready); toast({ text: `В копилку +${rub(n)}` }); onClose(); }}>
            <label className="field">Положить в копилку, ₽<input inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="1000" /></label>
            <button type="submit" className="btn soft" disabled={!parseRub(sum)}>Положить</button>
          </form>
        ) : <p className="note" style={{ margin: '0 16px 16px' }}>Копилку ведёт {members.find((m) => m.id === wish.owner_id)?.name ?? 'владелец'} и родители.</p>}
        <div style={{ margin: '0 16px' }}><DepositHistory me={me} members={members} deposits={deposits} onTakeBack={async (d) => { await takeBack(db, d); toast({ text: `Взнос ${rub(d.amount)} убран` }); }} /></div>
        {canEdit ? <button type="button" className="more" style={{ margin: '8px 16px 16px' }} onClick={async () => { await removeWish(db, wish); toast({ text: 'Хотелка удалена' }); onClose(); }}>Удалить хотелку</button> : null}
      </Sheet>
    );
  }
  return (
    <Sheet title={wish ? 'Изменить хотелку' : 'Новая хотелка'} onClose={onClose} keepOnBackdrop={!!title.trim()}
      actions={<button type="submit" form="wish-form" className="btn" disabled={!title.trim() || !rubOk(price) || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
      <form id="wish-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Что хочется<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus placeholder="Например, велосипед" /></label>
        <label className="field">Сколько стоит, ₽<input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Можно не писать" /></label>
        {hasPhotos ? <PhotoField path={wish?.photo_path} value={photo} onChange={setPhoto} /> : null}
        {parent ? (
          <fieldset className="kin-pick">
            <legend>Чья</legend>
            <div className="picks">{members.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>{m.id === me.id ? 'Моя' : m.name}</button>)}</div>
          </fieldset>
        ) : null}
        {hasSeen ? <SeenBy me={me} members={members} value={seen} onChange={setSeen} /> : null}
      </form>
    </Sheet>
  );
}
