import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SignIn from './SignIn';

function fakeClient(result: { error: { code?: string; message?: string } | null }) {
  return {
    auth: {
      signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: result.error })),
      signUp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  };
}

describe('SignIn', () => {
  it('shows a Russian message for a wrong password and keeps the form', async () => {
    const client = fakeClient({ error: { code: 'invalid_credentials' } });
    render(<SignIn client={client as never} />);
    await userEvent.type(screen.getByLabelText('Почта'), 'papa@example.com');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль');
    expect(screen.getByLabelText('Почта')).toHaveValue('papa@example.com');
  });

  it('starts Google sign-in with a return to this site', async () => {
    const client = fakeClient({ error: null });
    render(<SignIn client={client as never} />);
    await userEvent.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
  });
});
