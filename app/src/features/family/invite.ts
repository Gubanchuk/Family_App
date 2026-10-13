export const inviteUrl = (origin: string, code: string) => `${origin}/join?code=${code}`;

export function readInviteCode(search: string): string | null {
  const code = new URLSearchParams(search).get('code')?.trim().toUpperCase();
  return code ? code : null;
}

const TEXT: Record<string, string> = {
  invite_used: 'Это приглашение уже использовали. Попросите родителя прислать новое.',
  invite_expired: 'Приглашение устарело: оно действует 7 дней. Попросите новое.',
  invite_not_found: 'Такого приглашения нет. Проверьте ссылку.',
  already_in_family: 'Вы уже в семье. Второй раз вступать не нужно.',
  not_a_parent: 'Это могут сделать только родители.',
};

export function familyErrorText(message: string): string {
  const key = Object.keys(TEXT).find((k) => message.includes(k));
  return key ? TEXT[key] : 'Не получилось. Попробуйте ещё раз.';
}
