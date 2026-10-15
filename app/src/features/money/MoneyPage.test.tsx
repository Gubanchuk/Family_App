import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  it('keeps Save off while the date is empty', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Расход' }));
    await userEvent.type(await screen.findByLabelText('Сумма, ₽'), '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Продукты' }));
    await userEvent.clear(screen.getByLabelText('Дата'));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('opens a category to fix or delete an expense', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.money_entries.put({ id: 'e1', household_id: 'h', kind: 'expense', amount: 120000, category: 'Продукты', member_id: 'mama', on_date: '2026-10-10', note: 'Ашан', created_by: 'mama', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /^Продукты/ }));
    const list = screen.getByRole('dialog', { name: 'Продукты' });
    await userEvent.click(within(list).getByRole('button', { name: /Ашан/ }));
    const sum = await screen.findByLabelText('Сумма, ₽');
    expect(sum).toHaveValue('120000');
    await userEvent.clear(sum);
    await userEvent.type(sum, '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.money_entries.get('e1'))?.amount).toBe(1200));
    await userEvent.click(await screen.findByRole('button', { name: /^Продукты/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Продукты' })).getByRole('button', { name: /Ашан/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Точно удалить?' }));
    await waitFor(async () => expect((await db.money_entries.get('e1'))?.deleted_at).toBeTruthy());
  });

  it('lists the income of the month and adds more from there', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.money_entries.put({ id: 'i1', household_id: 'h', kind: 'income', amount: 185000, category: null, member_id: 'papa', on_date: '2026-10-05', note: 'Зарплата', created_by: 'papa', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /пришло/ }));
    const list = screen.getByRole('dialog', { name: 'Доходы' });
    expect(within(list).getByRole('button', { name: /Зарплата/ })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Добавить доход' }));
    expect(await screen.findByRole('dialog', { name: 'Доход' })).toBeInTheDocument();
  });

  it('shows the payment of next month during its reminder window and marks that month', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.payments.put({ id: 'p1', household_id: 'h', title: 'Аренда', amount: 45000, day: 1, kind: 'monthly', total: null, first_month: '2026-09', note: '', created_by: 'papa', updated_at: 'x', deleted_at: null });
    await db.payment_marks.put({ payment_id: 'p1', month: '2026-10', household_id: 'h', paid: true, amount: 45000, paid_by: 'papa', paid_on: '2026-10-01', updated_at: 'x' });
    render(<MemoryRouter><MoneyPage me={papa} members={[papa, mama]} db={db} today={new Date(2026, 9, 29, 12, 0)} /></MemoryRouter>);
    expect(await screen.findByText(/через 3 дня, 1 ноября/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отметить оплаченным' }));
    await waitFor(async () => expect(await db.payment_marks.get(['p1', '2026-11'])).toMatchObject({ paid: true }));
  });

  it('asks before deleting a payment', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.payments.put({ id: 'p1', household_id: 'h', title: 'Интернет и ТВ', amount: 650, day: 16, kind: 'monthly', total: null, first_month: null, note: '', created_by: 'papa', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><MoneyPage me={papa} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /^Интернет и ТВ/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить платёж' }));
    expect((await db.payments.get('p1'))?.deleted_at).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Точно удалить/ }));
    await waitFor(async () => expect((await db.payments.get('p1'))?.deleted_at).toBeTruthy());
  });
});
