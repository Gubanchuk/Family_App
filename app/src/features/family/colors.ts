import { MEMBER_COLORS } from './api';

export const COLOR_NAME: Record<string, string> = {
  '#2F6FDB': 'Синий', '#E0457B': 'Розовый', '#1FA463': 'Зелёный', '#F2A900': 'Жёлтый',
  '#8E5CF7': '#A887FA', '#F06A1F': '#F58A4D', '#0E9AA7': '#33BCC8', '#D93B3B': '#EC6767', '#8D5A3B': '#B5835F', '#5E9E1A': '#82C23C', '#4B4FC4': '#7579DD', '#5B6573': '#8C97A7',
};
export const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function firstFreeColor(taken: Array<{ color: string }>): string {
  return MEMBER_COLORS.find((c) => !taken.some((t) => sameColor(t.color, c))) ?? MEMBER_COLORS[0];
}

// The family colours live in the theme (tokens.css), with lighter shades at night.
// Members store the day hex; screens paint with the theme variable.
const THEME_VAR: Record<string, string> = {
  '#2f6fdb': 'var(--papa)', '#e0457b': 'var(--mama)', '#1fa463': 'var(--son)', '#f2a900': 'var(--dima)',
  '#8e5cf7': 'var(--m-violet)', '#f06a1f': 'var(--m-orange)', '#0e9aa7': 'var(--m-teal)', '#d93b3b': 'var(--m-red)', '#8d5a3b': 'var(--m-brown)', '#5e9e1a': 'var(--m-lime)', '#4b4fc4': 'var(--m-indigo)', '#5b6573': 'var(--m-slate)',
};
export const memberColor = (hex: string) => THEME_VAR[hex.toLowerCase()] ?? hex;
