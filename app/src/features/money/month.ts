import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { CATEGORIES, MANDATORY, type MoneyEntry, type Payment, type PaymentMark } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function shiftMonth(key: string, n: number) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const monthTitle = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
export const dayTitle = (iso: string) => `${Number(iso.slice(8, 10))} ${GEN[Number(iso.slice(5, 7)) - 1]}`;

const lastDay = (key: string) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const dueDate = (p: Payment, month: string) => `${month}-${pad(Math.min(p.day, lastDay(month)))}`;

const index = (key: string) => { const [y, m] = key.split('-').map(Number); return y * 12 + m - 1; };
export function installmentNo(p: Payment, month: string): number | null {
  if (p.kind !== 'installment' || !p.first_month || !p.total) return null;
  const n = index(month) - index(p.first_month) + 1;
  return n >= 1 && n <= p.total ? n : null;
}

// A monthly payment counts from the month it was added; a deleted one stays only in months it was paid,
// so the history of what the family paid does not change.
const startOf = (p: Payment) => p.first_month ?? p.created_at?.slice(0, 7) ?? null;
const livesIn = (p: Payment, month: string) => (p.kind === 'monthly' ? !startOf(p) || startOf(p)! <= month : installmentNo(p, month) !== null);

// How a payment runs, for the list of all payments: «каждый месяц, 16-го · с ноября» or
// «6 платежей · ноябрь 2026 — апрель 2027».
const nomYear = (key: string) => `${monthTitle(key).toLowerCase()} ${key.slice(0, 4)}`;
const genOf = (key: string, current: string) => `${GEN[Number(key.slice(5, 7)) - 1]}${key.slice(0, 4) !== current.slice(0, 4) ? ` ${key.slice(0, 4)}` : ''}`;
export const lastMonthOf = (p: Payment) => (p.kind === 'installment' && p.first_month && p.total ? shiftMonth(p.first_month, p.total - 1) : null);
export function paymentSpan(p: Payment, current: string) {
  const last = lastMonthOf(p);
  if (last && p.first_month) return `${p.total} ${plural(p.total!, 'платёж', 'платежа', 'платежей')} · ${nomYear(p.first_month)} — ${nomYear(last)}`;
  const start = startOf(p);
  return `каждый месяц, ${p.day}-го${start && start > current ? ` · с ${genOf(start, current)}` : ''}`;
}
// Every live payment: running and coming ones by their day, finished installments at the end.
export function allPayments(payments: Payment[], current: string) {
  const done = (p: Payment) => { const last = lastMonthOf(p); return !!last && last < current; };
  return payments.filter((p) => !p.deleted_at)
    .map((p) => ({ p, done: done(p), start: startOf(p) ?? current }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.p.day - b.p.day || a.p.title.localeCompare(b.p.title, 'ru'));
}

export function monthPayments(payments: Payment[], marks: PaymentMark[], month: string) {
  return payments
    .map((p) => ({ p, mark: marks.find((x) => x.payment_id === p.id && x.month === month) }))
    .filter(({ p, mark }) => livesIn(p, month) && (!p.deleted_at || !!mark?.paid))
    .map(({ p, mark }) => ({ p, month, due: dueDate(p, month), no: installmentNo(p, month), mark, paid: !!mark?.paid, amount: mark?.paid ? mark.amount : p.amount }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.p.title.localeCompare(b.p.title, 'ru'));
}
export type MonthPayment = ReturnType<typeof monthPayments>[number];

export function nextUnpaid(list: MonthPayment[], today: string) {
  const open = list.filter((x) => !x.paid);
  return open.find((x) => x.due >= today) ?? open[0];
}

// What to pay next: an overdue payment of this month first, then the nearest one, including next month's
// within a week (the reminder for the 1st comes on the 29th).
export function nextDue(payments: Payment[], marks: PaymentMark[], today: string) {
  const cur = today.slice(0, 7);
  const open = [...monthPayments(payments, marks, cur), ...monthPayments(payments, marks, shiftMonth(cur, 1))]
    .filter((x) => !x.paid && !x.p.deleted_at && (x.month === cur || daysTo(today, x.due) <= 7));
  return open.find((x) => x.due < today) ?? open.find((x) => x.due >= today);
}

const dayNum = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
export const daysTo = (today: string, due: string) => dayNum(due) - dayNum(today);
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);
export function dueText(days: number) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days < 0) return `просрочен на ${-days} ${plural(-days, 'день', 'дня', 'дней')}`;
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

const inMonth = (e: MoneyEntry, month: string) => !e.deleted_at && e.on_date.startsWith(month);

export function spendByCategory(entries: MoneyEntry[], list: MonthPayment[], month: string) {
  const sums = new Map<string, { sum: number; count: number }>();
  const add = (cat: string, n: number) => { const s = sums.get(cat) ?? { sum: 0, count: 0 }; sums.set(cat, { sum: s.sum + n, count: s.count + 1 }); };
  for (const x of list) if (x.paid) add(MANDATORY, x.amount);
  for (const e of entries) if (e.kind === 'expense' && inMonth(e, month)) add(e.category && CATEGORIES.includes(e.category) ? e.category : 'Другое', e.amount);
  return [...sums.entries()].map(([cat, v]) => ({ cat, ...v })).filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
}

export function spendByMember(entries: MoneyEntry[], list: MonthPayment[], month: string) {
  const out = new Map<string, number>();
  const add = (id: string | null | undefined, n: number) => { if (id) out.set(id, (out.get(id) ?? 0) + n); };
  for (const e of entries) if (e.kind === 'expense' && inMonth(e, month)) add(e.member_id, e.amount);
  for (const x of list) if (x.paid) add(x.mark?.paid_by, x.amount);
  return out;
}

export const incomeOf = (entries: MoneyEntry[], month: string) => entries.filter((e) => e.kind === 'income' && inMonth(e, month)).reduce((s, e) => s + e.amount, 0);

// What was bought from the shopping list counts as spending by itself: food departments go to «Продукты»,
// the others to the money category of the same kind. The day is when the line was marked bought.
const DEPT_CATEGORY: Record<string, string> = { 'Для дома': 'Дом', 'Аптека': 'Здоровье', 'Одежда и обувь': 'Одежда', 'Техника': 'Другое', 'Другое': 'Другое' };
export const categoryOfDept = (dept: string) => DEPT_CATEGORY[dept] ?? 'Продукты';
const localDay = (iso: string) => { const d = iso ? new Date(iso) : new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export type ShopEntry = MoneyEntry & { fromShop: true };

function bought(items: ShoppingItem[], marks: ShoppingMark[]) {
  const byId = new Map(items.filter((i) => !i.deleted_at).map((i) => [i.id, i]));
  return marks.flatMap((m) => { const it = byId.get(m.item_id); return it && m.bought ? [{ it, m, amount: Math.round(Number(m.price_real ?? it.est_price ?? 0)) }] : []; });
}

export function shopSpend(items: ShoppingItem[], marks: ShoppingMark[]): ShopEntry[] {
  return bought(items, marks).filter((x) => x.amount > 0).map(({ it, m, amount }) => ({
    id: `shop:${it.id}`, household_id: it.household_id, kind: 'expense' as const, amount, category: categoryOfDept(it.dept), member_id: m.by_member,
    on_date: localDay(m.updated_at), note: it.title, created_by: m.by_member, updated_at: m.updated_at, deleted_at: null, fromShop: true as const,
  }));
}

// Bought lines with no price, per category, for «ещё N без цены».
export function shopUnpriced(items: ShoppingItem[], marks: ShoppingMark[], month: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const { it, m, amount } of bought(items, marks)) {
    if (amount > 0 || !localDay(m.updated_at).startsWith(month)) continue;
    const c = categoryOfDept(it.dept);
    out.set(c, (out.get(c) ?? 0) + 1);
  }
  return out;
}

// All spending of a month: expenses plus paid payments (income is not spending).
export function monthTotal(entries: MoneyEntry[], payments: Payment[], marks: PaymentMark[], month: string) {
  return spendByCategory(entries, monthPayments(payments, marks, month), month).reduce((s, c) => s + c.sum, 0);
}

