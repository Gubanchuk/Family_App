import { describe, expect, it } from 'vitest';
import { mineAsked, mineToDo, openTo, requestsWord, whenText } from './requestText';
import type { Request } from './types';

const r = (id: string, o: Partial<Request>): Request => ({ id, household_id: 'h', from_id: 'mama', to_id: 'son', title: id, due_on: null, urgent: false, status: 'open', done_at: null, updated_at: 'x', deleted_at: null, ...o });

describe('requests', () => {
  it('says when it is due in plain words', () => {
    expect(whenText('2026-10-15', '2026-10-15')).toBe('сегодня');
    expect(whenText('2026-10-16', '2026-10-15')).toBe('завтра');
    expect(whenText('2026-10-17', '2026-10-15')).toBe('к 17 октября');
    expect(whenText(null, '2026-10-15')).toBe('без срока');
  });
  it('lists my open requests urgent first, then by date, and keeps done ones at the bottom', () => {
    const list = [r('later', { due_on: '2026-10-20' }), r('urgent', { urgent: true }), r('soon', { due_on: '2026-10-16' }), r('done', { status: 'done' }), r('other', { to_id: 'papa' })];
    expect(mineToDo(list, 'son').map((x) => x.id)).toEqual(['urgent', 'soon', 'later', 'done']);
    expect(mineAsked(list, 'mama').map((x) => x.id)).toEqual(['urgent', 'soon', 'later', 'other', 'done']);
  });
  it('counts open requests to each person, skipping done, cancelled and deleted ones', () => {
    const list = [r('a', {}), r('b', { urgent: true }), r('c', { to_id: 'papa' }), r('d', { status: 'done' }), r('e', { status: 'cancelled' }), r('f', { deleted_at: 'x' })];
    const n = openTo(list);
    expect(n.get('son')).toBe(2);
    expect(n.get('papa')).toBe(1);
    expect(n.get('mama')).toBeUndefined();
  });
  it('names the count in Russian', () => {
    expect([1, 2, 5, 11, 21, 22].map(requestsWord)).toEqual(['1 просьба', '2 просьбы', '5 просьб', '11 просьб', '21 просьба', '22 просьбы']);
  });
});
