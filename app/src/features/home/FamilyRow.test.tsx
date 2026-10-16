import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import FamilyRow from './FamilyRow';
import { StoriesContext } from '../stories/storiesContext';
import type { Ring } from '../stories/order';
import type { Member } from '../family/useFamily';

const me: Member = { id: 'me', household_id: 'h', user_id: 'u1', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...me, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
const papa: Member = { ...me, id: 'papa', user_id: 'u3', name: 'Андрей', is_owner: false, kin: 'father' };

describe('FamilyRow', () => {
  it('puts me first with a «+», rings a person with a new story and opens it', async () => {
    const openViewer = vi.fn();
    const compose = vi.fn();
    const ring = (id: string): Ring => (id === 'son' ? 'unseen' : id === 'papa' ? 'seen' : 'none');
    render(<MemoryRouter><StoriesContext.Provider value={{ available: true, ringOf: ring, openViewer, compose }}><FamilyRow me={me} members={[papa, me, son]} /></StoriesContext.Provider></MemoryRouter>);
    const chips = screen.getAllByRole('button');
    expect(chips[0]).toHaveAccessibleName('Добавить сторис');
    await userEvent.click(chips[0]);
    expect(compose).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Тёма, новая сторис' }));
    expect(openViewer).toHaveBeenCalledWith('son');
    expect(screen.getByRole('button', { name: 'Андрей, сторис' })).toBeInTheDocument();
  });

  it('keeps plain circles when stories are not available', () => {
    render(<MemoryRouter><FamilyRow me={me} members={[me, son]} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /сторис/ })).toBeNull();
    expect(screen.getByText('Тёма')).toBeInTheDocument();
  });

  it('shows the open requests to a person on their circle, like unread messages', () => {
    const ring = (id: string): Ring => (id === 'son' ? 'unseen' : 'none');
    render(<MemoryRouter><StoriesContext.Provider value={{ available: true, ringOf: ring, openViewer: vi.fn(), compose: vi.fn() }}><FamilyRow me={me} members={[me, son, papa]} todo={new Map([['son', 2], ['papa', 1]])} /></StoriesContext.Provider></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Тёма, новая сторис, 2 просьбы' })).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: 'Семья' })).toHaveTextContent('1 просьба');
    expect(screen.getByRole('button', { name: 'Добавить сторис' })).not.toHaveTextContent(/\d/);
  });
});
