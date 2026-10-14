import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import FoodCard from './FoodCard';

vi.mock('./memberSettings', () => ({ saveMealTimes: vi.fn(() => Promise.resolve()) }));
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('FoodCard', () => {
  it('lets a parent add and remove what the family does not eat', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<FoodCard me={papa} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /Не едим/ }));
    await userEvent.type(screen.getByLabelText('Продукт или блюдо'), 'грибы');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(async () => expect((await db.not_eat.toArray()).map((x) => x.ref)).toEqual(['грибы']));
    await userEvent.click(await screen.findByRole('button', { name: 'Убрать: грибы' }));
    await waitFor(async () => expect((await db.not_eat.toArray())[0].deleted_at).toBeTruthy());
  });

  it('shows the list read-only to a child', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'печень', updated_at: 'x', deleted_at: null });
    render(<FoodCard me={{ ...papa, role: 'child' }} db={db} />);
    expect(await screen.findByText('печень')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Не едим/ }));
    expect(screen.queryByLabelText('Продукт или блюдо')).toBeNull();
  });

  it('saves meal times on this phone and for the member', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<FoodCard me={papa} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /Время еды/ }));
    fireEvent.change(screen.getByLabelText('Ужин'), { target: { value: '18:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(JSON.parse(localStorage.getItem('fa.mealTimes')!).dinner).toBe('18:30');
  });
});
