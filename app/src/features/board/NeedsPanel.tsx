import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { LocalDb } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { needState, sendNeedToShop } from './needToShop';
import NeedSheet from './NeedSheet';
import type { BoardData } from './useBoard';
import type { Need } from './types';
import { seenLine } from './SeenBy';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const by = (d: string) => { const [, mo, day] = d.split('-').map(Number); return `к ${day} ${MONTHS[mo - 1]}`; };

export default function NeedsPanel({ me, members, db, data, adding, onAdded }: { me: Member; members: Member[]; db: LocalDb; data: BoardData; adding: boolean; onAdded: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<Need | null>(null);
  const shop = useLiveQuery(async () => {
    const ids = data.needs.map((n) => `n:${n.id}`);
    const [items, marks] = await Promise.all([db.shopping_items.bulkGet(ids), db.shopping_marks.bulkGet(ids)]);
    return { items: new Map(items.filter(Boolean).map((i) => [i!.id, i!])), marks: new Map(marks.filter(Boolean).map((m) => [m!.item_id, m!])) };
  }, [db, data.needs]);
  const rows = data.needs.map((n) => ({ n, state: shop ? needState(n, shop.items, shop.marks) : 'todo' as const }));
  const todo = rows.filter((r) => r.state !== 'bought');
  const bought = rows.filter((r) => r.state === 'bought');
  const line = (n: Need, state: string) => {
    const who = members.find((m) => m.id === n.for_id);
    const sub = [who ? who.name : 'для дома', n.note, n.due_on ? by(n.due_on) : '', n.price ? `≈ ${rub(n.price)}` : '', seenLine(n.visible_to, members) ?? ''].filter(Boolean).join(' · ');
    return (
      <div className={`row ${state === 'bought' ? 'done' : ''}`} key={n.id}>
        <button type="button" className="row-btn" aria-label={`${n.title}, изменить`} onClick={() => setOpen(n)}>
          <span className="av sm" style={{ ['--c' as string]: memberColor(who?.color ?? '#8A8F9C') }} aria-hidden="true">{who ? <AvatarFace member={who} /> : <Icon name="home" />}</span>
          <span className="row-main"><b>{n.title}</b><small>{sub}</small></span>
        </button>
        {state === 'todo' ? (
          <button type="button" className="btn soft sm need-btn" aria-label={`${n.title}: в покупки`} onClick={async () => {
            const r = await sendNeedToShop(db, me, n, who?.name ?? null);
            toast({ text: r === 'added' ? `«${n.title}» в списке покупок` : 'Уже в списке покупок', action: { label: 'К покупкам', to: '/shop' } });
          }}><Icon name="cart" />В покупки</button>
        ) : null}
        {/* Already on the list: says so and leads there. */}
        {state === 'in-shop' ? <Link className="more need-in-shop" to="/shop" aria-label={`${n.title}: в покупках, открыть список`}><Icon name="check" />В покупках</Link> : null}
      </div>
    );
  };
  return (
    <>
      <section className="card">
        {todo.length ? todo.map((r) => line(r.n, r.state)) : <p className="note" style={{ margin: 0 }}>Ничего не нужно. Одежду, обувь и вещи для дома добавляйте сюда — отсюда они попадут в покупки.</p>}
        {bought.length ? <details className="bought"><summary>Куплено · {bought.length}</summary>{bought.map((r) => line(r.n, r.state))}</details> : null}
      </section>
      {open || adding ? <NeedSheet me={me} members={members} db={db} need={open} onClose={() => { setOpen(null); onAdded(); }} /> : null}
    </>
  );
}
