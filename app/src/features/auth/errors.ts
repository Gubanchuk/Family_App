const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль. Проверьте раскладку и попробуйте ещё раз.',
  user_already_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  email_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  weak_password: 'Пароль слишком простой: нужно хотя бы 8 символов.',
  over_request_rate_limit: 'Слишком много попыток. Подождите минуту.',
  email_not_confirmed: 'Почта ещё не подтверждена. Откройте письмо со ссылкой и нажмите её, потом войдите.',
};

export function authErrorText(e: { message?: string; code?: string; name?: string; status?: number } | null): string {
  if (!e) return '';
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  // Safari reports a failed request as «Load failed»; auth-js wraps network trouble in AuthRetryableFetchError.
  if (e.name === 'AuthRetryableFetchError' || (e.message && /fetch|network|load failed/i.test(e.message))) return 'Нет связи с сервером. Проверьте интернет или войдите позже.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}
