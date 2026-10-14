import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('menu across midnight', () => {
  it('opens the new week on Monday when Sunday turns into Monday', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const page = (today: Date) => <MemoryRouter><MenuPage me={papa} members={[papa]} db={db} today={today} /></MemoryRouter>;
    const { rerender } = render(page(new Date(2026, 9, 18, 23, 50)));
    expect(await screen.findByRole('heading', { name: 'Воскресенье, 18' })).toBeInTheDocument();
    rerender(page(new Date(2026, 9, 19, 0, 10)));
    expect(await screen.findByText('Неделя на 19–25 октября не выбрана')).toBeInTheDocument();
    await db.weeks.put({ id: 'w-new', household_id: 'h1', starts_on: '2026-10-19', template_id: 'quick', status: 'approved', proposed_by: null, approved_by: 'm-papa', updated_at: 'x', deleted_at: null });
    expect(await screen.findByRole('heading', { name: 'Понедельник, 19' })).toBeInTheDocument();
  });
});
