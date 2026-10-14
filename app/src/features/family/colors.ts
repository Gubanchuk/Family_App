import { MEMBER_COLORS } from './api';

export const COLOR_NAME: Record<string, string> = { '#2F6FDB': 'Синий', '#E0457B': 'Розовый', '#1FA463': 'Зелёный', '#F2A900': 'Жёлтый' };
export const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function firstFreeColor(taken: Array<{ color: string }>): string {
  return MEMBER_COLORS.find((c) => !taken.some((t) => sameColor(t.color, c))) ?? MEMBER_COLORS[0];
}
