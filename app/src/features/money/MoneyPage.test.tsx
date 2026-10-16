import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import MoneyPage from './MoneyPage';

const papa: Member = { id: 'papa', household_id: 'h', user_id: 'u1', name: 'Андрей', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const mama: Member = { ...papa, id: 'mama', user_id: 'u2', name: 'Оля', color: '#E0457B', is_owner: false };
const OCT13 = new Date(2026, 9, 13, 12, 0);
function Back() { const nav = useNavigate(); return <button type="button" onClick={() => nav(-1)}>Назад</button>; }

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

  it('lists every payment, also one that starts next month, and shows it on its month', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.payments.bulkPut([
      { id: 'p1', household_id: 'h', title: 'Рассрочка: диван', amount: 5000, day: 5, kind: 'installment', total: 6, first_month: '2026-11', note: '', created_by: 'papa', updated_at: 'x', deleted_at: null },
      { id: 'p2', household_id: 'h', title: 'Интернет', amount: 650, day: 16, kind: 'monthly', total: null, first_month: '2026-09', note: '', created_by: 'papa', updated_at: 'x', deleted_at: null },
    ]);
    render(<MemoryRouter><MoneyPage me={papa} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /^Интернет/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Рассрочка: диван/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Все платежи/ }));
    const all = screen.getByRole('dialog', { name: 'Все платежи' });
    expect(within(all).getByRole('button', { name: /Рассрочка: диван/ })).toHaveTextContent(/6 платежей · ноябрь 2026 — апрель 2027/);
    expect(within(all).getByRole('button', { name: /Интернет/ })).toHaveTextContent(/каждый месяц, 16-го/);
    await userEvent.click(within(all).getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(await screen.findByRole('button', { name: /^Рассрочка: диван/ })).toHaveTextContent(/1 из 6/);
  });

  it('adds a monthly payment that starts in a later month', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter><MoneyPage me={papa} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /^Добавить платёж/ }));
    await userEvent.type(screen.getByLabelText('Название'), 'Кружок');
    await userEvent.type(screen.getByLabelText('Сумма, ₽'), '3000');
    await userEvent.type(screen.getByLabelText('Число месяца'), '10');
    const from = screen.getByLabelText('С какого месяца');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-11');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.payments.toArray())[0]).toMatchObject({ title: 'Кружок', kind: 'monthly', first_month: '2026-11' }));
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

  it('goes back where the person came from after saving an expense', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter initialEntries={['/', '/money?add=expense']} initialIndex={1}>
      <Routes>
        <Route path="/" element={<p>Главная</p>} />
        <Route path="/money" element={<><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /><Back /></>} />
      </Routes>
    </MemoryRouter>);
    await userEvent.type(await screen.findByLabelText('Сумма, ₽'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Продукты' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByLabelText('Сумма, ₽')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(await screen.findByText('Главная')).toBeInTheDocument();
  });
  it('counts what was bought from the shopping list in the month and keeps those lines read-only', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.shopping_items.put({ id: 'u:1', household_id: 'h', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Молоко', qty: null, unit: null, qty_text: '', dept: 'Молочное и яйца', urgent: false, est_price: 95, added_by: 'mama', updated_at: 'x', deleted_at: null });
    await db.shopping_marks.put({ item_id: 'u:1', household_id: 'h', bought: true, by_member: 'papa', price_real: 120, updated_at: '2026-10-12T09:00:00.000Z' });
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /^Продукты\s*·\s*1/ }));
    const list = screen.getByRole('dialog', { name: 'Продукты' });
    expect(within(list).getByText('из списка покупок · Андрей')).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Молоко/ })).toBeNull();
  });

  it('reminds that shopping is counted by itself when adding groceries by hand', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Расход' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Продукты' }));
    expect(screen.getByText('Покупки из списка считаются сами — вносите только то, чего в списке не было.')).toBeInTheDocument();
  });
  it('shows a budget under its category and says when it is overspent', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.budgets.put({ household_id: 'h', category: 'Продукты', amount: 1000, updated_at: 'x', deleted_at: null });
    await db.money_entries.put({ id: 'e1', household_id: 'h', kind: 'expense', amount: 1200, category: 'Продукты', member_id: 'mama', on_date: '2026-10-10', note: '', created_by: 'mama', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    expect(await screen.findByText(/из 1\s000\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/перерасход 200\s₽/)).toBeInTheDocument();
  });

  it('sets monthly budgets once the server has them', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'missing_tables', value: [] });
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Бюджеты на месяц/ }));
    const sheet = screen.getByRole('dialog', { name: 'Бюджеты' });
    await userEvent.type(within(sheet).getByLabelText('Продукты, ₽'), '40000');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect(await db.budgets.get(['h', 'Продукты'])).toMatchObject({ amount: 40000, deleted_at: null }));
  });

  it('does not offer budgets before the server has them', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Расходы' });
    expect(screen.queryByRole('button', { name: /Бюджеты на месяц/ })).toBeNull();
  });

  it('charts the last six months and opens a month from its bar', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.money_entries.bulkPut([
      { id: 'e1', household_id: 'h', kind: 'expense', amount: 1200, category: 'Продукты', member_id: 'mama', on_date: '2026-10-10', note: '', created_by: 'mama', updated_at: 'x', deleted_at: null },
      { id: 'e2', household_id: 'h', kind: 'expense', amount: 3400, category: 'Дом', member_id: 'mama', on_date: '2026-09-03', note: '', created_by: 'mama', updated_at: 'x', deleted_at: null },
    ]);
    render(<MemoryRouter><MoneyPage me={mama} members={[papa, mama]} db={db} today={OCT13} /></MemoryRouter>);
    const chart = await screen.findByRole('group', { name: 'Траты по месяцам' });
    expect(within(chart).getAllByRole('button')).toHaveLength(6);
    await userEvent.click(within(chart).getByRole('button', { name: /^Сентябрь:\s*3\s400\s₽/ }));
    expect(await screen.findByRole('heading', { name: 'Деньги' })).toBeInTheDocument();
    expect(screen.getByText(/^Сентябрь · видят только родители$/)).toBeInTheDocument();
  });
});
