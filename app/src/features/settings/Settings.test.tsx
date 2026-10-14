import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';
import { createInvite, setRole } from '../family/api';
import type { Member } from '../family/useFamily';

vi.mock('./syncTheme', () => ({ saveThemeChoice: vi.fn(() => Promise.resolve()), loadThemeChoice: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../family/api', () => ({
  MEMBER_COLORS: ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'],
  createInvite: vi.fn(() => Promise.resolve('ABCD234XYZ')),
  setRole: vi.fn(() => Promise.resolve()),
  addProfileWithoutSignIn: vi.fn(() => Promise.resolve()),
}));

const m = (o: Partial<Member>): Member => ({ id: 'x', household_id: 'h', user_id: null, name: 'X', color: '#2F6FDB', role: 'parent', is_owner: false, portion: 1, ...o });
const papa = m({ id: 'p', user_id: 'u1', name: 'Папа', is_owner: true });
const son = m({ id: 's', user_id: 'u2', name: 'Сын', role: 'child', color: '#1FA463' });
const mama = m({ id: 'mm', user_id: 'u3', name: 'Мама', color: '#E0457B' });
const dima = m({ id: 'd', name: 'Дима', role: 'child', color: '#F2A900', portion: 0.5 });

describe('Settings', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
  afterEach(() => vi.unstubAllGlobals());

  it('shows the family with roles to a parent', () => {
    render(<MemoryRouter><Settings me={papa} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Семья' })).toBeInTheDocument();
    expect(screen.getByText('Ребёнок · без входа, ведут родители')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пригласить ребёнка/ })).toBeInTheDocument();
  });

  it('hides family management from a child', () => {
    render(<MemoryRouter><Settings me={son} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Семья' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Выйти/ })).toBeInTheDocument();
  });

  it('lets the owner invite a parent or a child', async () => {
    render(<MemoryRouter><Settings me={papa} members={[papa, mama, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Пригласить родителя/ }));
    expect(createInvite).toHaveBeenCalledWith('h', 'parent');
    expect(screen.getByRole('button', { name: /Пригласить ребёнка/ })).toBeInTheDocument();
  });

  it('lets a second parent invite only children', () => {
    render(<MemoryRouter><Settings me={mama} members={[papa, mama, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Пригласить родителя/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Пригласить ребёнка/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сделать/ })).toBeNull();
  });

  it('lets the owner switch a member between parent and child', async () => {
    const reload = vi.fn();
    render(<MemoryRouter><Settings me={papa} members={[papa, mama, son, dima]} reload={reload} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Сын: сделать родителем' }));
    expect(setRole).toHaveBeenCalledWith(son, 'parent');
    expect(screen.getByRole('button', { name: 'Мама: сделать ребёнком' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Папа: сделать/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Дима: сделать/ })).toBeNull();
    expect(reload).toHaveBeenCalled();
  });
});
