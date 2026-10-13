import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import type { Member } from '../family/useFamily';

vi.mock('./syncTheme', () => ({ saveThemeChoice: vi.fn(() => Promise.resolve()), loadThemeChoice: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));

const m = (o: Partial<Member>): Member => ({ id: 'x', household_id: 'h', user_id: null, name: 'X', color: '#2F6FDB', role: 'parent', is_owner: false, portion: 1, ...o });
const papa = m({ id: 'p', user_id: 'u1', name: 'Папа', is_owner: true });
const son = m({ id: 's', user_id: 'u2', name: 'Сын', role: 'child', color: '#1FA463' });
const dima = m({ id: 'd', name: 'Дима', role: 'child', color: '#F2A900', portion: 0.5 });

describe('Settings', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
  afterEach(() => vi.unstubAllGlobals());

  it('shows the family with roles to a parent', () => {
    render(<MemoryRouter><Settings me={papa} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Семья' })).toBeInTheDocument();
    expect(screen.getByText('Ребёнок · без входа, ведут родители')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пригласить в семью/ })).toBeInTheDocument();
  });

  it('hides family management from a child', () => {
    render(<MemoryRouter><Settings me={son} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Семья' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Выйти/ })).toBeInTheDocument();
  });
});
