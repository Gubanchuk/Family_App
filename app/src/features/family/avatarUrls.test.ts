import { beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarUrl, setAvatarSigner } from './avatarUrls';

describe('avatar links', () => {
  beforeEach(() => localStorage.clear());

  it('asks for all links of a screen in one request and reuses them', async () => {
    const signer = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://cdn/${p}?t=1`])));
    setAvatarSigner(signer);
    const [a, b] = await Promise.all([avatarUrl('h/avatars/m1/1.jpg'), avatarUrl('h/avatars/m2/1.jpg')]);
    expect(a).toBe('https://cdn/h/avatars/m1/1.jpg?t=1');
    expect(b).toBe('https://cdn/h/avatars/m2/1.jpg?t=1');
    expect(signer).toHaveBeenCalledTimes(1);
    await avatarUrl('h/avatars/m1/1.jpg');
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('keeps showing a remembered link when the network is down', async () => {
    setAvatarSigner(async (paths) => new Map(paths.map((p) => [p, 'https://cdn/old'])));
    await avatarUrl('h/avatars/m1/1.jpg', Date.now());
    setAvatarSigner(async () => { throw new Error('offline'); });
    // Nine days later the link is due for renewal, the renewal fails, the old one is still used.
    expect(await avatarUrl('h/avatars/m1/1.jpg', Date.now() + 9 * 86_400_000)).toBe('https://cdn/old');
  });

  it('asks for many links in small requests, so no answer grows large', async () => {
    const signer = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://cdn/${p}`])));
    setAvatarSigner(signer);
    const paths = Array.from({ length: 95 }, (_, i) => `base/r${i}.jpg`);
    const urls = await Promise.all(paths.map((p) => avatarUrl(p)));
    expect(urls[94]).toBe('https://cdn/base/r94.jpg');
    expect(signer.mock.calls.map(([p]) => p.length)).toEqual([40, 40, 15]);
  });
});
