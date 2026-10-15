import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';
import { bankOf } from './boardMath';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
const wish = { id: 'w1', household_id: 'h', owner_id: 'son', title: 'Велосипед', price: 25000, saved: 8000, done_at: null, created_by: 'son', updated_at: 'x', deleted_at: null };
const goal = { id: 'g1', household_id: 'h', owner_id: null, title: 'Море', target: 120000, saved: 30000, steps: [], created_by: 'mama', updated_at: 'x', deleted_at: null };
const dep = (id: string, o: Record<string, unknown>) => ({ id, household_id: 'h', wish_id: null, goal_id: null, member_id: 'mama', amount: 2000, created_at: new Date().toISOString(), updated_at: 'x', deleted_at: null, ...o });

async function board(me: Member, ready = true, tab = 'wishes') {
  const db = createLocalDb(`t-${Math.random()}`);
  await db.wishes.put(wish);
  await db.goals.put(goal);
  // As after a full pull from a server that has the deposits table.
  if (ready) await db.meta.put({ key: 'missing_tables', value: [] });
  render(<MemoryRouter initialEntries={[`/board?tab=${tab}`]}><BoardPage me={me} members={[mama, son]} db={db} /></MemoryRouter>);
  return db;
}

describe('piggy bank deposits', () => {
  it('sums deposits per wish and goal, without the ones taken back', () => {
    const bank = bankOf([dep('d1', { wish_id: 'w1' }), dep('d2', { wish_id: 'w1', amount: 500 }), dep('d3', { goal_id: 'g1', amount: 7000 }), dep('d4', { wish_id: 'w1', deleted_at: 'y' })] as never);
    expect(bank.get('w1')).toBe(2500);
    expect(bank.get('g1')).toBe(7000);
  });

  it('adds deposits on top of what was already in the piggy bank', async () => {
    const db = await board(mama);
    await db.deposits.put(dep('d1', { wish_id: 'w1' }));
    expect(await screen.findByText('в копилке 10 000 ₽')).toBeInTheDocument();
  });

  it('puts money in as its own deposit and shows who put it', async () => {
    const db = await board(son);
    await userEvent.click(await screen.findByRole('button', { name: /Велосипед, открыть/ }));
    await userEvent.type(screen.getByLabelText('Положить в копилку, ₽'), '1500');
    await userEvent.click(screen.getByRole('button', { name: 'Положить' }));
    await waitFor(async () => expect(await db.deposits.toArray()).toMatchObject([{ wish_id: 'w1', member_id: 'son', amount: 1500, deleted_at: null }]));
    expect((await db.wishes.get('w1'))?.saved).toBe(8000);
    await userEvent.click(await screen.findByRole('button', { name: /Велосипед, открыть/ }));
    const history = screen.getByRole('list', { name: 'История копилки' });
    expect(within(history).getByText(/Тёма · 1\s500\s₽/)).toBeInTheDocument();
  });

  it('lets the author take a fresh deposit back, and nobody else', async () => {
    const db = await board(mama);
    await db.deposits.bulkPut([dep('d1', { wish_id: 'w1' }), dep('d2', { wish_id: 'w1', member_id: 'son', amount: 700 })]);
    await userEvent.click(await screen.findByRole('button', { name: /Велосипед, открыть/ }));
    const history = screen.getByRole('list', { name: 'История копилки' });
    expect(within(history).getAllByRole('button', { name: /Убрать/ })).toHaveLength(1);
    await userEvent.click(within(history).getByRole('button', { name: /Убрать/ }));
    await waitFor(async () => expect((await db.deposits.get('d1'))?.deleted_at).toBeTruthy());
  });

  it('keeps the old piggy bank until the server has the deposits table', async () => {
    const db = await board(mama, false);
    await userEvent.click(await screen.findByRole('button', { name: /Велосипед, открыть/ }));
    await userEvent.type(screen.getByLabelText('Положить в копилку, ₽'), '2000');
    await userEvent.click(screen.getByRole('button', { name: 'Положить' }));
    await waitFor(async () => expect((await db.wishes.get('w1'))?.saved).toBe(10000));
    expect(await db.deposits.count()).toBe(0);
  });

  it('puts money into a goal as a deposit as well', async () => {
    const db = await board(mama, true, 'goals');
    await userEvent.click(await screen.findByRole('button', { name: /Море, открыть/ }));
    await userEvent.type(screen.getByLabelText('Положить в копилку, ₽'), '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Положить' }));
    await waitFor(async () => expect(await db.deposits.toArray()).toMatchObject([{ goal_id: 'g1', member_id: 'mama', amount: 5000 }]));
    expect(await screen.findByText('35 000 ₽')).toBeInTheDocument();
  });
});
