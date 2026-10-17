import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import RecipeSheet from './RecipeSheet';

const mama: Member = { id: 'm-mama', household_id: 'h1', user_id: 'u2', name: 'Мама', color: '#E0457B', role: 'parent', is_owner: false, portion: 1 };

describe('RecipeSheet', () => {
  it('names a failed offer on the sheet instead of doing nothing', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const recipe = (await db.recipes.get('mn-plov'))!;
    const onClose = vi.fn();
    const onOffer = vi.fn(async () => { throw new Error('База на телефоне занята'); });
    render(<RecipeSheet recipe={recipe} rows={[]} vocab={new Map()} prices={new Map()} portions={3.5} me={mama} members={[mama]} onOffer={onOffer} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Предложить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось отправить: База на телефоне занята. Попробуйте ещё раз.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Предложить' })).toBeEnabled();
  });
});
