import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList } from '../shop/menuList';
import HomePage from './HomePage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const dima: Member = { ...papa, id: 'm-dima', user_id: null, name: 'Дима', role: 'child', is_owner: false, portion: 0.5 };
const TUESDAY_MORNING = new Date(2026, 9, 13, 11, 40);

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  await regenerateWeekList(db, 'w-cur');
  return db;
}

describe('HomePage', () => {
  it('greets, shows the family and today with the next meal large', async () => {
    const db = await ready();
    render(<MemoryRouter><HomePage me={papa} members={[papa, { ...mama, name: 'Оля', kin: 'mother' }, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Доброе утро, Папа' })).toBeInTheDocument();
    expect(screen.getByText('вторник, 13 октября')).toBeInTheDocument();
    // Who someone is in the family; the bare role only while nobody has said.
    expect(await screen.findByText('мама')).toBeInTheDocument();
    expect(screen.getByText('родитель')).toBeInTheDocument();
    expect(screen.getByText('без входа')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ужин в 19:00 — котлеты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Борщ, 2-й день из 7/ })).toHaveTextContent('Обед');
    expect(screen.getByRole('link', { name: /Покупки/ })).toHaveTextContent('9');
  });

  it('puts an offer for me and an urgent purchase on top', async () => {
    const db = await ready();
    await db.shopping_items.put({ id: 'u:1', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Молоко', qty: null, unit: null, qty_text: '2 л', dept: 'Другое', urgent: true, est_price: null, added_by: 'm-mama', updated_at: 'x', deleted_at: null });
    const { unmount } = render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Срочно купить: Молоко' })).toBeInTheDocument();
    unmount();
    await db.dish_offers.put({ id: 'o1', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-13', meal: 'dinner', how: 'instead', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Мама просит: Плов' })).toBeInTheDocument();
    expect(screen.getByText('Предложили на сегодня')).toBeInTheDocument();
  });

  it('opens the recipe of a meal of today, and sends «Заменить» to the menu', async () => {
    const db = await ready();
    const Where = () => <p>{`Меню${useLocation().search}`}</p>;
    render(<MemoryRouter><Routes><Route path="/" element={<HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} />} /><Route path="/menu" element={<Where />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Котлеты/ }));
    expect(await screen.findByRole('heading', { name: 'Котлеты' })).toBeInTheDocument();
    expect(await screen.findByText('Фарш')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));
    expect(await screen.findByText('Меню?replace=dinner')).toBeInTheDocument();
  });

  it('puts a request for me on top and ticks it from Home', async () => {
    const db = await ready();
    await db.requests.put({ id: 'r1', household_id: 'h1', from_id: 'm-mama', to_id: 'm-papa', title: 'Забрать посылку', due_on: '2026-10-13', urgent: false, status: 'open', done_at: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Мама просит: Забрать посылку' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сделано' }));
    await waitFor(async () => expect((await db.requests.get('r1'))?.status).toBe('done'));
  });

  it('shows the closest family goal as a tile', async () => {
    const db = await ready();
    await db.goals.put({ id: 'g1', household_id: 'h1', owner_id: null, title: 'Море летом', target: 120000, saved: 30000, steps: [], created_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Цель.*25%.*Море летом/ })).toHaveAttribute('href', '/board?tab=goals');
  });

  it('tells a parent about a payment due within a week', async () => {
    const db = await ready();
    await db.payments.put({ id: 'p1', household_id: 'h1', title: 'Интернет и ТВ', amount: 650, day: 16, kind: 'monthly', total: null, first_month: null, note: '', created_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Скоро платить.*650\s₽.*Интернет и ТВ · через 3 дня/ })).toHaveAttribute('href', '/money');
  });

  it('asks to choose a week when there is none', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Меню на эту неделю ещё не выбрано' })).toBeInTheDocument();
  });

  it('shows the dish cooked instead of the dinner and links straight to its recipe', async () => {
    const db = await ready();
    await db.dish_offers.put({ id: 'o3', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'mn-plov', on_date: '2026-10-13', meal: 'dinner', how: 'instead', status: 'taken', taken_by: 'm-papa', updated_at: 'x', deleted_at: null });
    const { unmount } = render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Ужин в 19:00 — плов' })).toBeInTheDocument();
    unmount();
    await db.dish_offers.put({ id: 'o4', household_id: 'h1', from_member: 'm-mama', to_member: 'm-papa', dish_id: 'br-syrniki', on_date: '2026-10-13', meal: 'snack', how: 'over', status: 'open', taken_by: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><HomePage me={papa} members={[papa, mama, dima]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Рецепт' })).toHaveAttribute('href', '/menu?panel=ideas&recipe=br-syrniki');
  });

  it('offers a parent to call the rest of the family while it is small', async () => {
    const db = await ready();
    const { unmount } = render(<MemoryRouter><HomePage me={papa} members={[papa, mama]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Позвать/ })).toHaveAttribute('href', '/settings');
    unmount();
    const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };
    render(<MemoryRouter><HomePage me={son} members={[papa, son]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Доброе утро, Сын' });
    expect(screen.queryByRole('link', { name: /Позвать/ })).toBeNull();
  });

  it('asks a child to propose a week, not to choose one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };
    render(<MemoryRouter><HomePage me={son} members={[papa, son]} db={db} today={TUESDAY_MORNING} /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Предложить неделю' })).toBeInTheDocument();
  });
});

