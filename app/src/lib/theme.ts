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

// The colour of the app: the four versions of the mockups. Ягода is the default; the choice stays on this phone.
export type Accent = 'berry' | 'mandarin' | 'forest' | 'indigo';
export const ACCENTS: Array<{ id: Accent; name: string; hex: string }> = [
  { id: 'berry', name: 'Ягода', hex: '#C92A62' },
  { id: 'mandarin', name: 'Мандарин', hex: '#FF7A21' },
  { id: 'forest', name: 'Лес', hex: '#137A52' },
  { id: 'indigo', name: 'Индиго', hex: '#3E40D8' },
];
const ACCENT_KEY = 'fa.accent';

export function getAccent(): Accent {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((a) => a.id === v) ? (v as Accent) : 'berry';
  } catch {
    return 'berry';
  }
}

// Marks the root for tokens.css and paints the phone's status bar in the same colour.
export function applyAccent(accent: Accent = getAccent()): void {
  const root = document.documentElement;
  if (accent === 'berry') delete root.dataset.accent;
  else root.dataset.accent = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ACCENTS.find((a) => a.id === accent)!.hex);
}

export function setAccent(accent: Accent): void {
  try { localStorage.setItem(ACCENT_KEY, accent); } catch { /* storage unavailable: keep for this session */ }
  applyAccent(accent);
}
