import { useState } from 'react';
import type { LocalDb } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { rub } from '../shop/build';
import { giftLine, memberName, progress } from './boardMath';
import { setGift, toggleMetoo } from './boardActions';
import type { BoardData } from './useBoard';
import WishSheet from './WishSheet';
import type { Wish } from './types';

export default function WishesPanel({ me, members, db, data, adding, onAdded }: { me: Member; members: Member[]; db: LocalDb; data: BoardData; adding: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState<Wish | null>(null);
  const parent = me.role === 'parent';
  const list = data.wishes.filter((w) => !w.done_at).sort((a, b) => (a.created_at ?? a.updated_at).localeCompare(b.created_at ?? b.updated_at));
  return (
    <>
      {list.length ? (
        <div className="wish-grid">
          {list.map((w) => {
            const owner = members.find((m) => m.id === w.owner_id);
            const metoo = data.metoo.filter((x) => x.wish_id === w.id);
            const mine = metoo.some((x) => x.member_id === me.id);
            const gift = data.gifts.find((g) => g.wish_id === w.id);
            const giver = gift ? members.find((m) => m.id === gift.giver_id) : undefined;
            return (
              <article className="wish" key={w.id}>
                <button type="button" className="wish-open" aria-label={`${w.title}, открыть`} onClick={() => setOpen(w)} />
                <div className="w-top">
                  <span className="av sm" style={{ ['--c' as string]: memberColor(owner?.color ?? '#888888') }} aria-hidden="true">{owner ? <AvatarFace member={owner} /> : '?'}</span>
                  {w.price ? <span className="amount">{rub(w.price)}</span> : null}
                </div>
                <b>{w.title}</b>
                {w.saved ? (
                  <>
                    <span className="bar" style={{ ['--h' as string]: memberColor(owner?.color ?? '#888888') }} aria-hidden="true"><i style={{ width: `${progress(w.saved, w.price) * 100}%` }} /></span>
                    <small>в копилке {rub(w.saved)}</small>
                  </>
                ) : <small>{memberName(members, w.owner_id)} хочет</small>}
                {parent && w.owner_id !== me.id ? (
                  gift ? <button type="button" className="secret" onClick={() => setGift(db, w, me, false)}><Icon name="gift" />{giftLine(giver)}</button>
                    : <button type="button" className="gift-ask" onClick={() => setGift(db, w, me, true)}><Icon name="gift" />Беру в подарок</button>
                ) : null}
                {w.owner_id !== me.id ? (
                  <button type="button" className="btn soft sm" aria-pressed={mine} onClick={() => toggleMetoo(db, w, me, !mine)}><Icon name="metoo" />Я тоже · {metoo.length}</button>
                ) : <small>тоже хотят: {metoo.length}</small>}
              </article>
            );
          })}
        </div>
      ) : <section className="card"><p className="note" style={{ margin: 0 }}>Хотелок пока нет. «Добавить» — и семья узнает, о чём вы мечтаете.</p></section>}
      {open || adding ? <WishSheet me={me} members={members} db={db} wish={open} onClose={() => { setOpen(null); onAdded(); }} /> : null}
    </>
  );
}
