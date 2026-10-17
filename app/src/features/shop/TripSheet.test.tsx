import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { menuItemId, regenerateWeekList } from './menuList';
import ShopPage from './ShopPage';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 18, 30);

async function ready(withColumn = true) {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  if (withColumn) await db.meta.put({ key: 'features', value: ['homeCart'] });
  await regenerateWeekList(db, 'w-cur');
  return db;
}
const show = (db: ReturnType<typeof createLocalDb>, me = papa) =>
  render(<MemoryRouter><ShopPage me={me} members={[papa, mama, son]} db={db} today={TUESDAY} /></MemoryRouter>);
const pickBreakfastTomorrow = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Иду в магазин' }));
  const sheet = await screen.findByRole('dialog', { name: 'Что берём' });
  await userEvent.click(within(sheet).getByRole('button', { name: 'Завтра' }));
  await userEvent.click(within(sheet).getByRole('button', { name: 'Завтрак' }));
  return sheet;
};
// «Пошли» opens up once the sheet has read the menu and found something to buy.
const go = async (sheet: HTMLElement) => {
  const button = within(sheet).getByRole('button', { name: 'Пошли' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
};

describe('a cart for one trip', () => {
  it('picks breakfast tomorrow and shops only for it', async () => {
    const db = await ready();
    show(db);
    await go(await pickBreakfastTomorrow());
    expect(await screen.findByRole('tab', { name: 'Корзина', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Творог,/ })).toHaveTextContent('на завтрак: 450 г');
    expect(screen.getByRole('button', { name: /^Яйца,/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Фарш,/ })).toBeNull();
    const [trip] = await db.shop_trips.toArray();
    expect(trip).toMatchObject({ member_id: 'm-papa', label: 'завтрак на завтра' });
    await userEvent.click(screen.getByRole('tab', { name: 'Весь список' }));
    expect(await screen.findByRole('button', { name: /^Фарш,/ })).toBeInTheDocument();
  });

  it('a tick in the cart is the tick in the list', async () => {
    const db = await ready();
    show(db);
    await go(await pickBreakfastTomorrow());
    await userEvent.click(await screen.findByRole('button', { name: /^Творог,/ }));
    await waitFor(async () => expect((await db.shopping_marks.get(menuItemId('w-cur', 'творог')))?.bought).toBe(true));
    await userEvent.click(screen.getByRole('tab', { name: 'Весь список' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Творог,/ })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('says why a pick adds nothing', async () => {
    const db = await ready();
    for (const item of ['творог', 'яйца']) await db.shopping_marks.put({ item_id: menuItemId('w-cur', item), household_id: 'h1', bought: true, by_member: 'm-papa', price_real: null, updated_at: 'x' });
    show(db);
    const sheet = await pickBreakfastTomorrow();
    expect(await within(sheet).findByText('Всё для этого уже куплено или есть дома')).toBeInTheDocument();
    // Why each product is left out, grouped by the reason.
    expect(within(sheet).getByText('Уже куплено: творог, яйца. Всегда есть дома: мука.')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Пошли' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: 'Беру весь список' })).toBeEnabled();
  });

  it('own line goes to the cart and the list', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Иду в магазин' }));
    const sheet = await screen.findByRole('dialog', { name: 'Что берём' });
    await userEvent.type(within(sheet).getByLabelText('Дописать своё'), 'Хлеб');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Добавить «Хлеб»' }));
    await go(sheet);
    expect(await screen.findByRole('tab', { name: 'Корзина', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Хлеб' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Весь список' }));
    expect(await screen.findByRole('button', { name: 'Хлеб' })).toBeInTheDocument();
  });

  it('takes the whole list like before', async () => {
    const db = await ready();
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Иду в магазин' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Что берём' })).getByRole('button', { name: 'Беру весь список' }));
    expect(await screen.findByRole('button', { name: 'Закончить поход' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Корзина' })).toBeNull();
    expect((await db.shop_trips.toArray())[0].items ?? null).toBeNull();
  });

  it('ends the trip', async () => {
    const db = await ready();
    show(db);
    await go(await pickBreakfastTomorrow());
    await userEvent.click(await screen.findByRole('button', { name: 'Закончить поход' }));
    expect(await screen.findByRole('button', { name: 'Иду в магазин' })).toBeInTheDocument();
    expect((await db.shop_trips.toArray())[0].ended_at).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Фарш,/ })).toBeInTheDocument();
  });

  it('names everyone shopping and what for', async () => {
    const db = await ready();
    await db.shop_trips.bulkPut([
      { id: 't1', household_id: 'h1', member_id: 'm-papa', started_at: new Date(2026, 9, 13, 18, 10).toISOString(), updated_at: 'x', label: 'завтрак на завтра', items: [] },
      { id: 't2', household_id: 'h1', member_id: 'm-mama', started_at: new Date(2026, 9, 13, 18, 20).toISOString(), updated_at: 'x', label: null, items: null },
    ]);
    show(db, son);
    expect(await screen.findByText('Папа в магазине с 18:10: завтрак на завтра')).toBeInTheDocument();
    expect(screen.getByText('Мама в магазине с 18:20')).toBeInTheDocument();
  });

  it('a line added at home during the trip lands in the cart', async () => {
    const db = await ready();
    await db.shop_trips.put({ id: 't1', household_id: 'h1', member_id: 'm-papa', started_at: new Date(2026, 9, 13, 18, 10).toISOString(), updated_at: 'x', label: 'завтрак на завтра', items: [{ id: menuItemId('w-cur', 'творог'), hint: 'на завтрак: 450 г' }] });
    await db.shopping_items.put({ id: 'u:bread', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Хлеб', qty: null, unit: null, qty_text: '', dept: 'Хлеб', urgent: false, est_price: null, added_by: 'm-son', updated_at: 'x', deleted_at: null, created_at: new Date(2026, 9, 13, 18, 20).toISOString() });
    show(db);
    expect((await screen.findByText(/добавил Сын/)).closest('button')).toHaveAccessibleName('Хлеб');
  });

  it('without the server column the button works as before', async () => {
    const db = await ready(false);
    show(db);
    await userEvent.click(await screen.findByRole('button', { name: 'Иду в магазин' }));
    await waitFor(async () => expect(await db.shop_trips.count()).toBe(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Вы в магазине' })).toBeDisabled();
  });
});
