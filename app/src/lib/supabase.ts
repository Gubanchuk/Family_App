import { createClient } from '@supabase/supabase-js';

// Fallbacks keep tests and a misconfigured build from crashing on import; requests then fail visibly.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'missing-key';

// The key auth-js would pick by default, named here so the app can read the stored session offline.
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

// supabase-js sets no timeout; a mobile network that goes silent mid-answer would hold sync forever.
export function timedFetch(ms = 15_000, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException(`Сервер не ответил за ${Math.round(ms / 1000)} секунд`, 'TimeoutError')), ms);
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    return base(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  global: { fetch: timedFetch() },
});
