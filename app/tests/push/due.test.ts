// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dueReminders } from '../../../supabase/functions/_shared/due';

const pay = (o: Record<string, unknown>) => ({ id: 'p', household_id: 'h', title: 'Интернет', amount: 650, day: 16, kind: 'monthly', total: null, first_month: null, deleted_at: null, ...o });

describe('payment reminders', () => {
  it('reminds three days before and on the day, only while unpaid', () => {
    expect(dueReminders([pay({})] as never, [], '2026-10-13').map((r) => r.kind)).toEqual(['soon']);
    expect(dueReminders([pay({})] as never, [], '2026-10-16').map((r) => r.kind)).toEqual(['today']);
    expect(dueReminders([pay({})] as never, [], '2026-10-14')).toEqual([]);
    expect(dueReminders([pay({})] as never, [{ payment_id: 'p', month: '2026-10', paid: true }] as never, '2026-10-16')).toEqual([]);
  });
  it('reminds a payment on the 31st on the last day of a short month, and not after an installment ended', () => {
    expect(dueReminders([pay({ day: 31 })] as never, [], '2026-02-28').map((r) => r.due)).toEqual(['2026-02-28']);
    expect(dueReminders([pay({ kind: 'installment', total: 2, first_month: '2026-08', day: 16 })] as never, [], '2026-10-16')).toEqual([]);
  });
  it('looks into next month for a «soon» reminder at the end of this one', () => {
    expect(dueReminders([pay({ day: 1 })] as never, [], '2026-10-29').map((r) => [r.kind, r.month])).toEqual([['soon', '2026-11']]);
  });
});
