import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

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
    await userEvent.click(screen.getByRole('button', { name: 'Поставить «Быстрая»' }));
    expect(await screen.findByText('Сейчас: «Быстрая», 12–18 октября')).toBeInTheDocument();
  });

  it('lets a child propose next week and a parent approve it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const { unmount } = render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Предложить' }));
    await userEvent.click(screen.getByRole('radio', { name: /Быстрая/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Предложить «Быстрая»' }));
    expect(await screen.findByText('Сын (вы) предлагает неделю «Быстрая» на 19–25 октября')).toBeInTheDocument();
    unmount();

    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('За: Сын.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Утвердить' }));
    expect(await screen.findByText('Утверждено')).toBeInTheDocument();
  });
});
