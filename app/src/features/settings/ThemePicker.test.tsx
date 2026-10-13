import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemePicker from './ThemePicker';

describe('ThemePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rings the theme in effect and switches to night', async () => {
    render(<ThemePicker />);
    expect(screen.getByRole('radio', { name: /День/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Тема как в телефоне' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /Ночь/ }));
    expect(screen.getByRole('radio', { name: /Ночь/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Тема как в телефоне' })).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
