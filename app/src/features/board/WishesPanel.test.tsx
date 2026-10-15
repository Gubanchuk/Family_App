import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
const wish = { id: 'w1', household_id: 'h', owner_id: 'son', title: 'Велосипед', price: 25000, saved: 8000, done_at: null, created_by: 'son', updated_at: 'x', deleted_at: null };

describe('wishes', () => {
  it('shows a wish with its piggy bank and lets someone else say «я тоже»', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.wishes.put(wish);
    render(<MemoryRouter initialEntries={['/board']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Велосипед')).toBeInTheDocument();
    expect(screen.getByText('в копилке 8 000 ₽')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Я тоже · 0/ }));
    await waitFor(async () => expect(await db.wish_metoo.get(['w1', 'mama'])).toMatchObject({ deleted_at: null }));
  });

  it('lets a parent mark a gift that the child never sees', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.wishes.put(wish);
    const { unmount } = render(<MemoryRouter initialEntries={['/board']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Беру в подарок' }));
    expect(await screen.findByText('Подарок от мамы')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter initialEntries={['/board']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Велосипед')).toBeInTheDocument();
    expect(screen.queryByText(/Подарок/)).toBeNull();
  });

  it('adds a wish for oneself from «Добавить»', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board?tab=wishes']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что хочется'), 'Наушники');
    await userEvent.type(screen.getByLabelText('Сколько стоит, ₽'), '3500');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.wishes.toArray())[0]).toMatchObject({ title: 'Наушники', price: 3500, owner_id: 'son' }));
  });
});
