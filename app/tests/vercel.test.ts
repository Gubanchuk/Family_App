// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vercel.json', () => {
  const raw = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  it('is valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });
  it('sends app routes to index.html and leaves files alone', () => {
    const source: string = JSON.parse(raw).rewrites[0].source;
    const re = new RegExp(`^${source}$`);
    for (const p of ['/', '/join', '/settings', '/menu']) expect(re.test(p), p).toBe(true);
    for (const p of ['/assets/index-abc.js', '/icon.svg', '/manifest.webmanifest', '/sw.js']) expect(re.test(p), p).toBe(false);
  });
});
