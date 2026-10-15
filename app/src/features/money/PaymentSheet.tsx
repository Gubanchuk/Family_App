import { useState, type FormEvent } from 'react';
import { parseRub } from '../board/boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { removePayment, savePayment, setPaid } from './moneyActions';
import type { MonthPayment } from './month';


export default function PaymentSheet({ me, db, item, month, onClose }: { me: Member; db: LocalDb; item: MonthPayment | null; month: string; onClose: () => void }) {
  const toast = useToast();
  const p = item?.p;
  const [editing, setEditing] = useState(!item);
  const [title, setTitle] = useState(p?.title ?? '');
  const [amount, setAmount] = useState(p ? String(p.amount) : '');
  const [day, setDay] = useState(p ? String(p.day) : '');
  const [kind, setKind] = useState<'monthly' | 'installment'>(p?.kind ?? 'monthly');
  const [total, setTotal] = useState(p?.total ? String(p.total) : '');
  const [first, setFirst] = useState(p?.first_month ?? month);
  const [paidSum, setPaidSum] = useState(item ? String(item.amount) : '');
  if (item && !editing) {
    return (
      <Sheet title={item.p.title} sub={`${rub(item.p.amount)} · ${item.paid ? 'оплачено' : 'не оплачено'}`} onClose={onClose}
        actions={<div className="btns fill">
          <button type="button" className="btn soft" onClick={() => setEditing(true)}>Изменить</button>
          <button type="button" className="btn" onClick={async () => { await setPaid(db, me, item, month, !item.paid, parseRub(paidSum) ?? item.p.amount); toast({ text: item.paid ? 'Отметка снята' : `«${item.p.title}» оплачен` }); onClose(); }}>{item.paid ? 'Не оплачено' : 'Оплачено'}</button>
        </div>}>
        {!item.paid ? <label className="field" style={{ margin: '0 16px' }}>Сумма в этот раз, ₽<input inputMode="numeric" value={paidSum} onChange={(e) => setPaidSum(e.target.value)} /></label> : null}
        <button type="button" className="more" style={{ margin: '8px 16px 16px' }} onClick={async () => { await removePayment(db, item.p); toast({ text: 'Платёж удалён' }); onClose(); }}>Удалить платёж</button>
      </Sheet>
    );
  }
  const ok = title.trim() && parseRub(amount) && Number(day) >= 1 && Number(day) <= 31 && (kind === 'monthly' || (parseRub(total) && /^\d{4}-\d{2}$/.test(first)));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    await savePayment(db, me, { id: p?.id, title, amount: parseRub(amount)!, day: Number(day), kind, total: kind === 'installment' ? parseRub(total) : null, first_month: kind === 'installment' ? first : null, note: '' }, p);
    toast({ text: p ? 'Платёж сохранён' : `Платёж «${title.trim()}» добавлен` });
    onClose();
  };
  return (
    <Sheet title={p ? 'Изменить платёж' : 'Новый платёж'} onClose={onClose} keepOnBackdrop={!!title.trim()}
      actions={<button type="submit" form="payment-form" className="btn" disabled={!ok}>Сохранить</button>}>
      <form id="payment-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Название<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus={!p} placeholder="Например, аренда" /></label>
        <label className="field">Сумма, ₽<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field">Число месяца<input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="1–31" /></label>
        <fieldset className="kin-pick"><legend>Как платим</legend><div className="picks">
          <button type="button" className="pick" aria-pressed={kind === 'monthly'} onClick={() => setKind('monthly')}>Каждый месяц</button>
          <button type="button" className="pick" aria-pressed={kind === 'installment'} onClick={() => setKind('installment')}>Рассрочка</button>
        </div></fieldset>
        {kind === 'installment' ? (
          <>
            <label className="field">Сколько платежей всего<input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="12" /></label>
            <label className="field">С какого месяца<input type="month" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
          </>
        ) : null}
      </form>
    </Sheet>
  );
}
