import { describe, expect, it, vi } from 'vitest';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';

function client(theme: string | null) {
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: theme ? { theme } : null, error: null })) })) }));
  return { from: vi.fn(() => ({ update, select })), update, select };
}

describe('theme sync', () => {
  it('saves the choice for the member', async () => {
    const c = client(null);
    await saveThemeChoice('m1', 'dark', c as never);
    expect(c.from).toHaveBeenCalledWith('member_settings');
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
  it('loads a stored choice and ignores junk', async () => {
    expect(await loadThemeChoice('m1', client('light') as never)).toBe('light');
    expect(await loadThemeChoice('m1', client('purple') as never)).toBeNull();
    expect(await loadThemeChoice('m1', client(null) as never)).toBeNull();
  });
});
