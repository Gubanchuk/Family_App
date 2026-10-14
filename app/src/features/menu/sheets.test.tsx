import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('replace sheets', () => {
  it('swaps a dinner for a day of another week', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Ужин: Котлеты/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Быстрая' }));
    await userEvent.click(await screen.findByRole('button', { name: /Пт · Плов/ }));
    await waitFor(async () => expect((await db.week_slots.get(['w-cur', 1, 'dinner']))?.dish_id).toBe('mn-plov'));
    expect(await screen.findByRole('button', { name: /Ужин: Плов/ })).toBeInTheDocument();
  });

  it('finds a recipe by name among all recipes', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Завтрак: Овсяная каша/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'Все рецепты' }));
    await userEvent.type(screen.getByRole('searchbox'), 'сыр');
    expect(screen.getByRole('button', { name: /^Сырники/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Овсяная каша/ })).toBeNull();
  });

  it('replaces the whole day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Заменить день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Быстрая' }));
    const put = screen.getByRole('button', { name: /Поставить/ });
    await waitFor(() => expect(put).toBeEnabled());
    await userEvent.click(put);
    expect(await screen.findByRole('button', { name: /Обед: Уха/ })).toBeInTheDocument();
  });

  it('tells a child that an approved week belongs to parents', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
    render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Ужин: Котлеты/ }));
    expect(screen.getByText('Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.')).toBeInTheDocument();
  });

  it('picks the first template once templates arrive after the week sheet opened', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const templates = await db.week_templates.toArray();
    const slots = await db.template_slots.toArray();
    await db.week_templates.clear();
    await db.template_slots.clear();
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await db.week_templates.bulkPut(templates);
    await db.template_slots.bulkPut(slots);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поставить «Быстрая»' })).toBeEnabled());
  });

  it('saves the week with replacements as a family template', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Сохранить неделю как шаблон' }));
    await userEvent.type(screen.getByLabelText('Название'), 'Наша осень');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.week_templates.where('household_id').equals('h1').toArray()).map((t) => t.name)).toEqual(['Наша осень']));
  });
});
