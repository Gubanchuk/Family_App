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
    render(<SignIn client={client as never} googleReady={() => Promise.resolve(true)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
  });

  it('keeps the person here with a plain message while Google sign-in is switched off on the server', async () => {
    const client = fakeClient({ error: null });
    render(<SignIn client={client as never} googleReady={() => Promise.resolve(false)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Вход через Google ещё не включён. Войдите по почте.');
    expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('says to open the confirmation letter when sign-up needs it', async () => {
    const client = fakeClient({ error: null });
    client.auth.signUp = vi.fn(() => Promise.resolve({ data: { session: null, user: { id: 'u1' } }, error: null })) as never;
    render(<SignIn client={client as never} />);
    await userEvent.click(screen.getByRole('button', { name: /Создать вход по почте/ }));
    await userEvent.type(screen.getByLabelText('Почта'), 'mama@example.com');
    await userEvent.type(screen.getByLabelText('Пароль'), 'длинныйпароль');
    await userEvent.click(screen.getByRole('button', { name: 'Создать вход' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Мы отправили письмо на mama@example.com');
  });

  it('greets someone who came by an invite with the family name and starts with a new login', async () => {
    const client = fakeClient({ error: null });
    const lookup = vi.fn(() => Promise.resolve({ family: 'Губанчуки', role: 'child' as const, expires_at: '', profile: null, members: [] }));
    render(<SignIn client={client as never} invite="ABCD234XYZ" lookup={lookup} />);
    expect(await screen.findByRole('heading', { name: 'Вас зовут в семью «Губанчуки»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать вход' })).toBeInTheDocument();
    expect(screen.getByText('Не меньше 8 символов.')).toBeInTheDocument();
  });
});

