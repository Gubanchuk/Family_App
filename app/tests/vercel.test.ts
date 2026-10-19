// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vercel.json', () => {
  const raw = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  it('is valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });
  const rewrites: Array<{ source: string; destination: string }> = JSON.parse(raw).rewrites;
  it('sends app routes to index.html and leaves files and the base alone', () => {
    const source = rewrites.find((r) => r.destination === '/index.html')!.source;
    const re = new RegExp(`^${source}$`);
    for (const p of ['/', '/join', '/settings', '/menu']) expect(re.test(p), p).toBe(true);
    for (const p of ['/assets/index-abc.js', '/icon.svg', '/manifest.webmanifest', '/sw.js', '/sb/rest/v1/recipes', '/sb/auth/v1/authorize']) expect(re.test(p), p).toBe(false);
  });
  it('passes /sb/ to Supabase before the app routes, uncached', () => {
    expect(rewrites[0]).toEqual({ source: '/sb/:path*', destination: 'https://pbipnjlsxkbhdyfebdeo.supabase.co/:path*' });
    expect(JSON.parse(raw).headers[0]).toEqual({ source: '/sb/:path*', headers: [{ key: 'x-vercel-enable-rewrite-caching', value: '0' }] });
  });
});
