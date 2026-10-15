import { useState, type FormEvent } from 'react';
import { parseRub } from '../board/boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { saveBudgets } from './moneyActions';
import { CATEGORIES, type Budget } from './types';

// A monthly budget per category; an empty field means no budget.
export default function BudgetsSheet({ me, db, budgets, onClose }: { me: Member; db: LocalDb; budgets: Budget[]; onClose: () => void }) {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(CATEGORIES.map((c) => [c, String(budgets.find((b) => b.category === c)?.amount ?? '')])));
  const ok = CATEGORIES.every((c) => !vals[c].trim() || parseRub(vals[c]));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    await saveBudgets(db, me, Object.fromEntries(CATEGORIES.map((c) => [c, parseRub(vals[c])])), budgets);
    toast({ text: 'Бюджеты сохранены' });
    onClose();
  };
  return (
    <Sheet title="Бюджеты" sub="На месяц, по категориям. Пустое поле — без бюджета." onClose={onClose} keepOnBackdrop
      actions={<button type="submit" form="budgets-form" className="btn" disabled={!ok}>Сохранить</button>}>
      <form id="budgets-form" style={{ margin: '0 16px' }} onSubmit={save}>
        {CATEGORIES.map((c) => (
          <label className="field" key={c}>{c}, ₽<input inputMode="numeric" value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} placeholder="без бюджета" /></label>
        ))}
      </form>
    </Sheet>
  );
}
