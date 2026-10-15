import { useState, type FormEvent } from 'react';
import { parseRub } from '../board/boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { saveEntry } from './moneyActions';
import { CATEGORIES } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EntrySheet({ kind, me, members, db, month, onClose }: { kind: 'expense' | 'income'; me: Member; members: Member[]; db: LocalDb; month: string; onClose: () => void }) {
  const toast = useToast();
  const [today] = useState(() => iso(new Date()));
  const [sum, setSum] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [who, setWho] = useState(me.id);
  const [date, setDate] = useState(today.startsWith(month) ? today : `${month}-01`);
  const [note, setNote] = useState('');
  const parents = members.filter((m) => m.role === 'parent');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseRub(sum);
    if (!n || (kind === 'expense' && !cat)) return;
    await saveEntry(db, me, { kind, amount: n, category: kind === 'expense' ? cat : null, member_id: who, on_date: date, note });
    toast({ text: kind === 'expense' ? `Расход ${rub(n)} · ${cat}` : `Доход ${rub(n)}` });
    onClose();
  };
  return (
    <Sheet title={kind === 'expense' ? 'Расход' : 'Доход'} onClose={onClose} keepOnBackdrop={!!sum}
      actions={<button type="submit" form="entry-form" className="btn" disabled={!parseRub(sum) || (kind === 'expense' && !cat)}>Сохранить</button>}>
      <form id="entry-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Сумма, ₽<input inputMode="numeric" autoFocus value={sum} onChange={(e) => setSum(e.target.value)} placeholder="0" /></label>
        {kind === 'expense' ? (
          <fieldset className="kin-pick"><legend>Категория</legend><div className="picks">
            {CATEGORIES.map((c) => <button key={c} type="button" className="pick" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div></fieldset>
        ) : null}
        <fieldset className="kin-pick"><legend>{kind === 'expense' ? 'Кто платил' : 'Кто получил'}</legend><div className="picks">
          {parents.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>{m.id === me.id ? 'Я' : m.name}</button>)}
        </div></fieldset>
        <label className="field">Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Комментарий<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Можно не писать" /></label>
      </form>
    </Sheet>
  );
}
