import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MoneyPage from './MoneyPage';

const papa: Member = { id: 'papa', household_id: 'h', user_id: 'u1', name: 'Андрей', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'mama', user_id: 'u2', name: 'Оля', color: '#E0457B', is_owner: false };
const OCT13 = new Date(2026, 9, 13, 12, 0);

describe('MoneyPage', () => {
  it('shows the next payment and marks it paid', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.payments.put({ id: 'p1', household_id: 'h', title: 'Интернет и ТВ', amount: 650, day: 16, kind: 'monthly', total: null, first_month: null, note: '', created_by: 'papa', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><MoneyPage me={papa} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /^Интернет и ТВ — 650\s₽$/ })).toBeInTheDocument();
    expect(screen.getByText(/через 3 дня, 16 октября/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отметить оплаченным' }));
    await waitFor(async () => expect(await db.payment_marks.get(['p1', '2026-10'])).toMatchObject({ paid: true, amount: 650, paid_by: 'papa' }));
    expect(await screen.findByText('Все платежи октября оплачены')).toBeInTheDocument();
  });

  it('adds an expense in two taps and shows it under its category and person', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Расход' }));
    await userEvent.type(await screen.findByLabelText('Сумма, ₽'), '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Продукты' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('heading', { name: 'Кто тратил' })).toBeInTheDocument();
    expect(screen.getByText('Продукты')).toBeInTheDocument();
    expect(screen.getAllByText('1 200 ₽').length).toBeGreaterThanOrEqual(2);
  });
});
