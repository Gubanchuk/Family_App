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

export function monthPayments(payments: Payment[], marks: PaymentMark[], month: string) {
  return payments
    .filter((p) => !p.deleted_at && (p.kind === 'monthly' || installmentNo(p, month) !== null))
    .map((p) => {
      const mark = marks.find((x) => x.payment_id === p.id && x.month === month);
      return { p, due: dueDate(p, month), no: installmentNo(p, month), mark, paid: !!mark?.paid, amount: mark?.paid ? mark.amount : p.amount };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.p.title.localeCompare(b.p.title, 'ru'));
}
export type MonthPayment = ReturnType<typeof monthPayments>[number];

export function nextUnpaid(list: MonthPayment[], today: string) {
  const open = list.filter((x) => !x.paid);
  return open.find((x) => x.due >= today) ?? open[0];
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
