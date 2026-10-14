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

  it('explains a site built with a wrong server key instead of a plain failure', () => {
    expect(authErrorText({ message: 'Invalid API key', status: 401 })).toBe('Приложение настроено с ошибкой: сервер не принимает его ключ. Скажите тому, кто его настраивал.');
  });
  it('explains letters the server may not send and addresses it rejects', () => {
    expect(authErrorText({ code: 'email_address_not_authorized' })).toBe('Сервер пока не может отправить письмо на эту почту. Войдите через Google или попросите владельца семьи включить почту.');
    expect(authErrorText({ code: 'email_address_invalid' })).toBe('Почта выглядит неправильно. Проверьте адрес.');
    expect(authErrorText({ code: 'over_email_send_rate_limit' })).toBe('Слишком много писем подряд. Подождите час и попробуйте снова.');
  });
  it('explains closed sign-ups and a switched-off sign-in method', () => {
    expect(authErrorText({ code: 'signup_disabled' })).toBe('Новые входы сейчас закрыты. Попросите владельца семьи.');
    expect(authErrorText({ code: 'provider_disabled' })).toBe('Этот способ входа ещё не включён. Войдите по почте.');
  });
});

