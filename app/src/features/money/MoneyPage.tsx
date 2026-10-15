import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import { useToast } from '../shell/toastContext';
import { useToday } from '../../lib/useToday';
import { rub } from '../shop/build';
import { useMoney } from './useMoney';
import { setPaid } from './moneyActions';
import { dayTitle, daysTo, dueText, incomeOf, monthKey, monthPayments, monthTitle, nextDue, shiftMonth, spendByCategory, spendByMember } from './month';
import EntrySheet from './EntrySheet';
import PaymentSheet from './PaymentSheet';
import EntriesSheet from './EntriesSheet';
import { CATEGORIES, MANDATORY, type MoneyEntry } from './types';
import type { MonthPayment } from './month';

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MoneyPage({ me, members, db = localDb, today: fixed }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const today = useToday(fixed);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const current = monthKey(today);
  const month = params.get('m') && params.get('m')! <= current ? params.get('m')! : current;
  const add = params.get('add') as 'expense' | 'income' | 'payment' | null;
  const [open, setOpen] = useState<MonthPayment | null>(null);
  // A category name or 'income': the list of its entries; then one entry to fix or delete.
  const [lines, setLines] = useState<string | null>(null);
  const [entry, setEntry] = useState<MoneyEntry | null>(null);
  const data = useMoney(db, me.household_id);
  const go = (m: string) => setParams(m === current ? {} : { m });
  const head = (
    <Header title="Деньги" subtitle={`${monthTitle(month)} · видят только родители`}
      action={<button type="button" className="head-pill" onClick={() => setParams({ ...(month !== current ? { m: month } : {}), add: 'expense' })}><Icon name="plus" />Расход</button>} />
  );
  if (!data) return head;
  const list = monthPayments(data.payments, data.marks, month);
  const todayIso = isoOf(today);
  const next = month === current ? nextDue(data.payments, data.marks, todayIso) : undefined;
  const total = list.reduce((s, x) => s + (x.paid ? x.amount : x.p.amount), 0);
  const paid = list.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);
  const cats = spendByCategory(data.entries, list, month);
  const maxC = Math.max(1, ...cats.map((c) => c.sum));
  const byMember = [...spendByMember(data.entries, list, month).entries()].sort((a, b) => b[1] - a[1]);
  const maxM = Math.max(1, ...byMember.map(([, s]) => s));
  const close = () => setParams(month === current ? {} : { m: month });
  return (
    <>
      {head}
      <div className="month-switch" role="group" aria-label="Месяц">
        <button type="button" className="round-btn" aria-label="Предыдущий месяц" onClick={() => go(shiftMonth(month, -1))}><Icon name="back" /></button>
        <b>{monthTitle(month)}{month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ''}</b>
        <button type="button" className="round-btn" aria-label="Следующий месяц" disabled={month >= current} onClick={() => go(shiftMonth(month, 1))}><Icon name="chev" /></button>
      </div>
      {month === current ? (
        <section className="hero" aria-label="Ближайший платёж">
          {next ? (
            <>
              <h2>{next.p.title} — {rub(next.p.amount)}</h2>
              <p>{dueText(daysTo(todayIso, next.due))}, {dayTitle(next.due)}. Обязательных в {PREP[Number(month.slice(5, 7)) - 1]} {rub(total)}, оплачено {rub(paid)}.</p>
              <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={async () => { await setPaid(db, me, next, next.month, true); toast({ text: `«${next.p.title}» оплачен` }); }}><Icon name="check" />Отметить оплаченным</button></div>
            </>
          ) : list.length ? <h2>Все платежи {GEN_MONTH[Number(month.slice(5, 7)) - 1]} оплачены</h2> : <h2>Обязательных платежей пока нет</h2>}
        </section>
      ) : null}
      <section className="card">
        <div className="card-h"><h2>Платежи</h2><span className="note" style={{ margin: 0 }}>осталось {rub(total - paid)}</span></div>
        {list.map((x) => (
          <button type="button" className={`row meal-row pay-row ${x.paid ? 'paid' : ''}`} key={x.p.id} disabled={!!x.p.deleted_at} onClick={() => setOpen(x)}>
            <span className="ico pay-day" style={{ ['--h' as string]: 'var(--k-money)' }} aria-hidden="true"><b>{Number(x.due.slice(8, 10))}</b></span>
            <span className="row-main"><b>{x.p.title}</b><small>{x.paid ? 'оплачено' : [x.no ? `${x.no} из ${x.p.total}` : '', month === current ? dueText(daysTo(todayIso, x.due)) : dayTitle(x.due)].filter(Boolean).join(' · ')}</small></span>
            <span className="amount">{rub(x.amount)}</span>
          </button>
        ))}
        <button type="button" className="row set-row add-row" onClick={() => setParams({ ...(month !== current ? { m: month } : {}), add: 'payment' })}><span className="row-main"><b>Добавить платёж</b><small>аренда, рассрочка, кружок</small></span></button>
      </section>
      <section className="card">
        <div className="card-h"><h2>Расходы</h2><button type="button" className="more" onClick={() => setLines('income')}>пришло {rub(incomeOf(data.entries, month))}</button></div>
        {cats.length ? cats.map((c) => {
          const body = (
            <>
              <div className="cat-top"><span>{c.cat}<small> · {c.count}</small></span><span className="amount">{rub(c.sum)}</span></div>
              <span className="bar" style={{ ['--h' as string]: 'var(--k-money)', display: 'block' }} aria-hidden="true"><i style={{ width: `${(c.sum / maxC) * 100}%` }} /></span>
            </>
          );
          // Paid payments make up «Обязательные»; they are fixed in the list of payments above.
          return c.cat === MANDATORY
            ? <div className="cat" key={c.cat}>{body}</div>
            : <button type="button" className="cat cat-btn" key={c.cat} onClick={() => setLines(c.cat)}>{body}</button>;
        }) : <p className="note" style={{ margin: 0 }}>Расходов за {monthTitle(month).toLowerCase()} пока нет. «Расход» вверху — и они появятся здесь.</p>}
      </section>
      {byMember.length ? (
        <section className="card">
          <div className="card-h"><h2>Кто тратил</h2></div>
          {byMember.map(([id, sum]) => {
            const m = members.find((x) => x.id === id);
            return (
              <div className="cat" key={id}>
                <div className="cat-top"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="av sm" style={{ ['--c' as string]: memberColor(m?.color ?? '#8A8F9C') }} aria-hidden="true">{m ? <AvatarFace member={m} /> : '?'}</span>{m?.name ?? 'Кто-то'}</span><span className="amount">{rub(sum)}</span></div>
                <span className="bar" style={{ ['--h' as string]: memberColor(m?.color ?? '#8A8F9C'), display: 'block' }} aria-hidden="true"><i style={{ width: `${(sum / maxM) * 100}%` }} /></span>
              </div>
            );
          })}
        </section>
      ) : null}
      {add === 'expense' || add === 'income' ? <EntrySheet kind={add} me={me} members={members} db={db} month={month} onClose={close} /> : null}
      {lines ? (
        <EntriesSheet title={lines === 'income' ? 'Доходы' : lines} month={month} members={members}
          entries={data.entries.filter((e) => e.on_date.startsWith(month) && (lines === 'income' ? e.kind === 'income' : e.kind === 'expense' && (e.category && CAT_SET.has(e.category) ? e.category : 'Другое') === lines))}
          onPick={(e) => { setLines(null); setEntry(e); }} onClose={() => setLines(null)}
          onAdd={lines === 'income' ? () => { setLines(null); setParams({ ...(month !== current ? { m: month } : {}), add: 'income' }); } : undefined} />
      ) : null}
      {entry ? <EntrySheet key={entry.id} kind={entry.kind} me={me} members={members} db={db} month={month} prev={entry} onClose={() => setEntry(null)} /> : null}
      {add === 'payment' || open ? <PaymentSheet me={me} db={db} item={open} month={month} onClose={() => { setOpen(null); close(); }} /> : null}
    </>
  );
}

const CAT_SET = new Set(CATEGORIES);
const PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const GEN_MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
