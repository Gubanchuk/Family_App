import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StoriesContext, type StoriesCtx } from './storiesContext';
import type { Ring } from './order';
import StoryLink from './StoryLink';

function Where() {
  const loc = useLocation();
  return <p>адрес: {loc.pathname + loc.search}</p>;
}

const ctx = (rings: Record<string, Ring>, openViewer = vi.fn()): StoriesCtx => ({ available: true, ringOf: (id) => rings[id] ?? 'none', openViewer, compose: () => {} });
const show = (value: StoriesCtx, url = '/?story=son') => render(
  <MemoryRouter initialEntries={[url]}><StoriesContext.Provider value={value}><StoryLink /><Where /></StoriesContext.Provider></MemoryRouter>,
);

describe('a story link from a push', () => {
  it('opens the stories of the person who posted and drops the link from the address', async () => {
    const open = vi.fn();
    show(ctx({ son: 'unseen' }, open));
    expect(await screen.findByText('адрес: /')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith('son');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('waits for the fresh list when the phone does not have the story yet', async () => {
    const open = vi.fn();
    const view = show(ctx({}, open));
    expect(screen.getByText('адрес: /?story=son')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    view.rerender(<MemoryRouter initialEntries={['/?story=son']}><StoriesContext.Provider value={ctx({ son: 'unseen' }, open)}><StoryLink /><Where /></StoriesContext.Provider></MemoryRouter>);
    expect(await screen.findByText('адрес: /')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith('son');
  });

  it('does nothing when the story is already gone', async () => {
    const open = vi.fn();
    const view = show(ctx({}, open));
    view.rerender(<MemoryRouter initialEntries={['/?story=son']}><StoriesContext.Provider value={ctx({}, open)}><StoryLink /><Where /></StoriesContext.Provider></MemoryRouter>);
    expect(await screen.findByText('адрес: /')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves other addresses alone', () => {
    const open = vi.fn();
    show(ctx({ son: 'unseen' }, open), '/menu?panel=ideas');
    expect(screen.getByText('адрес: /menu?panel=ideas')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
