import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import MenuPage from '../menu/MenuPage';
import ToastProvider from '../shell/Toast';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

async function open() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
  return db;
}

describe('Что покушать', () => {
  it('filters by collection and finds a dish by a product', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Сладкое' }));
    expect(screen.getByRole('button', { name: /Печёные яблоки/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сырники/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Все' }));
    await userEvent.type(screen.getByRole('searchbox'), 'творог');
    expect(await screen.findByRole('button', { name: /^Сырники/ })).toBeInTheDocument();
  });

  it('shows a recipe for the family and offers it to a member', async () => {
    const db = await open();
    await userEvent.type(await screen.findByRole('searchbox'), 'сырники');
    await userEvent.click(await screen.findByRole('button', { name: /^Сырники/ }));
    const sheet = screen.getByRole('dialog', { name: 'Сырники' });
    expect(within(sheet).getByText('450 г')).toBeInTheDocument();
    expect(within(sheet).getByText('есть дома')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Мама' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Завтра' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Предложить' }));
    await waitFor(async () => expect((await db.dish_offers.toArray()).map((o) => [o.to_member, o.on_date, o.meal, o.status])).toEqual([['m-mama', '2026-10-14', 'breakfast', 'open']]));
  });

  it('puts an offer for me on top with «Сделаю»', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-13', meal: 'dinner', how: 'instead', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Мама просит: Плов' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сделаю' }));
    await waitFor(async () => expect((await db.dish_offers.get('o1'))?.status).toBe('taken'));
  });

  it('hides dishes the family does not eat', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.not_eat.put({ household_id: 'h1', kind: 'item', ref: 'творог', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.type(await screen.findByRole('searchbox'), 'сырники');
    expect(await screen.findByText(/Ничего не нашли/)).toBeInTheDocument();
  });

  it('opens a recipe named in the link', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas&recipe=mn-plov']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('dialog', { name: 'Плов' })).toBeInTheDocument();
  });

  it('says «Завтра» rather than a date for a request for tomorrow', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put({ id: 'o2', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-14', meal: 'dinner', how: 'over', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText(/^Завтра на ужин, поверх меню/)).toBeInTheDocument();
  });

  it('names the menu dish an offer would replace and confirms who got the request', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><ToastProvider><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.type(await screen.findByRole('searchbox'), 'сырники');
    await userEvent.click(await screen.findByRole('button', { name: /^Сырники/ }));
    const sheet = screen.getByRole('dialog', { name: 'Сырники' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Вместо: овсяная каша' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Мама' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Предложить' }));
    expect(await screen.findByText('Мама получит просьбу: сырники, сегодня на завтрак.')).toBeInTheDocument();
  });
});

