import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { needLine, needState, sendNeedToShop } from './needToShop';
import type { Need } from './types';

const me: Member = { id: 'mama', household_id: 'h', user_id: 'u', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const need: Need = { id: 'n1', household_id: 'h', for_id: 'son', title: 'Зимние ботинки', note: 'размер 37', due_on: '2026-11-01', price: 6000, created_by: 'mama', updated_at: 'x', deleted_at: null };

describe('things to buy → shopping list', () => {
  it('puts clothes for a person and things for the house into the right departments', () => {
    expect(needLine(need, 'Тёма')).toEqual({ id: 'n:n1', dept: 'Одежда и обувь', title: 'Зимние ботинки', qty_text: 'размер 37 · для Тёма', est_price: 6000 });
    expect(needLine({ ...need, for_id: null, note: '' }, null)).toMatchObject({ dept: 'Для дома', qty_text: '' });
  });
  it('keeps the shopping line within its 40 characters even with a long note and name', () => {
    const line = needLine({ ...need, note: 'рост 98, цвет тёмно-синий, без капюшона' }, 'Константин');
    expect(line.qty_text.length).toBeLessThanOrEqual(40);
    expect(line.qty_text.endsWith('для Константин')).toBe(true);
  });

  it('adds the line once even if tapped twice', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    expect(await sendNeedToShop(db, me, need, 'Тёма')).toBe('added');
    expect(await sendNeedToShop(db, me, need, 'Тёма')).toBe('already');
    expect(await db.shopping_items.count()).toBe(1);
  });
  it('follows the line: in the list, then bought', () => {
    const item = { id: 'n:n1' } as never;
    expect(needState(need, new Map(), new Map())).toBe('todo');
    expect(needState(need, new Map([['n:n1', item]]), new Map())).toBe('in-shop');
    expect(needState(need, new Map([['n:n1', item]]), new Map([['n:n1', { bought: true } as never]]))).toBe('bought');
  });
});
