import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';

const seen = vi.hoisted(() => ({ signal: null as AbortSignal | null }));
vi.mock('./prepare', async (orig) => ({
  ...(await orig<typeof import('./prepare')>()),
  prepareVideo: vi.fn((_file: File, _onProgress: (p: number) => void, signal?: AbortSignal) => { seen.signal = signal ?? null; return new Promise(() => {}); }),
}));
vi.mock('./storiesApi', () => ({
  loadStories: vi.fn(async () => ({ stories: [], views: [] })),
  cleanupStories: vi.fn(async () => {}),
  storyUrls: vi.fn(async () => new Map()),
  markViewed: vi.fn(async () => {}),
  setReaction: vi.fn(async () => {}),
  deleteStory: vi.fn(async () => {}),
  postStory: vi.fn(async () => ({})),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() } }));

const me: Member = { id: 'me', household_id: 'h', user_id: 'u', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };

describe('story composer', () => {
  it('stops preparing the video when the editor is closed', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    // jsdom has no media playback; the editor loops the video preview.
    HTMLMediaElement.prototype.play = vi.fn(async () => {});
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><p>дом</p></StoriesProvider>);
    await userEvent.upload(screen.getByLabelText('Файл для сторис'), new File(['x'], 'v.mp4', { type: 'video/mp4' }));
    await screen.findByRole('button', { name: 'Закрыть' });
    expect(seen.signal?.aborted).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(seen.signal?.aborted).toBe(true);
  });
});
