import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import ToastProvider from '../shell/Toast';
import { regenerateWeekList } from '../shop/menuList';
import { seedMenu, templateDays } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('choosing and approving weeks', () => {
  it('lets a parent set this week from a template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Поставить неделю «Быстрая»' }));
    expect(await screen.findByText('Сейчас: «Быстрая», 12–18 октября')).toBeInTheDocument();
  });

  it('builds the list from today on when a parent sets this week after its Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.meta.put({ key: 'features', value: ['listDays'] });
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Поставить неделю «Быстрая»' }));
    await waitFor(async () => expect((await db.weeks.toArray())[0].list_days).toEqual([1, 2, 3, 4, 5, 6]));
  });

  it('sets an empty week and cooks just one dish on one day, with only its products to buy', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Только нужные дни' }));
    expect(await screen.findByText('Сейчас: «своя неделя», 12–18 октября')).toBeInTheDocument();
    const week = (await db.weeks.toArray())[0];
    expect(week).toMatchObject({ template_id: null, status: 'approved' });
    expect((await db.week_slots.where('week_id').equals(week.id).toArray()).every((s) => !s.dish_id && !s.simple)).toBe(true);
    expect(await db.shopping_items.count()).toBe(0);
    expect(screen.getAllByText('Не выбрано').length).toBe(4);
    // Tuesday's dinner: one dish from all recipes, and the list holds only its products.
    await userEvent.click(screen.getAllByRole('button', { name: /^Ужин/ })[0]);
    await userEvent.click(screen.getByRole('tab', { name: 'Все рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: /^Плов/ }));
    expect(await screen.findByText('Плов')).toBeInTheDocument();
    await waitFor(async () => expect((await db.shopping_items.toArray()).filter((i) => !i.deleted_at).map((i) => i.item).sort()).toEqual(['рис', 'фарш']));
  });

  it('offers an empty week among the templates too', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Без шаблона/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Поставить пустую неделю' }));
    expect(await screen.findByText('Сейчас: «своя неделя», 12–18 октября')).toBeInTheDocument();
  });

  it('lets a child propose next week and a parent approve it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const { unmount } = render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Предложить' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Предложить неделю «Быстрая»' }));
    expect(await screen.findByText('Сын (вы) предлагает неделю «Быстрая» на 19–25 октября')).toBeInTheDocument();
    unmount();

    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('За: Сын.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Утвердить' }));
    expect(await screen.findByText('Утверждено')).toBeInTheDocument();
  });

  it('names a week proposed by someone this phone does not know yet in proper words', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.weeks.put({ id: 'w-next', household_id: 'h1', starts_on: '2026-10-19', template_id: 'quick', status: 'proposed', proposed_by: 'm-new', approved_by: null, updated_at: 'x', deleted_at: null });
    await db.votes.put({ week_id: 'w-next', member_id: 'm-new', household_id: 'h1', value: 'yes', comment: '', updated_at: 'x' });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Предложена неделя «Быстрая» на 19–25 октября')).toBeInTheDocument();
    expect(screen.getByText(/За: кто-то из семьи\./)).toBeInTheDocument();
  });

  it('confirms a set week with the list it built and a way to the shop', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Поставить неделю «Быстрая»' }));
    const toast = (await screen.findByText(/^Неделя «Быстрая» стоит\. Список покупок: \d+ продукт/)).closest('.toast') as HTMLElement;
    // The toast and the hero of the freshly set week both lead to the list.
    const week = (await db.weeks.toArray())[0];
    expect(within(toast).getByRole('link', { name: 'К покупкам' })).toHaveAttribute('href', `/shop?week=${week.id}`);
    for (const link of screen.getAllByRole('link', { name: 'К покупкам' }).filter((l) => !toast.contains(l))) expect(link).toHaveAttribute('href', '/shop');
  });

  it('leads from an approved next week to its own list, not this week’s', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.weeks.put({ id: 'w-next', household_id: 'h1', starts_on: '2026-10-19', template_id: 'quick', status: 'proposed', proposed_by: 'm-son', approved_by: null, updated_at: 'x', deleted_at: null });
    await db.week_slots.bulkPut(templateDays('quick', 'mn-plov', 'sp-ukha').map(({ template_id: _t, ...s }): WeekSlot => ({ ...s, week_id: 'w-next', household_id: 'h1' })));
    render(<MemoryRouter><ToastProvider><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></ToastProvider></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Утвердить' }));
    const toast = (await screen.findByText(/^Неделя на 19–25 октября утверждена/)).closest('.toast') as HTMLElement;
    expect(within(toast).getByRole('link', { name: 'К покупкам' })).toHaveAttribute('href', '/shop?week=w-next');
  });

  it('early in the week shows the week that is set and its list instead of rushing the next one', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.meta.put({ key: 'family_portions', value: 3.5 });
    await regenerateWeekList(db, 'w-cur');
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Неделя «Осенняя» стоит до воскресенья' })).toBeInTheDocument();
    expect(await screen.findByText(/Список покупок собран: \d+ продукт/)).toBeInTheDocument();
    expect(screen.queryByText(/ещё не выбрана/)).toBeNull();
  });
});

