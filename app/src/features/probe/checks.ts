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

export function checkRest(url: string, key: string, f: FetchImpl = fetch) {
  return timed('rest', 'База Supabase, ответ 64 КБ', async () => {
    const res = await f(`${url}/rest/v1/probe_payload?select=body&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
    const text = await res.text();
    if (res.status === 404) return { ok: false, detail: 'таблицы проверки ещё нет: нужно выложить миграции базы' };
    if (!res.ok) return { ok: false, detail: `ошибка ${res.status}` };
    try {
      const body = (JSON.parse(text) as Array<{ body: string }>)[0]?.body ?? '';
      return body.length >= 65536 ? { ok: true, detail: bytes(text.length) } : { ok: false, detail: `ответ обрезан: пришло ${bytes(text.length)}` };
    } catch {
      return { ok: false, detail: `ответ обрезан: пришло ${bytes(text.length)}` };
    }
  });
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
