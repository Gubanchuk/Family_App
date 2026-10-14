import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList, menuItemId } from './menuList';
import ShopPage from './ShopPage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 18, 30);

async function ready() {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  await regenerateWeekList(db, 'w-cur');
  return db;
}
const show = (db: ReturnType<typeof createLocalDb>, extra: Partial<Parameters<typeof ShopPage>[0]> = {}) =>
  render(<MemoryRouter><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} {...extra} /></MemoryRouter>);

describe('ShopPage', () => {
  it('shows the week list by department and marks a purchase for everyone', async () => {
    const db = await ready();
    show(db);
    const dairy = (await screen.findByRole('heading', { name: 'Молочное и яйца' })).closest('section')!;
    await userEvent.click(within(dairy).getByRole('button', { name: /Творог, 1,8 кг/ }));
    await waitFor(async () => expect((await db.shopping_marks.get(menuItemId('w-cur', 'творог')))?.bought).toBe(true));
    expect(await screen.findByText('Отмечено 1 из 9')).toBeInTheDocument();
    expect(await db.outbox.where('table').equals('shopping_marks').count()).toBe(1);
  });

  it('sums what is bought and what is left, naming lines without a price', async () => {
    const db = await ready();
    show(db);
    expect(await screen.findByText(/Осталось ≈/)).toHaveTextContent(/без 1 продукта/);
  });

  it('adds an urgent item by hand', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Молоко');
    await userEvent.type(screen.getByLabelText('Сколько'), '2 л');
    await userEvent.click(screen.getByRole('switch', { name: 'Срочно' }));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    expect(await screen.findByRole('button', { name: /Молоко, 2 л/ })).toHaveTextContent('срочно');
  });

  it('copies what is left as text', async () => {
    const db = await ready();
    await db.shopping_marks.put({ item_id: menuItemId('w-cur', 'гречка'), household_id: 'h1', bought: true, by_member: 'm-papa', price_real: null, updated_at: 'x' });
    const writeText = vi.fn(() => Promise.resolve());
    show(db, { clipboard: { writeText } });
    await userEvent.click(await screen.findByRole('button', { name: 'Скопировать' }));
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('— Творог, 1,8 кг');
    expect(text).not.toContain('Гречка');
    expect(await screen.findByText('Список скопирован')).toBeInTheDocument();
  });

  it('tells the family who went to the shop', async () => {
    const db = await ready();
    await db.shop_trips.put({ id: 't1', household_id: 'h1', member_id: 'm-mama', started_at: new Date(2026, 9, 13, 18, 10).toISOString(), updated_at: 'x' });
    show(db);
    expect(await screen.findByText('Мама в магазине с 18:10')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Иду в магазин' }));
    await waitFor(async () => expect(await db.shop_trips.count()).toBe(2));
    expect(await screen.findByRole('button', { name: 'Вы в магазине' })).toBeDisabled();
  });

  it('explains where the list comes from when it is empty', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    show(db);
    expect(await screen.findByText(/Список соберётся сам, когда родитель утвердит неделю/)).toBeInTheDocument();
  });
});
