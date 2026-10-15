// moneyActions.ts
import { writeLocal } from '../../data/sync';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { MonthPayment } from './month';
import type { MoneyEntry, Payment } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function savePayment(db: LocalDb, me: Member, p: { id?: string; title: string; amount: number; day: number; kind: 'monthly' | 'installment'; total: number | null; first_month: string | null; note: string }, prev?: Payment) {
  await writeLocal(db, 'payments', [{ ...p, id: p.id ?? crypto.randomUUID(), household_id: me.household_id, title: p.title.trim(), note: p.note.trim(), created_by: prev?.created_by ?? me.id, deleted_at: null }]);
}
export const removePayment = (db: LocalDb, p: Payment) => writeLocal(db, 'payments', [{ ...p, deleted_at: new Date().toISOString() }]);
export const setPaid = (db: LocalDb, me: Member, x: MonthPayment, month: string, paid: boolean, amount = x.p.amount) =>
  writeLocal(db, 'payment_marks', [{ payment_id: x.p.id, month, household_id: x.p.household_id, paid, amount, paid_by: paid ? me.id : null, paid_on: paid ? iso(new Date()) : null }]);
export async function saveEntry(db: LocalDb, me: Member, e: { id?: string; kind: 'expense' | 'income'; amount: number; category: string | null; member_id: string | null; on_date: string; note: string }, prev?: MoneyEntry) {
  await writeLocal(db, 'money_entries', [{ ...e, id: e.id ?? crypto.randomUUID(), household_id: me.household_id, note: e.note.trim(), created_by: prev?.created_by ?? me.id, deleted_at: null }]);
}
export const removeEntry = (db: LocalDb, e: MoneyEntry) => writeLocal(db, 'money_entries', [{ ...e, deleted_at: new Date().toISOString() }]);
