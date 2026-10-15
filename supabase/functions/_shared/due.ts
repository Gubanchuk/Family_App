// Which payments to remind about today: three days before and on the day, unpaid ones only.
type Payment = { id: string; household_id: string; title: string; amount: number; day: number; kind: string; total: number | null; first_month: string | null; deleted_at: string | null };
type Mark = { payment_id: string; month: string; paid: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (key: string) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const index = (key: string) => { const [y, m] = key.split('-').map(Number); return y * 12 + m - 1; };
const shift = (key: string, n: number) => { const t = index(key) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
const inRange = (p: Payment, month: string) => {
  // A monthly payment counts from the month it was added (first_month), like on the money screen.
  if (p.kind !== 'installment') return !p.first_month || p.first_month <= month;
  if (!p.first_month || !p.total) return false;
  const n = index(month) - index(p.first_month) + 1;
  return n >= 1 && n <= p.total;
};
const due = (p: Payment, month: string) => `${month}-${pad(Math.min(p.day, lastDay(month)))}`;
const plusDays = (iso: string, n: number) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n)).toISOString().slice(0, 10);

export function dueReminders(payments: Payment[], marks: Mark[], today: string) {
  const soonDay = plusDays(today, 3);
  const out: Array<{ payment: Payment; month: string; due: string; kind: 'soon' | 'today' }> = [];
  for (const p of payments) {
    if (p.deleted_at) continue;
    for (const [day, kind] of [[today, 'today'], [soonDay, 'soon']] as const) {
      const month = day.slice(0, 7);
      if (!inRange(p, month) || due(p, month) !== day) continue;
      if (marks.some((m) => m.payment_id === p.id && m.month === month && m.paid)) continue;
      out.push({ payment: p, month, due: day, kind });
    }
  }
  return out;
}
export { shift as shiftMonth };

// The months a run can remind about: today's, and the one three days ahead.
export const reminderMonths = (today: string) => [...new Set([today.slice(0, 7), plusDays(today, 3).slice(0, 7)])];

// Payment reminders are not quiet pushes, so they go out only between 9:00 and 21:00 Moscow time (UTC+3),
// whoever calls the function.
export const inSendWindow = (nowMs: number) => { const h = new Date(nowMs + 3 * 3600 * 1000).getUTCHours(); return h >= 9 && h < 21; };
