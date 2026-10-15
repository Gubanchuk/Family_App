import { describe, expect, it } from 'vitest';
import { daysTo, dueDate, dueText, installmentNo, monthPayments, monthTotal, nextDue, nextUnpaid, shopSpend, shopUnpriced, spendByCategory, spendByMember } from './month';
import type { MoneyEntry, Payment, PaymentMark } from './types';

const pay = (o: Partial<Payment>): Payment => ({ id: 'p', household_id: 'h', title: 'Интернет', amount: 650, day: 16, kind: 'monthly', total: null, first_month: null, note: '', created_by: null, updated_at: '', deleted_at: null, ...o });
const mark = (o: Partial<PaymentMark>): PaymentMark => ({ payment_id: 'p', month: '2026-10', household_id: 'h', paid: true, amount: 650, paid_by: 'papa', paid_on: '2026-10-15', updated_at: '', ...o });
const entry = (o: Partial<MoneyEntry>): MoneyEntry => ({ id: Math.random().toString(), household_id: 'h', kind: 'expense', amount: 1000, category: 'Продукты', member_id: 'mama', on_date: '2026-10-10', note: '', created_by: null, updated_at: '', deleted_at: null, ...o });

describe('money month', () => {
  it('moves a payment on the 31st to the last day of a short month', () => {
    expect(dueDate(pay({ day: 31 }), '2026-02')).toBe('2026-02-28');
    expect(dueDate(pay({ day: 31 }), '2028-02')).toBe('2028-02-29');
    expect(dueDate(pay({ day: 31 }), '2026-10')).toBe('2026-10-31');
  });
  it('counts an installment and drops it after its last month', () => {
    const p = pay({ kind: 'installment', total: 12, first_month: '2026-03', day: 25 });
    expect(installmentNo(p, '2026-10')).toBe(8);
    expect(installmentNo(p, '2027-02')).toBe(12);
    expect(installmentNo(p, '2027-03')).toBeNull();
    expect(monthPayments([p], [], '2027-03')).toEqual([]);
  });
  it('lists the month by date with marks, and finds the next unpaid one', () => {
    const list = monthPayments([pay({ id: 'a', day: 16 }), pay({ id: 'b', day: 1, amount: 45000, title: 'Аренда' })], [mark({ payment_id: 'b', amount: 45000 })], '2026-10');
    expect(list.map((x) => [x.p.id, x.paid])).toEqual([['b', true], ['a', false]]);
    expect(nextUnpaid(list, '2026-10-13')?.p.id).toBe('a');
  });
  it('says when a payment is due', () => {
    expect(dueText(daysTo('2026-10-13', '2026-10-16'))).toBe('через 3 дня');
    expect(dueText(0)).toBe('сегодня');
    expect(dueText(1)).toBe('завтра');
    expect(dueText(-2)).toBe('просрочен на 2 дня');
    expect(dueText(5)).toBe('через 5 дней');
  });
  it('adds paid payments to «Обязательные» and to the person who paid', () => {
    const list = monthPayments([pay({ id: 'b', amount: 45000, day: 1 })], [mark({ payment_id: 'b', amount: 45000, paid_by: 'papa' })], '2026-10');
    const entries = [entry({ amount: 1200 }), entry({ amount: 800, category: 'Дети', member_id: 'papa' }), entry({ amount: 5000, on_date: '2026-09-30' }), entry({ kind: 'income', amount: 185000, category: null })];
    expect(spendByCategory(entries, list, '2026-10')).toEqual([{ cat: 'Обязательные', sum: 45000, count: 1 }, { cat: 'Продукты', sum: 1200, count: 1 }, { cat: 'Дети', sum: 800, count: 1 }]);
    expect(spendByMember(entries, list, '2026-10')).toEqual(new Map([['mama', 1200], ['papa', 45800]]));
  });
  it('brings the payment of next month forward within a week and puts an overdue one first', () => {
    const rent = pay({ id: 'rent', day: 1, amount: 45000, title: 'Аренда' });
    expect(nextDue([rent], [mark({ payment_id: 'rent' })], '2026-10-29')).toMatchObject({ month: '2026-11', due: '2026-11-01' });
    expect(nextDue([rent], [mark({ payment_id: 'rent' })], '2026-10-15')).toBeUndefined();
    const overdue = pay({ id: 'late', day: 10 });
    expect(nextDue([overdue, pay({ id: 'soon', day: 25 })], [], '2026-10-20')?.p.id).toBe('late');
  });
  it('shows a monthly payment from the month it started, and a deleted one only where it was paid', () => {
    expect(monthPayments([pay({ first_month: '2026-10' })], [], '2026-09')).toEqual([]);
    expect(monthPayments([pay({ created_at: '2026-10-05T09:00:00Z' })], [], '2026-09')).toEqual([]);
    expect(monthPayments([pay({ created_at: '2026-10-05T09:00:00Z' })], [], '2026-10')).toHaveLength(1);
    const gone = pay({ first_month: '2026-08', deleted_at: '2026-10-02T09:00:00Z' });
    expect(monthPayments([gone], [mark({ month: '2026-09' })], '2026-09')).toMatchObject([{ paid: true }]);
    expect(monthPayments([gone], [mark({ month: '2026-09' })], '2026-10')).toEqual([]);
  });
  it('turns what was bought from the list into expenses by department, person and day', () => {
    const item = (id: string, title: string, dept: string, est: number | null) => ({ id, household_id: 'h', week_id: null, offer_id: null, source: 'manual' as const, item: null, title, qty: null, unit: null, qty_text: '', dept, urgent: false, est_price: est, added_by: null, updated_at: '', deleted_at: null });
    const mark = (id: string, bought: boolean, price: number | null, at = '2026-10-12T09:00:00.000Z') => ({ item_id: id, household_id: 'h', bought, by_member: 'mama', price_real: price, updated_at: at });
    const items = [item('a', 'Молоко', 'Молочное и яйца', 95), item('b', 'Порошок', 'Для дома', 400), item('c', 'Пластырь', 'Аптека', null), item('d', 'Хлеб', 'Хлеб', 60), item('e', 'Сыр', 'Молочное и яйца', 300)];
    const marks = [mark('a', true, 120), mark('b', true, null), mark('c', true, null), mark('d', false, null), mark('e', true, 280, '2026-09-30T10:00:00.000Z')];
    const spent = shopSpend(items as never, marks as never);
    expect(spent.map((e) => [e.note, e.category, e.amount, e.member_id, e.on_date])).toEqual([
      ['Молоко', 'Продукты', 120, 'mama', '2026-10-12'],
      ['Порошок', 'Дом', 400, 'mama', '2026-10-12'],
      ['Сыр', 'Продукты', 280, 'mama', '2026-09-30'],
    ]);
    expect(shopUnpriced(items as never, marks as never, '2026-10')).toEqual(new Map([['Здоровье', 1]]));
  });
  it('adds up a month: expenses and paid payments, not income', () => {
    const entries = [entry({ amount: 1200 }), entry({ amount: 300, category: 'Дом' }), entry({ kind: 'income', amount: 90000 }), entry({ amount: 999, on_date: '2026-09-28' })];
    expect(monthTotal(entries, [pay({ id: 'p' })], [mark({ payment_id: 'p', amount: 650 })], '2026-10')).toBe(2150);
    expect(monthTotal(entries, [pay({ id: 'p' })], [mark({ payment_id: 'p', amount: 650 })], '2026-09')).toBe(999);
  });
});
