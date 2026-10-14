import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../../lib/supabase', () => ({
  AUTH_STORAGE_KEY: 'sb-test-auth-token',
  supabase: { auth: { getSession: () => getSession(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));

const stored = { access_token: 'old', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } };

describe('useSession offline', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });

  it('keeps working with the stored account when the token could not be refreshed', async () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(stored));
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.user.id).toBe('u1');
  });

  it('asks to sign in when nothing is stored', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('opens at once without network instead of waiting for sign-in retries', async () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(stored));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    getSession.mockReturnValue(new Promise(() => {}));
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.session?.user.id).toBe('u1'));
    expect(result.current.loading).toBe(false);
  });
});
