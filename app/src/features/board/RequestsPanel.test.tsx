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

describe('requests', () => {
  it('lets mom ask the son and the son mark it done', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const { unmount } = render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('О чём просим'), 'Вынести мусор');
    await userEvent.click(screen.getByRole('button', { name: 'Тёма' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));
    await userEvent.click(screen.getByRole('button', { name: 'Попросить' }));
    expect(await screen.findByText('Вынести мусор')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Вынести мусор: сделано' }));
    await waitFor(async () => expect((await db.requests.toArray())[0]).toMatchObject({ status: 'done' }));
  });

  it('shows a request from someone who left the family without breaking', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.requests.put({ id: 'r1', household_id: 'h', from_id: 'gone', to_id: 'son', title: 'Полить цветы', due_on: null, urgent: false, status: 'open', done_at: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Полить цветы')).toBeInTheDocument();
    expect(screen.getByText(/Кто-то/)).toBeInTheDocument();
  });
});
