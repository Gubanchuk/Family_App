import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };

describe('things to buy', () => {
  it('adds a thing for the son and sends it to the shopping list', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board?tab=needs']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что купить'), 'Зимние ботинки');
    await userEvent.click(screen.getByRole('button', { name: 'Тёма' }));
    await userEvent.type(screen.getByLabelText('Пометка'), 'размер 37');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Зимние ботинки: в покупки' }));
    await waitFor(async () => expect(await db.shopping_items.get('n:' + (await db.needs.toArray())[0].id)).toMatchObject({ dept: 'Одежда и обувь' }));
    expect(await screen.findByText(/в покупках/)).toBeInTheDocument();
  });
});
