import { useState, type FormEvent, type KeyboardEvent } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient } from '../../data/db';
import { NON_FOOD_DEPTS, guessDept, guessIngredient } from './shopActions';
import { DEPT_ORDER } from './build';

export default function AddItemSheet({ vocab, onAdd, onClose }: { vocab: Map<string, Ingredient>; onAdd: (a: { title: string; qtyText: string; urgent: boolean; dept: string }) => Promise<unknown>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [qtyText, setQty] = useState('');
  const [urgent, setUrgent] = useState(false);
  // The department follows the title until someone picks one by hand.
  const [picked, setPicked] = useState<string | null>(null);
  const [allDepts, setAllDepts] = useState(false);
  const guessed = guessDept(title, vocab);
  const dept = picked ?? guessed;
  // The likely ones first: the guess, a food department the first word points to, the non-food ones,
  // and whatever was picked by hand. «Все отделы» opens the rest.
  const near = guessIngredient(title, vocab)?.dept;
  const depts = allDepts ? DEPT_ORDER : [...new Set([guessed, ...(near ? [near] : []), ...NON_FOOD_DEPTS, ...(picked ? [picked] : [])])];
  const add = async (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd({ title, qtyText, urgent, dept });
    onClose();
  };
  return (
    <Sheet title="Добавить в список" sub="Увидит вся семья. Срочное покажется на Главной." onClose={onClose} keepOnBackdrop={!!(title.trim() || qtyText.trim())}
      actions={<button type="submit" form="add-item" className="btn" disabled={!title.trim()}>Добавить в список</button>}>
      {/* Enter in any field adds the line: the button sits outside the form, in the sheet's bottom bar. */}
      <form id="add-item" style={{ display: 'grid', gap: 12, margin: '0 16px' }} onSubmit={add}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !e.nativeEvent.isComposing) add(e); }}>
        <label className="field">Что купить<input value={title} onChange={(e) => { setTitle(e.target.value); if (!e.target.value.trim()) setPicked(null); }} list="vocab" maxLength={80} autoComplete="off" autoFocus placeholder="Например, хлеб или порошок" enterKeyHint="done" /></label>
        <datalist id="vocab">{[...vocab.keys()].map((v) => <option key={v} value={v} />)}</datalist>
        <label className="field">Сколько<input value={qtyText} onChange={(e) => setQty(e.target.value)} maxLength={40} placeholder="Например, 2 л" /></label>
        {title.trim() ? (
          <fieldset className="kin-pick"><legend>Отдел</legend><div className="picks">
            {depts.map((d) => <button key={d} type="button" className="pick" aria-pressed={dept === d} onClick={() => setPicked(d)}>{d}</button>)}
            {allDepts ? null : <button type="button" className="pick more-pick" onClick={() => setAllDepts(true)}>Все отделы</button>}
          </div></fieldset>
        ) : null}
        <div className="row"><span className="row-main"><b>Срочно</b><small>нужно сегодня</small></span>
          <button type="button" className="switch" role="switch" aria-checked={urgent} aria-label="Срочно" onClick={() => setUrgent(!urgent)}><i /></button></div>
      </form>
    </Sheet>
  );
}
