import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import { SyncContext } from '../../data/SyncProvider';
import type { Member } from '../family/useFamily';
import MenuPage from './MenuPage';
import { seedMenu } from './testData';

const son: Member = { id: 'm-son', household_id: 'h1', user_id: 'u2', name: 'Сын', color: '#1FA463', role: 'child', is_owner: false, portion: 1 };

describe('refusal message in the menu', () => {
  it('shows why a change was rolled back until it is dismissed', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db, { currentWeek: true });
    const dismiss = vi.fn();
    render(
      <SyncContext.Provider value={{ syncing: false, offline: false, pending: 0, syncedAt: null, message: 'Менять утверждённую неделю могут только родители. Вернули как было.', syncNow: async () => {}, dismiss }}>
        <MemoryRouter><MenuPage me={son} members={[son]} db={db} today={new Date(2026, 9, 13, 11, 40)} /></MemoryRouter>
      </SyncContext.Provider>,
    );
    expect(await screen.findByText('Менять утверждённую неделю могут только родители. Вернули как было.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(dismiss).toHaveBeenCalled();
  });
});
