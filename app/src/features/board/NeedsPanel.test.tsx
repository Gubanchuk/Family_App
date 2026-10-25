import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };

describe('things to buy', () => {
  it('lets the department be chosen when adding, once the server keeps it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'features', value: ['needDept'] });
    render(<MemoryRouter initialEntries={['/board?tab=needs']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что купить'), 'Процессор для компьютера');
    const dept = screen.getByRole('group', { name: 'Отдел' });
    expect(within(dept).getByRole('button', { name: 'Техника' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dept).getByRole('button', { name: 'Для дома' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.needs.toArray())[0]).toMatchObject({ dept: 'Для дома' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Процессор для компьютера: в покупки' }));
    await waitFor(async () => expect(await db.shopping_items.get('n:' + (await db.needs.toArray())[0].id)).toMatchObject({ dept: 'Для дома' }));
  });

  it('does not send a department before the server keeps it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board?tab=needs']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что купить'), 'Процессор');
    expect(screen.queryByRole('group', { name: 'Отдел' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.outbox.toArray()).some((o) => o.table === 'needs' && !('dept' in o.row))).toBe(true));
  });

  it('adds a thing for the son and sends it to the shopping list', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/board?tab=needs']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что купить'), 'Зимние ботинки');
    await userEvent.click(screen.getByRole('button', { name: 'Тёма' }));
    await userEvent.type(screen.getByLabelText('Пометка'), 'размер 37');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    // The cart button says what it does; once the thing is on the list, the row says so and leads there.
    const send = await screen.findByRole('button', { name: 'Зимние ботинки: в покупки' });
    expect(send).toHaveTextContent('В покупки');
    await userEvent.click(send);
    await waitFor(async () => expect(await db.shopping_items.get('n:' + (await db.needs.toArray())[0].id)).toMatchObject({ dept: 'Одежда и обувь' }));
    const there = await screen.findByRole('link', { name: 'Зимние ботинки: в покупках, открыть список' });
    expect(there).toHaveTextContent('В покупках');
    expect(there).toHaveAttribute('href', '/shop');
    expect(screen.queryByRole('button', { name: 'Зимние ботинки: в покупки' })).toBeNull();
  });
});
