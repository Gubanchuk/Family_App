import type { Member } from './useFamily';

export type Kin = 'mother' | 'father' | 'son' | 'daughter' | 'grandmother' | 'grandfather';

export const KIN_WORD: Record<Kin, string> = {
  mother: 'мама', father: 'папа', son: 'сын', daughter: 'дочь', grandmother: 'бабушка', grandfather: 'дедушка',
};

// Parents are mum and dad, or a grandparent who runs the house; children are sons and daughters.
export const KIN_FOR: Record<Member['role'], Kin[]> = {
  parent: ['mother', 'father', 'grandmother', 'grandfather'],
  child: ['son', 'daughter'],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const kinTitle = (k: Kin) => cap(KIN_WORD[k]);

// Under a name on Home: who the person is in the family; the bare role only while nobody has said.
export function kinLine(m: Member): string {
  if (m.kin) return KIN_WORD[m.kin];
  if (!m.user_id) return 'без входа';
  return m.role === 'parent' ? 'родитель' : 'ребёнок';
}

// In Settings, where roles are managed: who the person is and what the role lets them do.
export function roleLine(m: Member): string {
  const rights = m.is_owner ? 'владелец семьи'
    : m.role === 'parent' ? 'родитель'
      : m.user_id ? 'свой вход' : 'без входа, ведут родители';
  if (m.kin) return `${kinTitle(m.kin)} · ${rights}`;
  if (m.role === 'parent') return `Родитель${m.is_owner ? ' · владелец семьи' : ''}`;
  return `Ребёнок · ${rights}`;
}
