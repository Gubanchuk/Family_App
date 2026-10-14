import { createClient } from '@supabase/supabase-js';

// Fallbacks keep tests and a misconfigured build from crashing on import; requests then fail visibly.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'missing-key';

// The key auth-js would pick by default, named here so the app can read the stored session offline.
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const NULL_BODY = [101, 103, 204, 205, 304];

// supabase-js sets no timeout; a mobile network that goes silent mid-answer would hold sync forever.
// The limit is on silence, not on the whole answer: every arriving chunk restarts it, so a slow but
// moving download of the recipe base still completes.
export function timedFetch(ms = 15_000, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init = {}) => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(new DOMException(`Сервер не ответил за ${Math.round(ms / 1000)} секунд`, 'TimeoutError')), ms);
    };
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    arm();
    let res: Response;
    try { res = await base(input, { ...init, signal: ctrl.signal }); } catch (e) { clearTimeout(timer); throw e; }
    // A «No Content» status cannot carry a body into a new Response, and Chrome still hands one over.
    if (!res.body || NULL_BODY.includes(res.status)) { clearTimeout(timer); return res; }
    arm();
    const reader = res.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        try {
          const { done, value } = await reader.read();
          if (done) { clearTimeout(timer); c.close(); return; }
          arm();
          c.enqueue(value);
        } catch (e) { clearTimeout(timer); c.error(e); }
      },
      cancel(reason) { clearTimeout(timer); return reader.cancel(reason); },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  global: { fetch: timedFetch() },
});
