import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
function Back() { const nav = useNavigate(); return <button type="button" onClick={() => nav(-1)}>Назад</button>; }

describe('BoardPage', () => {
  it('opens on wishes and switches between the four parts', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Доска' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Хотелки' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Просьбы' }));
    expect(screen.getByRole('tab', { name: 'Просьбы' })).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves no copy of the page to go back through after the add form is closed by the cross', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/', '/board']} initialIndex={1}>
      <Routes>
        <Route path="/" element={<p>Главная</p>} />
        <Route path="/board" element={<><BoardPage me={mama} members={[mama, son]} db={db} /><Back /></>} />
      </Routes>
    </MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Новая хотелка' })).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(await screen.findByText('Главная')).toBeInTheDocument();
  });
});
