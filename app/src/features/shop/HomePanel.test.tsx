import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList } from './menuList';
import ShopPage from './ShopPage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 18, 30);

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  await db.meta.put({ key: 'features', value: ['homeCart'] });
  await regenerateWeekList(db, 'w-cur');
  return db;
}
const home = (db: ReturnType<typeof createLocalDb>, me = papa) =>
  render(<MemoryRouter initialEntries={['/shop?view=home']}><ShopPage me={me} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
const milk = (state: 'have' | 'out') => ({ household_id: 'h1', key: 'молоко', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', state, by_member: 'm-papa', updated_at: 'x', deleted_at: null });

describe('«Дома»', () => {
  it('empty home explains itself', async () => {
    const db = await ready();
    home(db);
    expect(await screen.findByRole('tab', { name: 'Дома', selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Купленное в магазине попадает сюда само/)).toBeInTheDocument();
  });

  it('adds a product from the dictionary or by its own name', async () => {
    const db = await ready();
    home(db, son);
    await userEvent.type(await screen.findByLabelText('Что есть дома'), 'твор');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить: творог' }));
    const dairy = (await screen.findByRole('heading', { name: 'Молочное и яйца' })).closest('section')!;
    expect(within(dairy).getByText('Творог')).toBeInTheDocument();
    expect((await db.home_stock.get(['h1', 'творог']))?.state).toBe('have');
    await userEvent.type(screen.getByLabelText('Что есть дома'), 'Корм для кота');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Корм для кота»' }));
    await waitFor(async () => expect(await db.home_stock.get(['h1', 't:корм для кота'])).toMatchObject({ state: 'have', item: null }));
  });

  it('out puts the product on the list for everyone', async () => {
    const db = await ready();
    await db.home_stock.put(milk('have'));
    home(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Молоко: закончилось' }));
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => i.source === 'home').map((i) => i.title)).toEqual(['Молоко']));
    expect((await db.home_stock.get(['h1', 'молоко']))?.state).toBe('out');
    expect(await screen.findByText(/закончилось · в покупках/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Список' }));
    expect(await screen.findByText('закончилось дома · Папа')).toBeInTheDocument();
  });

  it('found some again', async () => {
    const db = await ready();
    await db.home_stock.put(milk('out'));
    home(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Молоко: есть' }));
    await waitFor(async () => expect((await db.home_stock.get(['h1', 'молоко']))?.state).toBe('have'));
  });

  it('removes a product from home', async () => {
    const db = await ready();
    await db.home_stock.put(milk('have'));
    home(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Молоко: убрать из «Дома»' }));
    await waitFor(async () => expect((await db.home_stock.get(['h1', 'молоко']))?.deleted_at).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Молоко')).toBeNull());
  });

  it('no «Дома» before the server has it', async () => {
    const db = await ready();
    await db.meta.put({ key: 'features', value: [] });
    home(db);
    expect(await screen.findByRole('button', { name: /Иду в магазин/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Дома' })).toBeNull();
  });
});
