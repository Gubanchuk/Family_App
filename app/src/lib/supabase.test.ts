import { afterEach, describe, expect, it, vi } from 'vitest';
import { timedFetch } from './supabase';

describe('timedFetch', () => {
  afterEach(() => vi.useRealTimers());
  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    const p = timedFetch(15_000, hanging as typeof fetch)('https://x.supabase.co/rest/v1/weeks');
    const check = expect(p).rejects.toThrow(/15 секунд/);
    await vi.advanceTimersByTimeAsync(15_001);
    await check;
  });
  it('passes a quick answer through', async () => {
    const ok = vi.fn(() => Promise.resolve(new Response('[]')));
    expect(await (await timedFetch(15_000, ok as typeof fetch)('https://x')).text()).toBe('[]');
  });

  it('gives up on an answer whose body stops arriving', async () => {
    vi.useFakeTimers();
    const stalling = vi.fn((_: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('[{"body":"'));
        init?.signal?.addEventListener('abort', () => c.error(init.signal!.reason));
      },
    }))));
    const res = await timedFetch(15_000, stalling as typeof fetch)('https://x.supabase.co/rest/v1/recipes');
    const check = expect(res.text()).rejects.toThrow(/15 секунд/);
    await vi.advanceTimersByTimeAsync(15_001);
    await check;
  });
  it('lets a slow but moving answer finish', async () => {
    vi.useFakeTimers();
    const slow = vi.fn((_: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(c) {
        init?.signal?.addEventListener('abort', () => c.error(init.signal!.reason));
        let n = 0;
        const t = setInterval(() => { c.enqueue(new TextEncoder().encode('ab')); n += 1; if (n === 4) { clearInterval(t); c.close(); } }, 10_000);
      },
    }))));
    const res = await timedFetch(15_000, slow as typeof fetch)('https://x.supabase.co/rest/v1/recipes');
    const text = res.text();
    await vi.advanceTimersByTimeAsync(40_001);
    expect(await text).toBe('abababab');
  });

  it('passes a «204 No Content» answer through even when the browser gives it an empty body stream', async () => {
    // Chrome hands a 204 to fetch with a non-null, empty body; a Response with status 204 and a body cannot be built.
    const noContent = { status: 204, statusText: 'No Content', ok: true, headers: new Headers(), body: new ReadableStream<Uint8Array>({ start(c) { c.close(); } }) } as unknown as Response;
    const res = await timedFetch(15_000, (() => Promise.resolve(noContent)) as typeof fetch)('https://x.supabase.co/rest/v1/rpc/save_week');
    expect(res.status).toBe(204);
  });
});

