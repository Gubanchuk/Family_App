import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...papa, id: 'm-son', user_id: 'u2', name: 'Сын', role: 'child', is_owner: false };
const TUESDAY = new Date(2026, 9, 13, 11, 40);

describe('MenuPage', () => {
  it('shows today in the current week with the soup pot day', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Сейчас: «Осенняя», 12–18 октября')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Обед: Борщ/ })).toBeInTheDocument();
    expect(screen.getByText(/кастрюля на 7 дней, 2-й день/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ужин: Котлеты/ })).toBeInTheDocument();
  });

  it('asks to choose a week when there is none for this Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByText('Неделя на 12–18 октября не выбрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать неделю' })).toBeInTheDocument();
  });

  it('offers a child to propose instead of choose', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={TUESDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Предложить неделю' })).toBeInTheDocument();
  });

  it('from Thursday asks a child to propose next week and a parent to choose it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const THURSDAY = new Date(2026, 9, 15, 18, 0);
    const { unmount } = render(<MemoryRouter><MenuPage me={son} members={[papa, son]} db={db} today={THURSDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Предложить неделю' })).toBeInTheDocument();
    expect(screen.getByText('Предложите шаблон — семья проголосует, родители утвердят.')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><MenuPage me={papa} members={[papa, son]} db={db} today={THURSDAY} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Выбрать неделю' })).toBeInTheDocument();
  });
});
