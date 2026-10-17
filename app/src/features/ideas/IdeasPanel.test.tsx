import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import MenuPage from '../menu/MenuPage';
import ToastProvider from '../shell/Toast';
import { deleteRecipe } from './recipeApi';

vi.mock('./recipeApi', () => ({ saveRecipe: vi.fn(async () => 'own-1'), deleteRecipe: vi.fn(async () => {}) }));
const never = () => new Promise<void>(() => {});

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false };

async function open(me: Member = papa) {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.meta.put({ key: 'family_portions', value: 3.5 });
  render(<MemoryRouter initialEntries={['/menu?panel=ideas']}><MenuPage me={me} members={[papa, mama, son]} db={db} today={TUESDAY} /></MemoryRouter>);
  return db;
}

describe('Что покушать', () => {
  it('filters by collection and finds a dish by a product', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Сладкое' }));
    expect(screen.getByRole('button', { name: /Печёные яблоки/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сырники/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Сладкое' }));
    await userEvent.type(screen.getByRole('searchbox'), 'творог');
    expect(await screen.findByRole('button', { name: /^Сырники/ })).toBeInTheDocument();
  });

  it('shows every dish, not just the collections, and filters them by meal', async () => {
    await open();
    expect(await screen.findByRole('button', { name: /^Овсяная каша/ })).toBeInTheDocument();
    const meals = screen.getByRole('group', { name: 'Приём' });
    await userEvent.click(within(meals).getByRole('button', { name: 'Полдник' }));
    expect(screen.getByRole('button', { name: /^Печёные яблоки/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Плов/ })).toBeNull();
    await userEvent.click(within(meals).getByRole('button', { name: 'Ужин' }));
    expect(screen.getByRole('button', { name: /^Плов/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сырники/ })).toBeNull();
    expect(screen.getByText('2 блюда')).toBeInTheDocument();
    await userEvent.click(within(meals).getByRole('button', { name: 'Ужин' }));
    expect(screen.getByRole('button', { name: /^Сырники/ })).toBeInTheDocument();
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

  it('lets the family add its own recipe and edit only its own', async () => {
    const db = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Свой рецепт' }));
    expect(screen.getByRole('dialog', { name: 'Свой рецепт' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Свой рецепт' })).getByRole('button', { name: 'Закрыть' }));
    const base = (await db.recipes.toArray()).find((r) => r.collections.includes('sweet'))!;
    await db.recipes.put({ ...base, id: 'own-1', household_id: 'h1', name: 'Бабушкин пирог', collections: ['ours'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Наши рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: /Бабушкин пирог/ }));
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Бабушкин пирог' })).getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('button', { name: 'Наши рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(base.name) }));
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('warns before deleting an own recipe that is in the menu of the week', async () => {
    const db = await open();
    const base = (await db.recipes.toArray()).find((r) => r.collections.includes('sweet'))!;
    await db.recipes.put({ ...base, id: 'own-1', household_id: 'h1', name: 'Бабушкин пирог', collections: ['ours'] });
    const slot = (await db.week_slots.toArray())[0];
    await db.week_slots.put({ ...slot, dish_id: 'own-1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Наши рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: /Бабушкин пирог/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(deleteRecipe).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Блюдо есть в меню на неделю. Удалить всё равно?' }));
    expect(deleteRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'own-1' }));
  });
  it('shows the family own side dish under its recipes', async () => {
    const db = await open();
    const base = (await db.recipes.toArray()).find((r) => r.collections.includes('sweet'))!;
    await db.recipes.put({ ...base, id: 'own-side', household_id: 'h1', name: 'Бабушкино пюре', category: 'side', collections: ['ours'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Наши рецепты' }));
    expect(screen.getByRole('button', { name: /Бабушкино пюре/ })).toBeInTheDocument();
  });

  it('lets a child add a recipe but leaves changing family recipes to parents', async () => {
    const db = await open(son);
    expect(await screen.findByRole('button', { name: 'Свой рецепт' })).toBeInTheDocument();
    const base = (await db.recipes.toArray()).find((r) => r.collections.includes('sweet'))!;
    await db.recipes.put({ ...base, id: 'own-1', household_id: 'h1', name: 'Бабушкин пирог', collections: ['ours'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Наши рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: /Бабушкин пирог/ }));
    expect(screen.getByRole('dialog', { name: 'Бабушкин пирог' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
  });
  it('deletes once and shows it is busy while the server answers', async () => {
    vi.mocked(deleteRecipe).mockClear();
    vi.mocked(deleteRecipe).mockImplementationOnce(never);
    const db = await open();
    const base = (await db.recipes.toArray()).find((r) => r.collections.includes('sweet'))!;
    await db.recipes.put({ ...base, id: 'own-2', household_id: 'h1', name: 'Мамин кекс', collections: ['ours'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Наши рецепты' }));
    await userEvent.click(screen.getByRole('button', { name: /Мамин кекс/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Точно удалить рецепт?' }));
    const busy = screen.getByRole('button', { name: 'Удаляем…' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(deleteRecipe).toHaveBeenCalledTimes(1);
  });
});
