import { useState, type FormEvent } from 'react';
import { parseRub } from '../board/boardMath';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { removePayment, savePayment, setPaid } from './moneyActions';
import { dayTitle, dueDate, installmentNo, type MonthPayment } from './month';
import type { Payment } from './types';


// One month's payment to mark paid, or the form for a new or changed one (edit: straight from the list of all).
export default function PaymentSheet({ me, db, item, edit, month, onShow, onClose }: {
  me: Member; db: LocalDb; item: MonthPayment | null; edit?: Payment; month: string; onShow?: (month: string) => void; onClose: () => void;
}) {
  const toast = useToast();
  const p = item?.p ?? edit;
  const [editing, setEditing] = useState(!item);
  const [title, setTitle] = useState(p?.title ?? '');
  const [amount, setAmount] = useState(p ? String(p.amount) : '');
  const [day, setDay] = useState(p ? String(p.day) : '');
  const [kind, setKind] = useState<'monthly' | 'installment'>(p?.kind ?? 'monthly');
  const [total, setTotal] = useState(p?.total ? String(p.total) : '');
  const [first, setFirst] = useState(p?.first_month ?? p?.created_at?.slice(0, 7) ?? month);
  const [paidSum, setPaidSum] = useState(item ? String(item.amount) : '');
  const [sure, setSure] = useState(false);
  if (item && !editing) {
    return (
      <Sheet title={item.p.title} sub={`${rub(item.p.amount)} · ${item.paid ? 'оплачено' : 'не оплачено'}`} onClose={onClose}
        actions={<div className="btns fill">
          <button type="button" className="btn soft" onClick={() => setEditing(true)}>Изменить</button>
          <button type="button" className="btn" onClick={async () => { await setPaid(db, me, item, month, !item.paid, parseRub(paidSum) ?? item.p.amount); toast({ text: item.paid ? 'Отметка снята' : `«${item.p.title}» оплачен` }); onClose(); }}>{item.paid ? 'Не оплачено' : 'Оплачено'}</button>
        </div>}>
        {!item.paid ? <label className="field" style={{ margin: '0 16px' }}>Сумма в этот раз, ₽<input inputMode="numeric" value={paidSum} onChange={(e) => setPaidSum(e.target.value)} /></label> : null}
        <button type="button" className="more" style={{ margin: '8px 16px 16px' }} onClick={async () => {
          if (!sure) { setSure(true); return; }
          await removePayment(db, item.p); toast({ text: 'Платёж удалён' }); onClose();
        }}>{sure ? 'Точно удалить? Оплаты прошлых месяцев останутся' : 'Удалить платёж'}</button>
      </Sheet>
    );
  }
  const ok = title.trim() && parseRub(amount) && Number(day) >= 1 && Number(day) <= 31 && /^\d{4}-(0[1-9]|1[0-2])$/.test(first) && (kind === 'monthly' || parseRub(total));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    await savePayment(db, me, { id: p?.id, title, amount: parseRub(amount)!, day: Number(day), kind, total: kind === 'installment' ? parseRub(total) : null, first_month: first, note: '' }, p);
    // A payment that starts in another month is not on this screen: say where it is and offer to go there.
    const row = { kind, day: Number(day), total: parseRub(total), first_month: first } as Payment;
    const elsewhere = kind === 'monthly' ? first > month : installmentNo(row, month) === null;
    toast({
      text: `${p ? 'Платёж сохранён' : `Платёж «${title.trim()}» добавлен`}${elsewhere ? `, первый — ${dayTitle(dueDate(row, first))} ${first.slice(0, 4)}` : ''}`,
      ...(elsewhere && onShow ? { action: { label: 'Показать', run: () => onShow(first) } } : {}),
    });
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
        {kind === 'installment' ? <label className="field">Сколько платежей всего<input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="12" /></label> : null}
        <label className="field">С какого месяца<input type="month" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="2026-11" /></label>
      </form>
    </Sheet>
  );
}
