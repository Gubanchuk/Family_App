import { describe, expect, it, vi } from 'vitest';
import { checkAuth, checkGoogle, checkRest, formatReport, withTimeout } from './checks';

const URL = 'https://x.supabase.co';
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('probe checks', () => {
  it('passes when the whole 64 KB payload arrives', async () => {
    const f = vi.fn(() => json([{ body: 'a'.repeat(65536) }]));
    const r = await checkRest(URL, 'k', f);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledWith(`${URL}/rest/v1/probe_payload?select=body&id=eq.1`, expect.objectContaining({ headers: expect.objectContaining({ apikey: 'k' }) }));
  });

  it('reports a cut response with the size that arrived', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('[{"body":"' + 'a'.repeat(16000), { status: 200 })));
    const r = await checkRest(URL, 'k', f);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/ответ обрезан/);
    expect(r.detail).toMatch(/16\s0\d\d байт/);
  });

  it('says the probe table is missing when migrations are not pushed', async () => {
    const r = await checkRest(URL, 'k', vi.fn(() => Promise.resolve(new Response('{"code":"PGRST205"}', { status: 404 }))));
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('таблицы проверки ещё нет: нужно выложить миграции базы');
  });

  it('reports a network failure in plain words', async () => {
    const r = await checkRest(URL, 'k', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('нет соединения');
  });

  it('reads the sign-in settings', async () => {
    const r = await checkAuth(URL, 'k', vi.fn(() => json({ external: { email: true, google: false } })));
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('почта включена, Google выключен');
  });

  it('treats an opaque Google response as reachable', async () => {
    const r = await checkGoogle(vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
    expect(r.ok).toBe(true);
  });

  it('times out a hanging request', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 10000);
    vi.advanceTimersByTime(10001);
    await expect(p).rejects.toThrow('timeout');
    vi.useRealTimers();
  });

  it('formats a report to paste into the chat', () => {
    const text = formatReport([{ id: 'rest', title: 'База', ok: true, ms: 120, detail: '65 545 байт' }], { ua: 'UA', net: '4g', host: 'h', at: '2026-10-14 10:00' });
    expect(text).toContain('✓ База — 120 мс — 65 545 байт');
    expect(text).toContain('Сеть: 4g');
  });
});
