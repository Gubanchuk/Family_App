import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StoryViewer from './StoryViewer';
import type { Member } from '../family/useFamily';
import type { Story } from './types';

const me: Member = { id: 'me', household_id: 'h', user_id: 'u1', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...me, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };
const NOW = new Date('2026-10-15T20:00:00Z');
const st = (id: string, member: string, text = ''): Story => ({ id, household_id: 'h', member_id: member, kind: 'photo', path: `h/stories/${id}.jpg`, width: 1080, height: 1920, duration_ms: null,
  overlays: text ? [{ id: 't', type: 'text', text, x: 0.5, y: 0.5, scale: 0.08, rotation: 0, color: '#FFFFFF', style: 'plain' }] : [], created_at: '2026-10-15T18:00:00Z', expires_at: '2026-10-16T18:00:00Z' });

function show(over: Partial<Parameters<typeof StoryViewer>[0]> = {}) {
  const props = {
    groups: [{ memberId: 'son', stories: [st('a', 'son', 'Привет'), st('b', 'son')] }], start: { g: 0, i: 0 }, me, members: [me, son], views: [],
    urls: new Map([['h/stories/a.jpg', 'blob:a'], ['h/stories/b.jpg', 'blob:b']]), now: NOW,
    onViewed: vi.fn(), onReact: vi.fn(), onClose: vi.fn(), onOwn: { viewers: vi.fn(), edit: vi.fn(), remove: vi.fn(), more: vi.fn() }, ...over,
  };
  render(<StoryViewer {...props} />);
  return props;
}

describe('StoryViewer', () => {
  it('shows the story with its caption, who and when, and marks it seen once the photo is shown', () => {
    const p = show();
    expect(screen.getByRole('dialog', { name: 'Сторис: Тёма' })).toBeInTheDocument();
    expect(screen.getByText('Привет')).toBeInTheDocument();
    expect(screen.getByText('2 ч назад')).toBeInTheDocument();
    fireEvent.load(screen.getByTestId('story-media'));
    expect(p.onViewed).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('goes on after six seconds and closes after the last story', () => {
    vi.useFakeTimers();
    const p = show();
    fireEvent.load(screen.getByTestId('story-media'));
    act(() => { vi.advanceTimersByTime(6100); });
    expect(screen.queryByText('Привет')).toBeNull();
    fireEvent.load(screen.getByTestId('story-media'));
    act(() => { vi.advanceTimersByTime(6100); });
    expect(p.onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends a reaction and takes it back with a second tap', async () => {
    const p = show({ views: [{ story_id: 'a', member_id: 'me', viewed_at: '', reaction: '🔥' }] });
    await userEvent.click(screen.getByRole('button', { name: 'Реакция ❤️' }));
    expect(p.onReact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), '❤️');
    await userEvent.click(screen.getByRole('button', { name: 'Реакция 🔥' }));
    expect(p.onReact).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), null);
  });

  it('shows the author views and actions instead of reactions', () => {
    show({ groups: [{ memberId: 'me', stories: [st('a', 'me')] }], views: [{ story_id: 'a', member_id: 'son', viewed_at: '', reaction: '❤️' }] });
    expect(screen.queryByRole('button', { name: 'Реакция ❤️' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Посмотрели: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить надписи' })).toBeInTheDocument();
  });

  it('skips a story whose day ran out while the viewer was open', () => {
    const old = { ...st('a', 'son', 'Старое'), expires_at: '2026-10-15T19:59:00Z' };
    show({ groups: [{ memberId: 'son', stories: [old, st('b', 'son', 'Свежее')] }] });
    expect(screen.queryByText('Старое')).toBeNull();
    expect(screen.getByText('Свежее')).toBeInTheDocument();
  });

  it('moves on when a story file cannot be shown instead of freezing', () => {
    show({ groups: [{ memberId: 'son', stories: [st('a', 'son', 'Битое'), st('b', 'son', 'Целое')] }] });
    fireEvent.error(screen.getByTestId('story-media'));
    expect(screen.queryByText('Битое')).toBeNull();
    expect(screen.getByText('Целое')).toBeInTheDocument();
  });
});

