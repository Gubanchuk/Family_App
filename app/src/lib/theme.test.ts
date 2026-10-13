import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeChoice, isDarkNow, setThemeChoice, watchSystemTheme } from './theme';

function mockSystemDark(dark: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return { set(v: boolean) { mql.matches = v; listeners.forEach((cb) => cb()); } };
}

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('defaults to following the phone', () => {
    mockSystemDark(false);
    expect(getThemeChoice()).toBe('auto');
  });

  it('stores an explicit choice and marks the root', () => {
    mockSystemDark(false);
    setThemeChoice('dark');
    expect(localStorage.getItem('fa.theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(isDarkNow()).toBe(true);
  });

  it('auto removes the mark and follows the phone', () => {
    const sys = mockSystemDark(true);
    setThemeChoice('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(isDarkNow()).toBe(true);
    const onChange = vi.fn();
    watchSystemTheme(onChange);
    sys.set(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(isDarkNow()).toBe(false);
  });

  it('survives storage that throws', () => {
    mockSystemDark(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getThemeChoice()).toBe('auto');
  });
});
