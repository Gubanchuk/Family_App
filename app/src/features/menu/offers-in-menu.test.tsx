import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type DishOffer } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);
const offer = (o: Partial<DishOffer>): DishOffer => ({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'br-syrniki', on_date: '2026-10-13', meal: 'snack', how: 'over', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null, ...o });

describe('offers in the menu', () => {
  it('lists the day offers and lets me take one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({}));
    render(<MemoryRouter><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Предложили на этот день')).toBeInTheDocument();
    expect(screen.getByText('Мама просит на полдник, поверх меню')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сделаю' }));
    await waitFor(async () => expect((await db.dish_offers.get('o1'))?.status).toBe('taken'));
    expect(await screen.findByText('готовит Папа · на полдник')).toBeInTheDocument();
  });

  it('shows a taken «instead» dish in place of the menu dish', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({ dish_id: 'mn-plov', meal: 'dinner', how: 'instead', status: 'taken', taken_by: 'm-papa' }));
    render(<MemoryRouter><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Ужин: Плов/ })).toHaveTextContent('вместо: котлеты');
  });

  it('opens the offered dish from its row', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({ status: 'taken', taken_by: 'm-papa' }));
    render(<MemoryRouter><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /^Сырники: готовит Папа.*Открыть рецепт/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Сырники');
  });
});
