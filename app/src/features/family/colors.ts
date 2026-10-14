import { MEMBER_COLORS } from './api';

export const COLOR_NAME: Record<string, string> = { '#2F6FDB': 'Синий', '#E0457B': 'Розовый', '#1FA463': 'Зелёный', '#F2A900': 'Жёлтый' };
export const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function firstFreeColor(taken: Array<{ color: string }>): string {
  return MEMBER_COLORS.find((c) => !taken.some((t) => sameColor(t.color, c))) ?? MEMBER_COLORS[0];
}

// The four family colours live in the theme (tokens.css), with lighter shades at night.
// Members store the day hex; screens paint with the theme variable.
const THEME_VAR: Record<string, string> = { '#2f6fdb': 'var(--papa)', '#e0457b': 'var(--mama)', '#1fa463': 'var(--son)', '#f2a900': 'var(--dima)' };
export const memberColor = (hex: string) => THEME_VAR[hex.toLowerCase()] ?? hex;
