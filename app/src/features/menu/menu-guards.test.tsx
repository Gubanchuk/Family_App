import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu, templateDays } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

async function withNextWeek(status: 'proposed' | 'approved', meals = 28) {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.weeks.put({ id: 'w-next', household_id: 'h1', starts_on: '2026-10-19', template_id: 'quick', status, proposed_by: 'm-son', approved_by: status === 'approved' ? 'm-papa' : null, updated_at: 'x', deleted_at: null });
  await db.week_slots.bulkPut(templateDays('quick', 'mn-plov', 'sp-ukha').slice(0, meals).map(({ template_id, ...s }): WeekSlot => ({ ...s, week_id: 'w-next', household_id: 'h1' })));
  return db;
}
const show = (db: ReturnType<typeof createLocalDb>, me: Member) => render(<MemoryRouter><MenuPage me={me} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);

describe('menu guards', () => {
  it('waits for the whole proposal before a parent can approve it', async () => {
    const db = await withNextWeek('proposed', 3);
    show(db, papa);
    expect(await screen.findByText(/Неделя ещё загружается/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Утвердить' })).toBeNull();
  });

  it('shows an approved next week to a child without a way to change it', async () => {
    const db = await withNextWeek('approved');
    show(db, son);
    await userEvent.click(await screen.findByRole('button', { name: 'Посмотреть' }));
    expect(screen.getByText('Неделя утверждена. Поменять её могут родители.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Предложить неделю «/ })).toBeNull();
  });

  it('asks a parent to confirm replacing an approved week', async () => {
    const db = await withNextWeek('approved');
    show(db, papa);
    await userEvent.click(await screen.findByRole('button', { name: 'Посмотреть' }));
    await userEvent.click(screen.getByRole('radio', { name: /Осенняя/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Заменить утверждённую неделю' }));
    expect((await db.weeks.get('w-next'))?.template_id).toBe('quick');
    await userEvent.click(screen.getByRole('button', { name: 'Точно заменить? Замены блюд пропадут' }));
    await waitFor(async () => expect(await db.weeks.get('w-next')).toMatchObject({ template_id: 'autumn', status: 'approved' }));
  });

  it('explains a template that has not loaded instead of offering an empty week', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    await db.template_slots.where('template_id').equals('quick').delete();
    show(db, papa);
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать неделю' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    expect(await screen.findByText('Шаблон ещё не загрузился — нужен интернет.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поставить неделю «Быстрая»' })).toBeDisabled();
  });

  it('says the recipes have not loaded yet', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    await db.recipes.clear();
    show(db, papa);
    expect(await screen.findByText('Рецепты ещё не загрузились. Откройте приложение с интернетом.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ужин: Блюдо не загружено/ })).toBeInTheDocument();
  });
});
