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
});
