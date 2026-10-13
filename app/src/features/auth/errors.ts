const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль. Проверьте раскладку и попробуйте ещё раз.',
  user_already_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  email_exists: 'С этой почтой уже есть вход. Нажмите «Войти».',
  weak_password: 'Пароль слишком простой: нужно хотя бы 8 символов.',
  over_request_rate_limit: 'Слишком много попыток. Подождите минуту.',
};

export function authErrorText(e: { message?: string; code?: string } | null): string {
  if (!e) return '';
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e.message && /fetch|network/i.test(e.message)) return 'Нет связи с сервером. Проверьте интернет или войдите позже.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}
