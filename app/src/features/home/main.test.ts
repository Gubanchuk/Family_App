import { describe, expect, it } from 'vitest';
import type { DishOffer, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Request } from '../board/types';
import type { MonthPayment } from '../money/month';
import { dateLine, greeting, mainThing } from './main';

const papa = { id: 'm-papa' } as Member;
const offer = { id: 'o1', from_member: 'm-mama', to_member: 'm-papa', status: 'open', on_date: '2026-10-13' } as DishOffer;
const milk = { id: 'u:1', title: 'Молоко', urgent: true } as ShoppingItem;

describe('home main thing', () => {
  it('puts a dish offered to me first, then an urgent purchase, then dinner', () => {
    const base = { me: papa, today: '2026-10-13', offers: [] as DishOffer[], urgent: [] as ShoppingItem[], dinner: 'котлеты', hasWeek: true };
    expect(mainThing({ ...base, offers: [offer], urgent: [milk] })).toEqual({ kind: 'offer', offer });
    expect(mainThing({ ...base, offers: [{ ...offer, from_member: 'm-papa' }], urgent: [milk] })).toEqual({ kind: 'urgent', item: milk });
    expect(mainThing(base)).toEqual({ kind: 'dinner', text: 'котлеты' });
    expect(mainThing({ ...base, hasWeek: false, dinner: null })).toEqual({ kind: 'no-week' });
  });
  it('puts a request for me due today or urgent before an offered dish and an urgent purchase', () => {
    const base = { me: papa, today: '2026-10-13', offers: [] as DishOffer[], urgent: [milk], dinner: 'котлеты', hasWeek: true };
    const req = (o: Partial<Request>) => ({ id: 'r', household_id: 'h', from_id: 'm-mama', to_id: 'm-papa', title: 'Забрать посылку', due_on: '2026-10-13', urgent: false, status: 'open', done_at: null, updated_at: '', deleted_at: null, ...o }) as Request;
    expect(mainThing({ ...base, requests: [req({})] })).toEqual({ kind: 'request', request: req({}) });
    expect(mainThing({ ...base, offers: [offer], requests: [req({})] })).toEqual({ kind: 'request', request: req({}) });
    expect(mainThing({ ...base, offers: [offer], requests: [req({ due_on: null, urgent: true })] }).kind).toBe('request');
    expect(mainThing({ ...base, offers: [offer], requests: [req({ due_on: '2026-10-14' })] })).toEqual({ kind: 'offer', offer });
    expect(mainThing({ ...base, requests: [req({ due_on: '2026-10-14' })] })).toEqual({ kind: 'urgent', item: milk });
    expect(mainThing({ ...base, requests: [req({ due_on: null, urgent: true })] }).kind).toBe('request');
    expect(mainThing({ ...base, requests: [req({ to_id: 'm-son' })] }).kind).toBe('urgent');
    expect(mainThing({ ...base, requests: [req({ status: 'done' })] }).kind).toBe('urgent');
  });

  it('puts an overdue payment of a parent before an offered dish, and after a request that cannot wait', () => {
    const base = { me: { ...papa, role: 'parent' as const }, today: '2026-10-13', offers: [offer], urgent: [milk], dinner: 'котлеты', hasWeek: true };
    const late = { p: { id: 'p1', title: 'Интернет и ТВ', amount: 650 }, month: '2026-10', due: '2026-10-11', no: null, mark: undefined, paid: false, amount: 650 } as MonthPayment;
    expect(mainThing({ ...base, pay: late })).toEqual({ kind: 'pay', pay: late });
    // Due today or later is not overdue yet: the tile below tells about it.
    expect(mainThing({ ...base, pay: { ...late, due: '2026-10-13' } }).kind).toBe('offer');
    expect(mainThing({ ...base, pay: { ...late, paid: true } }).kind).toBe('offer');
    // Children never get payments on top.
    expect(mainThing({ ...base, me: { ...papa, role: 'child' as const }, pay: late }).kind).toBe('offer');
    const urgentRequest = { id: 'r', from_id: 'm-mama', to_id: 'm-papa', title: 'Забрать посылку', due_on: null, urgent: true, status: 'open' } as Request;
    expect(mainThing({ ...base, pay: late, requests: [urgentRequest] }).kind).toBe('request');
  });

  it('greets by the time of day and names the date', () => {
    expect(greeting(new Date(2026, 9, 13, 7, 0))).toBe('Доброе утро');
    expect(greeting(new Date(2026, 9, 13, 14, 0))).toBe('Добрый день');
    expect(greeting(new Date(2026, 9, 13, 20, 0))).toBe('Добрый вечер');
    expect(greeting(new Date(2026, 9, 13, 2, 0))).toBe('Доброй ночи');
    expect(dateLine(new Date(2026, 9, 13))).toBe('вторник, 13 октября');
  });
});
