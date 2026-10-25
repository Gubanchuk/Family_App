import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ToastProvider from '../shell/Toast';
import { addOfferItems, takeOffer } from '../ideas/offerActions';
import { menuItemId, regenerateWeekList } from '../shop/menuList';
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

  it('lets me take back my own offer: it leaves the menu and the list, «Вернуть» brings both back', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const mine = offer({ from_member: 'm-papa', to_member: null });
    await db.dish_offers.put(mine);
    await addOfferItems(db, mine);
    const lines = async () => (await db.shopping_items.toArray()).filter((i) => i.offer_id === 'o1' && !i.deleted_at).length;
    expect(await lines()).toBe(2);
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    expect(await screen.findByText('вы предложили · кому: всем · на полдник')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отменить: Сырники' }));
    const toast = (await screen.findByText('«Сырники» больше не предлагается.')).closest('.toast') as HTMLElement;
    await waitFor(() => expect(screen.queryByText('Предложили на этот день')).toBeNull());
    expect((await db.dish_offers.get('o1'))?.deleted_at).toBeTruthy();
    expect(await lines()).toBe(0);
    await userEvent.click(within(toast).getByRole('button', { name: 'Вернуть' }));
    expect(await screen.findByText('вы предложили · кому: всем · на полдник')).toBeInTheDocument();
    await waitFor(async () => expect(await lines()).toBe(2));
  });

  it('keeps bought lines of a cancelled offer', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const mine = offer({ from_member: 'm-papa', to_member: null });
    await db.dish_offers.put(mine);
    await addOfferItems(db, mine);
    await db.shopping_marks.put({ item_id: 'o:o1:творог', household_id: 'h1', bought: true, by_member: 'm-papa', price_real: null, updated_at: 'x' });
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Отменить: Сырники' }));
    await waitFor(async () => expect((await db.shopping_items.get('o:o1:яйца'))?.deleted_at).toBeTruthy());
    expect((await db.shopping_items.get('o:o1:творог'))?.deleted_at).toBeNull();
  });

  it('lets the cook back out of an offer of someone else: it is open again and its lines leave', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.dish_offers.put(offer({}));
    await takeOffer(db, (await db.dish_offers.get('o1'))!, papa);
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Отменить/ })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Не смогу: Сырники' }));
    await waitFor(async () => expect(await db.dish_offers.get('o1')).toMatchObject({ status: 'open', taken_by: null }));
    expect((await db.shopping_items.toArray()).filter((i) => i.offer_id === 'o1' && !i.deleted_at)).toHaveLength(0);
    expect(await screen.findByRole('button', { name: 'Сделаю' })).toBeInTheDocument();
  });

  it('takes the menu dish off the list while a dish is cooked «instead», and puts it back when that offer goes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    await regenerateWeekList(db, 'w-cur');
    const mince = async () => (await db.shopping_items.get(menuItemId('w-cur', 'фарш')))?.qty_text;
    expect(await mince()).toBe('3,7 кг');
    await db.dish_offers.put(offer({ dish_id: 'br-syrniki', meal: 'dinner', how: 'instead' }));
    await takeOffer(db, (await db.dish_offers.get('o1'))!, papa);
    // Tuesday's cutlets are not cooked: six dinners of mince are left.
    expect(await mince()).toBe('3,2 кг');
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, mama]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Не смогу: Сырники' }));
    await waitFor(async () => expect(await mince()).toBe('3,7 кг'));
  });
});
