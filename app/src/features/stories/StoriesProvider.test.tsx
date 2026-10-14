import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';
import { useStories } from './storiesContext';

const api = vi.hoisted(() => ({ result: 'missing' as unknown }));
vi.mock('./storiesApi', () => ({
  loadStories: vi.fn(async () => api.result),
  cleanupStories: vi.fn(async () => {}),
  storyUrls: vi.fn(async () => new Map()),
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
});
