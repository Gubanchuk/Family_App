import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { regenerateWeekList, menuItemId } from './menuList';
import ShopPage from './ShopPage';
import ToastProvider from '../shell/Toast';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 18, 30);

async function ready(withTrip = true) {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  if (withTrip) await db.meta.put({ key: 'features', value: ['homeCart', 'tripList'] });
  await regenerateWeekList(db, 'w-cur');
  return db;
}
const show = (db: ReturnType<typeof createLocalDb>) =>
  render(<MemoryRouter><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></MemoryRouter>);

describe('«Поход»', () => {
  it('keeps the old list without the server column', async () => {
    const db = await ready(false);
    show(db);
    expect(await screen.findByRole('button', { name: /Иду в магазин/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Поход' })).toBeNull();
  });

  it('opens on the trip, takes the week menu into it and totals it', async () => {
    const db = await ready();
    show(db);
    expect(await screen.findByRole('tab', { name: 'Поход', selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Поход пока пуст/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Всё по меню/ }));
    await waitFor(async () => expect((await db.shopping_items.get(menuItemId('w-cur', 'творог')))?.in_trip).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: /Иду в магазин/ })).toBeEnabled());
    const sum = screen.getByRole('region', { name: 'Итог похода' });
    expect(sum).toHaveTextContent(/В походе [1-9]\d* товар/);
    expect(sum).toHaveTextContent(/≈/);
  });

  it('goes to the shop without any sheet and ticks lines into the cart', async () => {
    const db = await ready();
    const id = menuItemId('w-cur', 'творог');
    const curd = (await db.shopping_items.get(id))!;
    await db.shopping_items.put({ ...curd, in_trip: true });
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: /Иду в магазин/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByRole('button', { name: /Закончить/ });
    const sum = screen.getByRole('region', { name: 'Итог похода' });
    expect(sum).toHaveTextContent('В корзине');
    expect(sum).toHaveTextContent('Осталось');
    const dairy = (await screen.findByRole('heading', { name: 'Молочное и яйца' })).closest('section')!;
    await userEvent.click(within(dairy).getByRole('button', { name: /^Творог,/ }));
    await waitFor(async () => expect((await db.shopping_marks.get(id))?.bought).toBe(true));
    expect(await screen.findByRole('button', { name: /Закончить/ })).toBeInTheDocument();
  });

  it('adds a new product of the family once and finds it next time', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: /Найти и добавить товар/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Добавить товар' });
    await userEvent.type(within(sheet).getByRole('textbox'), 'Чипсы');
    await userEvent.click(within(sheet).getByRole('button', { name: /Новый товар «Чипсы»/ }));
    await userEvent.click(within(sheet).getByRole('button', { name: /^Подробнее/ }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'упаковка' }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: /Цена за 1 упаковку/ }), '120');
    await userEvent.click(within(sheet).getByRole('button', { name: /Добавить · 120/ }));
    await waitFor(async () => expect((await db.shopping_items.toArray()).find((i) => i.title === 'Чипсы')).toMatchObject({ unit: 'уп', qty: 1, est_price: 120, in_trip: true }));
    await userEvent.type(within(sheet).getByRole('textbox'), 'чип');
    const found = await within(sheet).findByRole('button', { name: /^Добавить: Чипсы/ });
    expect(found.textContent?.replace(/\s/g, ' ')).toContain('≈ 120 ₽/уп.');
  });

  it('takes an ended trip back with «Вернуться»', async () => {
    const db = await ready();
    const id = menuItemId('w-cur', 'творог');
    await db.shopping_items.put({ ...(await db.shopping_items.get(id))!, in_trip: true });
    render(<MemoryRouter><ToastProvider><ShopPage me={papa} members={[papa, mama]} db={db} today={new Date()} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Иду в магазин/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Закончить/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Вернуться' }));
    expect(await screen.findByRole('button', { name: /Закончить/ })).toBeInTheDocument();
  });

  it('in the whole list the square buys and the name opens the line; bought lines fold into «Куплено»', async () => {
    const db = await ready();
    render(<MemoryRouter initialEntries={['/shop?view=list']}><ToastProvider><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    const id = menuItemId('w-cur', 'творог');
    await userEvent.click(await screen.findByRole('button', { name: /^Творог: открыть/ }));
    expect(await screen.findByRole('dialog', { name: 'Творог' })).toBeInTheDocument();
    expect(await db.shopping_marks.get(id)).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('button', { name: /^Творог, / }));
    await waitFor(async () => expect((await db.shopping_marks.get(id))?.bought).toBe(true));
    expect(await screen.findByText('«Творог» — куплено')).toBeInTheDocument();
    const done = await screen.findByRole('button', { name: /^Куплено/ });
    expect(done).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Творог: открыть/ })).toBeNull();
    await userEvent.click(done);
    expect(await screen.findByRole('button', { name: /^Творог: открыть/ })).toBeInTheDocument();
  });

  it('picks several lines and marks them bought at once, or removes them with «Вернуть»', async () => {
    const db = await ready();
    render(<MemoryRouter initialEntries={['/shop?view=list']}><ToastProvider><ShopPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать' }));
    const [first, second] = screen.getAllByRole('button', { name: /^Выбрать: / });
    await userEvent.click(first);
    await userEvent.click(second);
    const bar = screen.getByRole('region', { name: 'Выбранные строки' });
    expect(bar).toHaveTextContent('Выбрано 2');
    await userEvent.click(within(bar).getByRole('button', { name: 'Куплено' }));
    await waitFor(async () => expect((await db.shopping_marks.toArray()).filter((m) => m.bought)).toHaveLength(2));
    expect(await screen.findByText(/Куплено: 2 товара — траты записаны/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Выбрать' }));
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать все' }));
    const bar2 = screen.getByRole('region', { name: 'Выбранные строки' });
    await userEvent.click(within(bar2).getByRole('button', { name: 'Убрать' }));
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => i.source === 'menu' && i.week_id === 'w-cur' && !i.deleted_at).length).toBe(2));
    await userEvent.click(await screen.findByRole('button', { name: 'Вернуть' }));
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => i.source === 'menu' && i.week_id === 'w-cur' && !i.deleted_at).length).toBeGreaterThan(2));
  });
});
