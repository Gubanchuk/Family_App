import { useState } from 'react';
import type { LocalDb } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { useToast } from '../shell/toastContext';
import { cancelRequest, setRequestDone } from './boardActions';
import { memberName } from './boardMath';
import { mineAsked, mineToDo, whenText } from './requestText';
import RequestSheet from './RequestSheet';
import type { BoardData } from './useBoard';
import type { Request } from './types';

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function RequestsPanel({ me, members, db, data, adding, onAdded }: { me: Member; members: Member[]; db: LocalDb; data: BoardData; adding: boolean; onAdded: () => void }) {
  const toast = useToast();
  const [cancel, setCancel] = useState<Request | null>(null);
  const today = todayIso();
  const face = (id: string) => {
    const m = members.find((x) => x.id === id);
    return <span className="av sm" style={{ ['--c' as string]: memberColor(m?.color ?? '#8A8F9C') }} aria-hidden="true">{m ? <AvatarFace member={m} /> : '?'}</span>;
  };
  const toMe = mineToDo(data.requests, me.id);
  const fromMe = mineAsked(data.requests, me.id);
  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Мне</h2></div>
        {toMe.length ? toMe.map((r) => {
          const done = r.status === 'done';
          return (
            <div className={`row ${done ? 'done' : ''}`} key={r.id}>
              <button type="button" className="row-btn" aria-pressed={done} aria-label={`${r.title}: ${done ? 'вернуть' : 'сделано'}`} onClick={async () => {
                await setRequestDone(db, r, !done);
                if (!done) toast({ text: `Готово: ${r.title}. ${memberName(members, r.from_id)} узнает.` });
              }}>
                <span className="check" aria-hidden="true"><Icon name="check" /></span>
                {face(r.from_id)}
                <span className="row-main"><b>{r.title}</b><small>{memberName(members, r.from_id)} · {whenText(r.due_on, today)}</small></span>
                {r.urgent && !done ? <span className="pill">срочно</span> : null}
              </button>
            </div>
          );
        }) : <p className="note" style={{ margin: 0 }}>Вас ни о чём не просили.</p>}
      </section>
      <section className="card">
        <div className="card-h"><h2>От меня</h2></div>
        {fromMe.length ? fromMe.map((r) => (
          <div className={`row ${r.status !== 'open' ? 'done' : ''}`} key={r.id}>
            {face(r.to_id)}
            <span className="row-main"><b>{r.title}</b><small>{memberName(members, r.to_id)} · {r.status === 'done' ? 'сделано' : r.status === 'cancelled' ? 'отменено' : whenText(r.due_on, today)}</small></span>
            {r.status === 'open' ? <button type="button" className="more" onClick={() => setCancel(r)}>Отменить</button> : null}
          </div>
        )) : <p className="note" style={{ margin: 0 }}>«Добавить» — и попросите кого-нибудь из семьи. Ему придёт уведомление.</p>}
      </section>
      {cancel ? (
        <RequestSheet.Cancel request={cancel} onNo={() => setCancel(null)} onYes={async () => { await cancelRequest(db, cancel); setCancel(null); toast({ text: 'Просьба отменена' }); }} />
      ) : null}
      {adding ? <RequestSheet me={me} members={members} db={db} onClose={onAdded} /> : null}
    </>
  );
}
