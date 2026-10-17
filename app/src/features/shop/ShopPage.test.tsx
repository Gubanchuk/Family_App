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
import { SyncContext } from '../../data/SyncProvider';

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

  it('folds a department to its count and remembers it on the phone', async () => {
    localStorage.removeItem('fa.shop-folded');
    const db = await ready();
    const first = show(db);
    const toggle = await screen.findByRole('button', { name: 'Молочное и яйца' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(screen.queryByRole('button', { name: /Творог, 1,8 кг/ })).toBeNull();
    expect(toggle.closest('section')).toHaveTextContent(/осталось \d/);
    first.unmount();
    show(db);
    const again = await screen.findByRole('button', { name: 'Молочное и яйца' });
    expect(again).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(again);
    expect(screen.getByRole('button', { name: /Творог, 1,8 кг/ })).toBeInTheDocument();
  });

  it('folds a department by itself once everything in it is bought', async () => {
    localStorage.removeItem('fa.shop-folded');
    const db = await ready();
    show(db);
    const dairy = (await screen.findByRole('heading', { name: 'Молочное и яйца' })).closest('section')!;
    for (const b of within(dairy).getAllByRole('button', { pressed: false })) await userEvent.click(b);
    await waitFor(() => expect(within(dairy).getByRole('button', { name: 'Молочное и яйца' })).toHaveAttribute('aria-expanded', 'false'));
    expect(dairy).toHaveTextContent('всё куплено');
  });

  it('lets a parent leave past days of the week out of the list', async () => {
    const db = await ready();
    await db.meta.put({ key: 'features', value: ['listDays'] });
    show(db);
    expect(await screen.findByText('Список на всю неделю')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Какие дни' }));
    const sheet = screen.getByRole('dialog', { name: 'Из каких дней список' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'С сегодняшнего дня' }));
    expect(within(sheet).getByRole('button', { name: /^Пн/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(sheet).getByRole('button', { name: /^Вт/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.weeks.get('w-cur'))?.list_days).toEqual([1, 2, 3, 4, 5, 6]));
    expect(await screen.findByText('Список на дни: вт–вс')).toBeInTheDocument();
  });

  it('does not offer days before the server keeps them, nor to a child', async () => {
    const db = await ready();
    show(db);
    await screen.findByRole('heading', { name: 'Молочное и яйца' });
    expect(screen.queryByRole('button', { name: 'Какие дни' })).toBeNull();
  });

  it('sums what is bought and what is left, naming lines without a price', async () => {
    const db = await ready();
    show(db);
    expect(await screen.findByText(/Осталось ≈/)).toHaveTextContent(/· 1 без цены/);
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

  it('lets a wrong department be changed to any other', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Пластырь');
    const depts = screen.getByRole('group', { name: 'Отдел' });
    await userEvent.click(within(depts).getByRole('button', { name: 'Все отделы' }));
    await userEvent.click(within(depts).getByRole('button', { name: 'Молочное и яйца' }));
    await userEvent.type(screen.getByLabelText('Что купить'), ' детский');
    expect(within(screen.getByRole('group', { name: 'Отдел' })).getByRole('button', { name: 'Молочное и яйца' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    const region = await screen.findByRole('region', { name: 'Молочное и яйца' });
    expect(await within(region).findByRole('button', { name: 'Пластырь детский' })).toBeInTheDocument();
  });

  it('opens the add form straight from a link', async () => {
    const db = await ready();
    render(<MemoryRouter initialEntries={['/shop?add=1']}><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('dialog', { name: 'Добавить в список' })).toBeInTheDocument();
  });

  it('shows where a non-food line goes and lets you change it', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Пластырь');
    const depts = screen.getByRole('group', { name: 'Отдел' });
    expect(within(depts).getByRole('button', { name: 'Аптека' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(depts).getByRole('button', { name: 'Для дома' }));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    expect(await screen.findByRole('region', { name: 'Для дома' })).toBeInTheDocument();
  });

  it('keeps urgent lines in their own card on top of the departments', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Хлеб{Enter}');
    expect(await screen.findByRole('button', { name: 'Хлеб' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await userEvent.type(screen.getByLabelText('Что купить'), 'Сметана');
    await userEvent.click(screen.getByRole('switch', { name: 'Срочно' }));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в список' }));
    const card = await screen.findByRole('region', { name: 'Срочно' });
    expect(screen.getAllByRole('region')[0]).toBe(card);
    expect(within(card).getByRole('button', { name: 'Сметана, срочно' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Хлеб' })).toBeNull();
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

  it('keeps old purchases and offers for other weeks out of the list', async () => {
    const db = await ready();
    const line = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, household_id: 'h1', week_id: null, offer_id: null, source: 'manual' as const, item: null, title, qty: null, unit: null, qty_text: '', dept: 'Другое', urgent: false, est_price: null, added_by: 'm-mama', updated_at: 'x', deleted_at: null, ...extra });
    await db.shopping_items.bulkPut([line('u:old', 'Батарейки'), line('u:open', 'Лампочка'), line('o:past:рис', 'Рис к плову', { source: 'offer', offer_id: 'past' }), line('o:no:рис', 'Рис к отказу', { source: 'offer', offer_id: 'no' })]);
    await db.shopping_marks.put({ item_id: 'u:old', household_id: 'h1', bought: true, by_member: 'm-mama', price_real: null, updated_at: '2026-09-28T10:00:00Z' });
    const offer = (id: string, on_date: string, status: 'open' | 'declined') => ({ id, household_id: 'h1', from_member: 'm-mama', to_member: null, dish_id: 'mn-plov', on_date, meal: 'dinner' as const, how: 'over' as const, status, taken_by: null, updated_at: 'x', deleted_at: null });
    await db.dish_offers.bulkPut([offer('past', '2026-10-01', 'open'), offer('no', '2026-10-14', 'declined')]);
    show(db);
    expect(await screen.findByRole('button', { name: 'Лампочка' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Батарейки/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Рис к плову/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Рис к отказу/ })).toBeNull();
  });

  it('lets you remove a line added for an offered dish', async () => {
    const db = await ready();
    await db.dish_offers.put({ id: 'now', household_id: 'h1', from_member: 'm-mama', to_member: null, dish_id: 'mn-plov', on_date: '2026-10-14', meal: 'dinner', how: 'over', status: 'taken', taken_by: 'm-papa', updated_at: 'x', deleted_at: null });
    await db.shopping_items.put({ id: 'o:now:рис', household_id: 'h1', week_id: null, offer_id: 'now', source: 'offer', item: 'рис', title: 'Рис', qty: 300, unit: 'г', qty_text: '300 г', dept: 'Бакалея', urgent: false, est_price: 36, added_by: null, updated_at: 'x', deleted_at: null });
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: /Рис: цена/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Убрать из списка' }));
    await waitFor(async () => expect((await db.shopping_items.get('o:now:рис'))?.deleted_at).toBeTruthy());
  });

  it('keeps «Иду в магазин» and refusal notes on an empty list', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<SyncContext.Provider value={{ syncing: false, offline: false, pending: 0, syncedAt: null, message: 'Сервер не принял изменение. Вернули как было.', syncNow: async () => {}, dismiss: () => {} }}>
      <MemoryRouter><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>
    </SyncContext.Provider>);
    expect(await screen.findByRole('button', { name: 'Иду в магазин' })).toBeInTheDocument();
    expect(screen.getByText('Сервер не принял изменение. Вернули как было.')).toBeInTheDocument();
  });

  it('reads out the price with the line', async () => {
    const db = await ready();
    show(db);
    expect(await screen.findByRole('button', { name: /^Творог: цена 1\s?050\s₽$/ })).toBeInTheDocument();
  });
});
