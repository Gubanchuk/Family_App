import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };
const goal = { id: 'g1', household_id: 'h', owner_id: null, title: 'Море летом', target: 120000, saved: 40000, steps: [{ id: 'a', t: 'Выбрать место', done: true }, { id: 'b', t: 'Накопить на билеты', done: false }], created_by: 'mama', updated_at: 'x', deleted_at: null };

describe('goals', () => {
  it('shows a family goal with its sum, the next step and the count, also to a child', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.goals.put(goal);
    render(<MemoryRouter initialEntries={['/board?tab=goals']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Море летом' })).toBeInTheDocument();
    expect(screen.getByText('Семья')).toBeInTheDocument();
    expect(screen.getByText('40 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('Дальше: накопить на билеты · шагов 1 из 2')).toBeInTheDocument();
  });

  it('opens the goal a link names, as the goal tile on Home does', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.goals.put(goal);
    render(<MemoryRouter initialEntries={['/board?tab=goals&goal=g1']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByRole('checkbox', { name: 'Накопить на билеты' })).toBeInTheDocument();
  });

  it('lets a parent tick a step and put money aside', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.goals.put(goal);
    render(<MemoryRouter initialEntries={['/board?tab=goals']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Море летом, открыть' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Накопить на билеты' }));
    await userEvent.type(screen.getByLabelText('Положить в копилку, ₽'), '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Положить' }));
    await waitFor(async () => expect(await db.goals.get('g1')).toMatchObject({ saved: 45000, steps: [{ done: true }, { done: true }] }));
  });

  it('does not offer a child to create a family goal', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board?tab=goals']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    expect(screen.queryByRole('button', { name: 'Семейная' })).toBeNull();
  });
});
