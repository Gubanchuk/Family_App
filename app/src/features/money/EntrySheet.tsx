import { useState, type FormEvent } from 'react';
import { parseRub } from '../board/boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { removeEntry, saveEntry } from './moneyActions';
import { CATEGORIES, type MoneyEntry } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A date picker can be cleared; an empty or broken date would be refused by the server, so Save waits for a real one.
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export default function EntrySheet({ kind, me, members, db, month, prev, onClose }: { kind: 'expense' | 'income'; me: Member; members: Member[]; db: LocalDb; month: string; prev?: MoneyEntry; onClose: () => void }) {
  const toast = useToast();
  const [today] = useState(() => iso(new Date()));
  const [sum, setSum] = useState(prev ? String(prev.amount) : '');
  const [cat, setCat] = useState<string | null>(prev?.category ?? null);
  const [who, setWho] = useState(prev?.member_id ?? me.id);
  const [date, setDate] = useState(prev?.on_date ?? (today.startsWith(month) ? today : `${month}-01`));
  const [note, setNote] = useState(prev?.note ?? '');
  const [sure, setSure] = useState(false);
  const parents = members.filter((m) => m.role === 'parent');
  const ok = !!parseRub(sum) && (kind === 'income' || !!cat) && DATE.test(date);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseRub(sum);
    if (!n || !ok) return;
    await saveEntry(db, me, { id: prev?.id, kind, amount: n, category: kind === 'expense' ? cat : null, member_id: who, on_date: date, note }, prev);
    toast({ text: kind === 'expense' ? `Расход ${rub(n)} · ${cat}` : `Доход ${rub(n)}` });
    onClose();
  };
  const remove = async () => {
    if (!prev) return;
    await removeEntry(db, prev);
    toast({ text: kind === 'expense' ? 'Расход удалён' : 'Доход удалён' });
    onClose();
  };
  const title = prev ? (kind === 'expense' ? 'Изменить расход' : 'Изменить доход') : kind === 'expense' ? 'Расход' : 'Доход';
  return (
    <Sheet title={title} onClose={onClose} keepOnBackdrop={!!sum && !prev}
      actions={<button type="submit" form="entry-form" className="btn" disabled={!ok}>Сохранить</button>}>
      <form id="entry-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Сумма, ₽<input inputMode="numeric" autoFocus={!prev} value={sum} onChange={(e) => setSum(e.target.value)} placeholder="0" /></label>
        {kind === 'expense' ? (
          <>
          <fieldset className="kin-pick"><legend>Категория</legend><div className="picks">
            {CATEGORIES.map((c) => <button key={c} type="button" className="pick" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div></fieldset>
          {cat === 'Продукты' ? <p className="note">Покупки из списка считаются сами — вносите только то, чего в списке не было.</p> : null}
          </>
        ) : null}
        <fieldset className="kin-pick"><legend>{kind === 'expense' ? 'Кто платил' : 'Кто получил'}</legend><div className="picks">
          {parents.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>{m.id === me.id ? 'Я' : m.name}</button>)}
        </div></fieldset>
        <label className="field">Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Комментарий<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Можно не писать" /></label>
        {prev ? <button type="button" className="more" style={{ margin: '4px 0 12px' }} onClick={() => (sure ? remove() : setSure(true))}>{sure ? 'Точно удалить?' : 'Удалить'}</button> : null}
      </form>
    </Sheet>
  );
}
