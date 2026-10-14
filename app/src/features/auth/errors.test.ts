import { describe, expect, it } from 'vitest';
import { authErrorText } from './errors';

describe('authErrorText', () => {
  it('explains a wrong password', () => {
    expect(authErrorText({ code: 'invalid_credentials' })).toBe('Неверная почта или пароль. Проверьте раскладку и попробуйте ещё раз.');
  });
  it('explains a taken email', () => {
    expect(authErrorText({ code: 'user_already_exists' })).toBe('С этой почтой уже есть вход. Нажмите «Войти».');
  });
  it('explains a short password', () => {
    expect(authErrorText({ code: 'weak_password' })).toBe('Пароль слишком простой: нужно хотя бы 8 символов.');
  });
  it('explains a blocked network', () => {
    expect(authErrorText({ message: 'Failed to fetch' })).toBe('Нет связи с сервером. Проверьте интернет или войдите позже.');
  });
  it('falls back to a plain message', () => {
    expect(authErrorText({ message: 'something odd' })).toBe('Не получилось войти. Попробуйте ещё раз.');
  });

  it('explains an unconfirmed email', () => {
    expect(authErrorText({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe('Почта ещё не подтверждена. Откройте письмо со ссылкой и нажмите её, потом войдите.');
  });
  it('treats Safari «Load failed» and retryable errors as no network', () => {
    expect(authErrorText({ message: 'Load failed' })).toBe('Нет связи с сервером. Проверьте интернет или войдите позже.');
    expect(authErrorText({ name: 'AuthRetryableFetchError', message: '{}' } as never)).toBe('Нет связи с сервером. Проверьте интернет или войдите позже.');
  });
});
