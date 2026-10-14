import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';
import NotifyCard from './NotifyCard';

const load = vi.fn(() => Promise.resolve({ meal_times: [], notify: { offers: true, votes: true, shop: false, quiet: true } }));
const save = vi.fn(() => Promise.resolve());
vi.mock('./memberSettings', () => ({ loadMemberSettings: () => load(), saveNotify: (...a: unknown[]) => save(...(a as [])) }));
const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('NotifyCard', () => {
  it('shows the member switches and saves a change', async () => {
    render(<NotifyCard me={papa} />);
    const shop = await screen.findByRole('switch', { name: 'Кто идёт в магазин' });
    await waitFor(() => expect(shop).toHaveAttribute('aria-checked', 'false'));
    await userEvent.click(shop);
    expect(shop).toHaveAttribute('aria-checked', 'true');
    expect(save).toHaveBeenCalledWith('m-papa', { offers: true, votes: true, shop: true, quiet: true });
  });

  it('puts the switch back and says so when the change could not be saved', async () => {
    save.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    render(<NotifyCard me={papa} />);
    const offers = await screen.findByRole('switch', { name: 'Предложения блюд' });
    await waitFor(() => expect(offers).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(offers);
    await waitFor(() => expect(offers).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи — настройка не сохранилась. Попробуйте ещё раз.');
  });

  it('has a switch for stories', async () => {
    render(<NotifyCard me={papa} />);
    expect(await screen.findByRole('switch', { name: 'Сторис' })).toBeInTheDocument();
  });
});
