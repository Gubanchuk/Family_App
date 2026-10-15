import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };

describe('BoardPage', () => {
  it('opens on wishes and switches between the four parts', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Доска' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Хотелки' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Просьбы' }));
    expect(screen.getByRole('tab', { name: 'Просьбы' })).toHaveAttribute('aria-selected', 'true');
  });
});
