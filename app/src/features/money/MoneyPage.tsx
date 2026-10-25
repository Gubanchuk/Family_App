import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { dayTitle, daysTo, dueText, incomeOf, monthKey, monthPayments, monthTitle, monthTotal, nextDue, shiftMonth, shopSpend, shopUnpriced, spendByCategory, spendByMember } from './month';
import BudgetsSheet from './BudgetsSheet';
import EntrySheet from './EntrySheet';
import PaymentSheet from './PaymentSheet';
import AllPaymentsSheet from './AllPaymentsSheet';
import EntriesSheet from './EntriesSheet';
import { CATEGORIES, MANDATORY, type MoneyEntry, type Payment } from './types';
import type { MonthPayment } from './month';
import { OPENED_HERE, OwnUrl, afterBackClose, openedHere } from '../../lib/backClose';

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MoneyPage({ me, members, db = localDb, today: fixed }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const today = useToday(fixed);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const current = monthKey(today);
  // Up to three years ahead, like the month picker: payments added for later months must be found somewhere.
  const last = shiftMonth(current, 36);
  const asked = params.get('m') ?? '';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= last ? asked : current;
  const add = params.get('add') as 'expense' | 'income' | 'payment' | null;
  const [open, setOpen] = useState<MonthPayment | null>(null);
  // A category name or 'income': the list of its entries; then one entry to fix or delete.
  const [lines, setLines] = useState<string | null>(null);
  const [entry, setEntry] = useState<MoneyEntry | null>(null);
  const [budgeting, setBudgeting] = useState(false);
  const [allPays, setAllPays] = useState(false);
  const [editPay, setEditPay] = useState<Payment | null>(null);
  const data = useMoney(db, me.household_id);
  const go = (m: string) => setParams(m === current ? {} : { m });
  const openAdd = (kind: 'expense' | 'income' | 'payment') => setParams({ ...(month !== current ? { m: month } : {}), add: kind }, { state: OPENED_HERE });
  // A form opened by a tap goes back to the page's entry, so the history keeps no second copy of the page;
  // one opened by a link from elsewhere drops ?add from the address instead.
  const close = () => afterBackClose(() => (add && openedHere(state) ? navigate(-1) : setParams(month === current ? {} : { m: month }, { replace: true })));
  const head = (
    <Header ask="money" title="Деньги" subtitle={`${monthTitle(month)} · видят только родители`}
      action={<button type="button" className="head-pill" onClick={() => openAdd('expense')}><Icon name="plus" />Расход</button>} />
  );
  if (!data) return head;
  const list = monthPayments(data.payments, data.marks, month);
  const todayIso = isoOf(today);
  const next = month === current ? nextDue(data.payments, data.marks, todayIso) : undefined;
  const total = list.reduce((s, x) => s + (x.paid ? x.amount : x.p.amount), 0);
  const paid = list.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);
  const entries = [...data.entries, ...shopSpend(data.items, data.shopMarks)];
  const unpriced = shopUnpriced(data.items, data.shopMarks, month);
  const budgetOf = new Map(data.budgets.map((b) => [b.category, b.amount]));
  // Categories with a budget show even before anything is spent in them.
  const spent = spendByCategory(entries, list, month);
  // Categories with a budget or with purchases still without a price show too, so those can be opened and priced.
  const extra = [...data.budgets.map((b) => b.category), ...unpriced.keys()].filter((cat, i, all) => all.indexOf(cat) === i && !spent.some((c) => c.cat === cat));
  const cats = [...spent, ...extra.map((cat) => ({ cat, sum: 0, count: 0 }))];
  // Six months ending with the one on screen (or this one, when looking ahead).
  const months = [5, 4, 3, 2, 1, 0].map((n) => shiftMonth(month > current ? current : month, -n));
  const totals = months.map((m) => monthTotal(entries, data.payments, data.marks, m));
  const maxT = Math.max(1, ...totals);
  const maxC = Math.max(1, ...cats.map((c) => c.sum));
  const byMember = [...spendByMember(entries, list, month).entries()].sort((a, b) => b[1] - a[1]);
  const maxM = Math.max(1, ...byMember.map(([, s]) => s));
  return (
    <>
      {head}
      <div className="month-switch" role="group" aria-label="Месяц">
        <button type="button" className="round-btn" aria-label="Предыдущий месяц" onClick={() => go(shiftMonth(month, -1))}><Icon name="back" /></button>
        <b>{monthTitle(month)}{month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ''}</b>
        <button type="button" className="round-btn" aria-label="Следующий месяц" disabled={month >= last} onClick={() => go(shiftMonth(month, 1))}><Icon name="chev" /></button>
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
        {data.payments.some((p) => !p.deleted_at) ? (
          <button type="button" className="row set-row" onClick={() => setAllPays(true)}><span className="row-main"><b>Все платежи</b><small>{data.payments.filter((p) => !p.deleted_at).length} · и те, что начнутся позже</small></span></button>
        ) : null}
        <button type="button" className="row set-row add-row" onClick={() => openAdd('payment')}><span className="row-main"><b>Добавить платёж</b><small>аренда, рассрочка, кружок</small></span></button>
      </section>
      <section className="card">
        <div className="card-h"><h2>Расходы</h2><button type="button" className="more" onClick={() => setLines('income')}>пришло {rub(incomeOf(data.entries, month))}</button></div>
        {cats.length ? cats.map((c) => {
          const budget = budgetOf.get(c.cat);
          const over = budget !== undefined && c.sum > budget;
          const share = budget ? Math.min(1, c.sum / budget) : c.sum / maxC;
          const body = (
            <>
              <div className="cat-top">
                <span>{c.cat}{c.count ? <small> · {c.count}</small> : null}{unpriced.get(c.cat) ? <small> · ещё {unpriced.get(c.cat)} без цены</small> : null}</span>
                <span className={`amount ${over ? 'over' : ''}`}>{rub(c.sum)}{budget ? <small> из {rub(budget)}</small> : null}</span>
              </div>
              <span className={`bar ${over ? 'over' : ''}`} style={{ ['--h' as string]: 'var(--k-money)', display: 'block' }} aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
              {over ? <small className="over-note">перерасход {rub(c.sum - budget!)}</small> : null}
            </>
          );
          // Paid payments make up «Обязательные»; they are fixed in the list of payments above.
          return c.cat === MANDATORY
            ? <div className="cat" key={c.cat}>{body}</div>
            : <button type="button" className="cat cat-btn" key={c.cat} onClick={() => setLines(c.cat)}>{body}</button>;
        }) : <p className="note" style={{ margin: 0 }}>Расходов за {monthTitle(month).toLowerCase()} пока нет. «Расход» вверху — и они появятся здесь.</p>}
        {data.budgetsReady ? <button type="button" className="row set-row add-row" onClick={() => setBudgeting(true)}><span className="row-main"><b>Бюджеты на месяц</b><small>{data.budgets.length ? `заданы для ${data.budgets.length}` : 'по категориям, по желанию'}</small></span></button> : null}
      </section>
      <section className="card">
        <div className="card-h"><h2>По месяцам</h2></div>
        <div className="mchart" role="group" aria-label="Траты по месяцам">
          {months.map((m, i) => (
            <button type="button" key={m} className="mbar" aria-pressed={m === month} aria-label={`${monthTitle(m)}: ${rub(totals[i])}`} onClick={() => go(m)}>
              <span className="mbar-v">{totals[i] ? (totals[i] >= 1000 ? `${Math.round(totals[i] / 1000)}к` : totals[i]) : ''}</span>
              <span className="mbar-track"><i style={{ height: `${Math.max(3, (totals[i] / maxT) * 100)}%` }} /></span>
              <small>{monthTitle(m).slice(0, 3)}</small>
            </button>
          ))}
        </div>
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
      {add === 'expense' || add === 'income' ? <OwnUrl.Provider value><EntrySheet kind={add} me={me} members={members} db={db} month={month} onClose={close} /></OwnUrl.Provider> : null}
      {lines ? (
        <EntriesSheet title={lines === 'income' ? 'Доходы' : lines} month={month} members={members}
          unpriced={lines === 'income' ? 0 : unpriced.get(lines) ?? 0}
          entries={entries.filter((e) => e.on_date.startsWith(month) && (lines === 'income' ? e.kind === 'income' : e.kind === 'expense' && (e.category && CAT_SET.has(e.category) ? e.category : 'Другое') === lines))}
          onPick={(e) => { setLines(null); setEntry(e); }} onClose={() => setLines(null)}
          onAdd={lines === 'income' ? () => { setLines(null); afterBackClose(() => openAdd('income')); } : undefined} />
      ) : null}
      {budgeting ? <BudgetsSheet me={me} db={db} budgets={data.budgets} onClose={() => setBudgeting(false)} /> : null}
      {entry ? <EntrySheet key={entry.id} kind={entry.kind} me={me} members={members} db={db} month={month} prev={entry} onClose={() => setEntry(null)} /> : null}
      {allPays ? <AllPaymentsSheet payments={data.payments} current={current} onPick={(p) => { setAllPays(false); setEditPay(p); }} onClose={() => setAllPays(false)} /> : null}
      {add === 'payment' || open || editPay ? <OwnUrl.Provider value={add === 'payment'}><PaymentSheet key={editPay?.id ?? open?.p.id ?? 'new'} me={me} db={db} item={open} edit={editPay ?? undefined} month={month} onShow={go}
        onClose={() => { setOpen(null); setEditPay(null); close(); }} /></OwnUrl.Provider> : null}
    </>
  );
}

const CAT_SET = new Set(CATEGORIES);
const PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const GEN_MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
