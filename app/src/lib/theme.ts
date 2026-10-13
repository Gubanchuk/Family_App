export type ThemeChoice = 'light' | 'dark' | 'auto';
const KEY = 'fa.theme';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice); } catch { /* storage unavailable: keep for this session */ }
  applyTheme(choice);
}

export function isDarkNow(): boolean {
  const mark = document.documentElement.dataset.theme;
  return mark === 'dark' || (!mark && systemDark().matches);
}

export function watchSystemTheme(onChange: () => void): () => void {
  const mql = systemDark();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
