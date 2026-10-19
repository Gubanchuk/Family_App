import { createClient, RealtimeClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL, AUTH_STORAGE_KEY, SUPABASE_KEY, SUPABASE_URL } from './baseUrl';

export { API_URL, AUTH_STORAGE_KEY, SUPABASE_KEY, SUPABASE_URL, apiUrl } from './baseUrl';

const NULL_BODY = [101, 103, 204, 205, 304];

// An upload sends its body before any answer can come; on a slow mobile link a few megabytes
// take longer than the usual silence limit.
const UPLOAD_MS = 180_000;
const isUpload = (init: RequestInit) => init.body instanceof Blob || init.body instanceof FormData || init.body instanceof ArrayBuffer;

// supabase-js sets no timeout; a mobile network that goes silent mid-answer would hold sync forever.
// The limit is on silence, not on the whole answer: every arriving chunk restarts it, so a slow but
// moving download of the recipe base still completes.
export function timedFetch(ms = 15_000, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init = {}) => {
    const limit = isUpload(init) ? Math.max(ms, UPLOAD_MS) : ms;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(new DOMException(`Сервер не ответил за ${Math.round(limit / 1000)} секунд`, 'TimeoutError')), limit);
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

export const supabase = createClient(API_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  global: { fetch: timedFetch() },
});

// Live updates are a WebSocket, which the site's rewrite does not carry: they keep the direct address.
// Where it is cut, sync still runs every minute, on return to the app and after every change.
export function directRealtime(client: SupabaseClient, direct: string, key: string): RealtimeClient {
  const ws = new URL('realtime/v1', `${direct.replace(/\/$/, '')}/`);
  ws.protocol = ws.protocol.replace('http', 'ws');
  return new RealtimeClient(ws.href, {
    params: { apikey: key },
    accessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? key,
  });
}
if (API_URL !== SUPABASE_URL) supabase.realtime = directRealtime(supabase, SUPABASE_URL, SUPABASE_KEY);
