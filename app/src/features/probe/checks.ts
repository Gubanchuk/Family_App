import type { SupabaseClient } from '@supabase/supabase-js';

export type CheckResult = { id: string; title: string; ok: boolean; ms: number; detail: string };
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const bytes = (n: number) => `${n.toLocaleString('ru-RU')} байт`;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const reason = (e: unknown) => (e instanceof Error && e.message === 'timeout' ? 'нет ответа 15 секунд' : 'нет соединения');

async function timed(id: string, title: string, run: () => Promise<{ ok: boolean; detail: string }>): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const r = await withTimeout(run(), 15000);
    return { id, title, ms: Math.round(performance.now() - t0), ...r };
  } catch (e) {
    return { id, title, ok: false, ms: Math.round(performance.now() - t0), detail: reason(e) };
  }
}

// Reads the body chunk by chunk: mobile networks that cut traffic usually stall or reset the
// connection after ~16 KB instead of closing it, and the family needs to see how much arrived.
export function checkRest(url: string, key: string, f: FetchImpl = fetch, deadlineMs = 14_000) {
  return timed('rest', 'База Supabase, ответ 64 КБ', async () => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, deadlineMs); });
    let received = 0;
    try {
      const res = await Promise.race([f(`${url}/rest/v1/probe_payload?select=body&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store', signal: ctrl.signal }), deadline]);
      if (res.status === 404) return { ok: false, detail: 'таблицы проверки ещё нет: нужно выложить миграции базы' };
      if (!res.ok) return { ok: false, detail: `ошибка ${res.status}` };
      const chunks: Uint8Array[] = [];
      const reader = res.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
        }
      } catch (e) {
        reader.cancel().catch(() => {});
        if (received === 0) throw e;
        const how = e instanceof Error && e.message === 'timeout' ? 'дальше тишина' : 'потом обрыв';
        return { ok: false, detail: `ответ обрезан: пришло ${bytes(received)}, ${how}` };
      }
      const text = new TextDecoder().decode(concat(chunks, received));
      try {
        const body = (JSON.parse(text) as Array<{ body: string }>)[0]?.body ?? '';
        return body.length >= 65536 ? { ok: true, detail: bytes(received) } : { ok: false, detail: `ответ обрезан: пришло ${bytes(received)}` };
      } catch {
        return { ok: false, detail: `ответ обрезан: пришло ${bytes(received)}` };
      }
    } finally {
      clearTimeout(timer);
    }
  });
}

function concat(chunks: Uint8Array[], size: number) {
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

export function checkAuth(url: string, key: string, f: FetchImpl = fetch) {
  return timed('auth', 'Вход по почте', async () => {
    const res = await f(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: 'no-store' });
    if (!res.ok) return { ok: false, detail: `ошибка ${res.status}` };
    const s = (await res.json()) as { external?: { email?: boolean; google?: boolean } };
    const email = !!s.external?.email;
    return { ok: email, detail: `почта ${email ? 'включена' : 'выключена'}, Google ${s.external?.google ? 'включён' : 'выключен'}` };
  });
}

export function checkGoogle(f: FetchImpl = fetch) {
  return timed('google', 'Вход Google', async () => {
    await f('https://accounts.google.com/gsi/client', { mode: 'no-cors', cache: 'no-store' });
    return { ok: true, detail: 'открывается' };
  });
}

export function checkRealtime(client: SupabaseClient) {
  return timed('realtime', 'Мгновенные обновления', () => new Promise((resolve) => {
    const ch = client.channel(`probe-${Math.random().toString(36).slice(2)}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { client.removeChannel(ch); resolve({ ok: true, detail: 'подключились' }); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { client.removeChannel(ch); resolve({ ok: false, detail: 'не подключились' }); }
    });
  }));
}

export function formatReport(results: CheckResult[], env: { ua: string; net: string; host: string; at: string }): string {
  return [
    `Проверка доступа, ${env.at}`,
    `Сайт: ${env.host}`,
    `Сеть: ${env.net}`,
    `Телефон: ${env.ua}`,
    ...results.map((r) => `${r.ok ? '✓' : '✗'} ${r.title} — ${r.ms} мс — ${r.detail}`),
  ].join('\n');
}
