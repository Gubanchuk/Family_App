import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Onboarding from './Onboarding';

const create = vi.hoisted(() => vi.fn((..._a: unknown[]) => Promise.resolve('h1')));
vi.mock('./api', () => ({ MEMBER_COLORS: ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'], createHousehold: create }));

describe('Onboarding', () => {
  it('asks for the name instead of assuming «Папа», and shows the picked colour with the initial', async () => {
    const done = vi.fn();
    render(<Onboarding onDone={done} />);
    const button = screen.getByRole('button', { name: 'Создать семью' });
    expect(screen.getByLabelText('Как вас называть')).toHaveValue('');
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Как вас называть'), 'Мама');
    await userEvent.click(screen.getByRole('button', { name: 'Розовый' }));
    expect(screen.getByRole('button', { name: 'Розовый' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Розовый' })).toHaveTextContent('М');
    await userEvent.click(button);
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith('Наша семья', 'Мама', '#E0457B');
  });

  it('starts from the name the Google account gives', () => {
    render(<Onboarding onDone={vi.fn()} suggestedName="Анна" />);
    expect(screen.getByLabelText('Как вас называть')).toHaveValue('Анна');
  });
});
