import { useState, type FormEvent } from 'react';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { askFor } from './boardActions';
import type { Request } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function RequestSheet({ me, members, db, onClose }: { me: Member; members: Member[]; db: LocalDb; onClose: () => void }) {
  const toast = useToast();
  // Only someone with a login can receive a request and tick it.
  const people = members.filter((m) => m.id !== me.id && m.user_id);
  const [title, setTitle] = useState('');
  const [to, setTo] = useState(people[0]?.id ?? '');
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'date' | 'none'>('today');
  const [date, setDate] = useState('');
  const [urgent, setUrgent] = useState(false);
  const due = () => { const d = new Date(); if (when === 'today') return iso(d); if (when === 'tomorrow') { d.setDate(d.getDate() + 1); return iso(d); } return when === 'date' && date ? date : null; };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    await askFor(db, me, { to_id: to, title, due_on: due(), urgent });
    toast({ text: `${members.find((m) => m.id === to)?.name ?? 'Получатель'} получит просьбу` });
    onClose();
  };
  const pick = <T,>(v: T, cur: T, set: (v: T) => void, label: string) => <button type="button" className="pick" aria-pressed={v === cur} onClick={() => set(v)}>{label}</button>;
  if (!people.length) {
    return <Sheet title="Попросить" onClose={onClose}><p className="note" style={{ margin: '0 16px 16px' }}>Просить пока некого: позовите семью в Настройках, у каждого будет свой вход.</p></Sheet>;
  }
  return (
    <Sheet title="Попросить" onClose={onClose} keepOnBackdrop={!!title.trim()}
      actions={<button type="submit" form="request-form" className="btn" disabled={!title.trim() || !to || (when === 'date' && !date)}>Попросить</button>}>
      <form id="request-form" style={{ margin: '0 16px' }} onSubmit={send}>
        <label className="field">О чём просим<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus placeholder="Например, вынести мусор" /></label>
        <fieldset className="kin-pick"><legend>Кого</legend><div className="picks">{people.map((m) => <span key={m.id}>{pick(m.id, to, setTo, m.name)}</span>)}</div></fieldset>
        <fieldset className="kin-pick"><legend>Когда</legend><div className="picks">
          {pick('today', when, setWhen, 'Сегодня')}{pick('tomorrow', when, setWhen, 'Завтра')}{pick('date', when, setWhen, 'К дате')}{pick('none', when, setWhen, 'Без срока')}
        </div></fieldset>
        {when === 'date' ? <label className="field">Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label> : null}
        <label className="row set-row" style={{ cursor: 'pointer' }}><span className="row-main"><b>Срочно</b></span><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /></label>
      </form>
    </Sheet>
  );
}

RequestSheet.Cancel = function Cancel({ request, onNo, onYes }: { request: Request; onNo: () => void; onYes: () => void }) {
  return (
    <Sheet title="Отменить просьбу?" sub={request.title} onClose={onNo}
      actions={<div className="btns fill"><button type="button" className="btn soft" onClick={onNo}>Оставить</button><button type="button" className="btn" onClick={onYes}>Отменить</button></div>}>
      <span />
    </Sheet>
  );
};

export default RequestSheet;
