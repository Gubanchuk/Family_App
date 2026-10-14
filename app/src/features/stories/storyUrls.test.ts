import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storyUrls } from './storiesApi';
import type { Story } from './types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const s = (id: string): Story => ({ id, household_id: 'h', member_id: 'm', kind: 'video', path: `h/stories/${id}.mp4`, width: 1, height: 1, duration_ms: 1000, overlays: [], created_at: '', expires_at: '' });

describe('story links', () => {
  beforeEach(() => localStorage.clear());

  it('reuses a signed link, so the phone plays a watched video from its cache instead of downloading it again', async () => {
    const signer = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://cdn/${p}?t=${Math.random()}`])));
    const first = await storyUrls([s('a')], signer, 1_000_000);
    const again = await storyUrls([s('a'), s('b')], signer, 1_000_000 + 60_000);
    expect(again.get('h/stories/a.mp4')).toBe(first.get('h/stories/a.mp4'));
    expect(signer).toHaveBeenLastCalledWith(['h/stories/b.mp4'], expect.any(Number));
  });

  it('keeps remembered links when the network is down', async () => {
    await storyUrls([s('a')], async (paths) => new Map(paths.map((p) => [p, 'https://cdn/a'])), 1_000_000);
    const offline = await storyUrls([s('a')], async () => { throw new Error('offline'); }, 1_000_000 + 5 * 3600_000 + 55 * 60_000);
    expect(offline.get('h/stories/a.mp4')).toBe('https://cdn/a');
  });
});
