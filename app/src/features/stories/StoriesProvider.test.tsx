import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';
import { useStories } from './storiesContext';

const api = vi.hoisted(() => ({ result: 'missing' as unknown }));
vi.mock('./storiesApi', () => ({
  loadStories: vi.fn(async () => api.result),
  cleanupStories: vi.fn(async () => {}),
  storyUrls: vi.fn(async (list: Array<{ path: string }>) => new Map(list.map((s) => [s.path, 'blob:s']))),
  markViewed: vi.fn(async () => {}),
  setReaction: vi.fn(async () => {}),
  deleteStory: vi.fn(async () => {}),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() } }));

const me: Member = { id: 'me', household_id: 'h', user_id: 'u', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
function Probe() {
  const st = useStories();
  return <p>{st.available ? `есть: ${st.ringOf('son')}` : 'нет сторис'}</p>;
}

describe('StoriesProvider', () => {
  it('hides stories while the database has no stories table', async () => {
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><Probe /></StoriesProvider>);
    await waitFor(() => expect(screen.getByText('нет сторис')).toBeInTheDocument());
  });

  it('rings a member with a fresh story', async () => {
    api.result = { stories: [{ id: 's', household_id: 'h', member_id: 'son', kind: 'photo', path: 'h/stories/s.jpg', width: 1, height: 1, duration_ms: null, overlays: [], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() }], views: [] };
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><Probe /></StoriesProvider>);
    expect(await screen.findByText('есть: unseen')).toBeInTheDocument();
  });

  it('says plainly when the picked file is neither a photo nor a video', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><Probe /></StoriesProvider>);
    await userEvent.upload(screen.getByLabelText('Файл для сторис'), new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Этот файл не фото и не видео.');
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
  });

  it('opens «Кто посмотрел» and the delete question on top of the story, not under it', async () => {
    const fresh = { household_id: 'h', kind: 'photo', width: 1, height: 1, duration_ms: null, overlays: [], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() };
    api.result = { stories: [{ ...fresh, id: 'mine', member_id: 'me', path: 'h/stories/mine.jpg' }], views: [{ story_id: 'mine', member_id: 'son', viewed_at: '', reaction: '❤️' }] };
    const son: Member = { ...me, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };
    function Open() { const st = useStories(); return <button type="button" onClick={() => st.openViewer('me')}>Открыть</button>; }
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me, son]}><Open /></StoriesProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Открыть' })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    const layer = await screen.findByRole('dialog', { name: 'Сторис: Аня' });
    await userEvent.click(within(layer).getByRole('button', { name: 'Посмотрели: 1' }));
    const viewers = within(layer).getByRole('dialog', { name: 'Кто посмотрел' });
    expect(viewers).toHaveTextContent('Тёма');
    await userEvent.click(within(viewers).getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(within(layer).getByRole('button', { name: 'Удалить сторис' }));
    expect(within(layer).getByRole('dialog', { name: 'Удалить сторис?' })).toBeInTheDocument();
  });
});
