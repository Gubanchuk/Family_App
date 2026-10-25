import { useState } from 'react';
import type { LocalDb } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import Icon from '../shell/Icon';
import { useToast } from '../shell/toastContext';
import { answerRequest, cancelRequest, setRequestDone } from './boardActions';
import { useFeature } from '../../data/useFeature';
import { memberName } from './boardMath';
import { answerText, changedMindWord, doneWord, mineAsked, mineToDo, takenText, whenText } from './requestText';
import RequestSheet from './RequestSheet';
import type { BoardData } from './useBoard';
import type { Request } from './types';

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function RequestsPanel({ me, members, db, data, adding, onAdded }: { me: Member; members: Member[]; db: LocalDb; data: BoardData; adding: boolean; onAdded: () => void }) {
  const toast = useToast();
  const [cancel, setCancel] = useState<Request | null>(null);
  const answers = useFeature(db, 'requestAnswers');
  const answer = async (r: Request, status: 'accepted' | 'declined' | 'open') => {
    await answerRequest(db, r, status);
    const from = memberName(members, r.from_id);
    toast({ text: status === 'open' ? `${from} снова ждёт вашего ответа.` : `${from} узнает: ${status === 'accepted' ? 'вы сделаете' : 'вы не можете'}.` });
  };
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
          // A new request is answered first; a declined one can still be taken.
          if (answers && (r.status === 'open' || r.status === 'declined')) {
            const no = r.status === 'declined';
            return (
              <div className={`row ask ${no ? 'declined' : ''}`} key={r.id}>
                {face(r.from_id)}
                <span className="row-main"><b>{r.title}</b><small>{memberName(members, r.from_id)} · {no ? 'вы ответили «Не могу»' : whenText(r.due_on, today)}{r.urgent && !no ? <span className="pill inline">срочно</span> : null}</small>
                  <span className="btns ask-btns">
                    {no ? <button type="button" className="btn soft sm" onClick={() => answer(r, 'accepted')}>Всё-таки сделаю</button> : (
                      <>
                        <button type="button" className="btn sm" aria-label={`${r.title}: хорошо`} onClick={() => answer(r, 'accepted')}><Icon name="check" />Хорошо</button>
                        <button type="button" className="btn soft sm" aria-label={`${r.title}: не могу`} onClick={() => answer(r, 'declined')}>Не могу</button>
                      </>
                    )}
                  </span>
                </span>
              </div>
            );
          }
          if (r.status === 'done') {
            return (
              <div className="row done" key={r.id}>
                <button type="button" className="row-btn" aria-pressed="true" aria-label={`${r.title}: вернуть`} onClick={() => setRequestDone(db, r, false, answers)}>
                  <span className="check" aria-hidden="true"><Icon name="check" /></span>
                  {face(r.from_id)}
                  <span className="row-main"><b>{r.title}</b><small>{memberName(members, r.from_id)} · сделано</small></span>
                </button>
              </div>
            );
          }
          // Taken (or simply asked, before the family answers requests): the tick says what it does, and a
          // taken request can go back to waiting for the answer.
          return (
            <div className="row ask" key={r.id}>
              {face(r.from_id)}
              <span className="row-main"><b>{r.title}</b><small>{memberName(members, r.from_id)} · {whenText(r.due_on, today)}{r.urgent ? <span className="pill inline">срочно</span> : null}</small>
                {answers ? <small className="req-taken">{takenText(me)}</small> : null}
                <span className="btns ask-btns">
                  <button type="button" className="btn sm" aria-label={`${r.title}: ${doneWord(me).toLowerCase()}`} onClick={async () => {
                    await setRequestDone(db, r, true, answers);
                    toast({ text: `Готово: ${r.title}. ${memberName(members, r.from_id)} узнает.` });
                  }}><Icon name="check" />{doneWord(me)}</button>
                  {answers ? <button type="button" className="btn soft sm" aria-label={`${r.title}: ${changedMindWord(me).toLowerCase()}`} onClick={() => answer(r, 'open')}>{changedMindWord(me)}</button> : null}
                </span>
              </span>
            </div>
          );
        }) : <p className="note" style={{ margin: 0 }}>Вас ни о чём не просили.</p>}
      </section>
      <section className="card">
        <div className="card-h"><h2>От меня</h2></div>
        {fromMe.length ? fromMe.map((r) => (
          <div className={`row ${r.status === 'done' || r.status === 'cancelled' ? 'done' : ''}`} key={r.id}>
            {face(r.to_id)}
            <span className="row-main"><b>{r.title}</b><small className={r.status === 'declined' ? 'said-no' : undefined}>{memberName(members, r.to_id)} · {answerText(r, today, answers)}</small></span>
            {r.status === 'open' || r.status === 'accepted' || r.status === 'declined' ? <button type="button" className="more" onClick={() => setCancel(r)}>Отменить</button> : null}
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
