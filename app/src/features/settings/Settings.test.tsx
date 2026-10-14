import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';
import { addProfileWithoutSignIn, createInvite, setAvatar, setRole, updateMember, updateMyProfile } from '../family/api';
import type { Member } from '../family/useFamily';

vi.mock('./FoodCard', () => ({ default: () => null }));
vi.mock('./NotifyCard', () => ({ default: () => null }));
vi.mock('./syncTheme', () => ({ saveThemeChoice: vi.fn(() => Promise.resolve()), loadThemeChoice: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../family/api', () => ({
  MEMBER_COLORS: ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'],
  createInvite: vi.fn(() => Promise.resolve('ABCD234XYZ')),
  setRole: vi.fn(() => Promise.resolve()),
  addProfileWithoutSignIn: vi.fn(() => Promise.resolve('d2')),
  householdName: vi.fn(() => Promise.resolve('Губанчуки')),
  updateMyProfile: vi.fn(() => Promise.resolve()),
  updateMember: vi.fn(() => Promise.resolve()),
  setAvatar: vi.fn(() => Promise.resolve()),
}));

const m = (o: Partial<Member>): Member => ({ id: 'x', household_id: 'h', user_id: null, name: 'X', color: '#2F6FDB', role: 'parent', is_owner: false, portion: 1, ...o });
const papa = m({ id: 'p', user_id: 'u1', name: 'Папа', is_owner: true });
const son = m({ id: 's', user_id: 'u2', name: 'Сын', role: 'child', color: '#1FA463' });
const mama = m({ id: 'mm', user_id: 'u3', name: 'Мама', color: '#E0457B' });
const dima = m({ id: 'd', name: 'Дима', role: 'child', color: '#F2A900', portion: 0.5 });

describe('Settings', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the family with its name and who is who to a parent', async () => {
    render(<MemoryRouter><Settings me={{ ...papa, kin: 'father' }} members={[{ ...papa, kin: 'father' }, { ...mama, kin: 'mother' }, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Семья «Губанчуки»' })).toBeInTheDocument();
    expect(screen.getAllByText('Папа · владелец семьи')).toHaveLength(2);
    expect(screen.getByText('Мама · родитель')).toBeInTheDocument();
    expect(screen.getByText('Ребёнок · свой вход')).toBeInTheDocument();
    expect(screen.getByText('Ребёнок · без входа, ведут родители')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пригласить ребёнка/ })).toBeInTheDocument();
  });

  it('hides family management from a child', () => {
    render(<MemoryRouter><Settings me={son} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Семья' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Тема' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Выйти/ })).toBeInTheDocument();
    expect(screen.getByText('Работает без интернета')).toBeInTheDocument();
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

  it('creates the invite first, then sends it with the phone share menu in a second tap', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<MemoryRouter><Settings me={papa} members={[papa, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Пригласить ребёнка/ }));
    expect(await screen.findByText('Ссылка для ребёнка')).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/join?code=ABCD234XYZ') }));
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('lets anyone, a child too, fix their own name, colour and who they are', async () => {
    const reload = vi.fn();
    render(<MemoryRouter><Settings me={son} members={[papa, son]} reload={reload} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const name = screen.getByLabelText('Имя');
    await userEvent.clear(name);
    await userEvent.type(name, 'Тёма');
    expect(screen.getByRole('button', { name: 'Синий, занят: Папа' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Жёлтый' }));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Мама' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(updateMyProfile).toHaveBeenCalledWith('Тёма', '#F2A900', 'son');
    expect(reload).toHaveBeenCalled();
  });

  it('lets a parent say who the others are, but not touch the owner', async () => {
    const reload = vi.fn();
    const { unmount } = render(<MemoryRouter><Settings me={papa} members={[papa, mama, son, dima]} reload={reload} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Папа.*изменить$/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Мама, Родитель: изменить' }));
    expect(screen.getByRole('group', { name: 'Кто в семье' })).toHaveTextContent('МамаПапаБабушкаДедушка');
    await userEvent.click(screen.getByRole('button', { name: 'Мама' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(updateMember).toHaveBeenCalledWith(mama, 'Мама', '#E0457B', 'mother');
    expect(reload).toHaveBeenCalled();
    unmount();
    render(<MemoryRouter><Settings me={mama} members={[papa, mama, son, dima]} reload={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Папа.*изменить$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Дима, Ребёнок · без входа, ведут родители: изменить' })).toBeInTheDocument();
  });

  it("asks the toddler's name and colour instead of adding a fixed «Дима»", async () => {
    render(<MemoryRouter><Settings me={papa} members={[papa, son]} reload={vi.fn()} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Добавить малыша/ }));
    const add = screen.getByRole('button', { name: 'Добавить в семью' });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Имя'), 'Дима');
    await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
    await userEvent.click(add);
    expect(addProfileWithoutSignIn).toHaveBeenCalledWith('h', 'Дима', '#E0457B', 0.5, 'son');
    expect(setAvatar).toHaveBeenCalledWith({ id: 'd2', household_id: 'h' }, { kind: 'keep' });
  });

  it('saves a new circle photo with the profile', async () => {
    render(<MemoryRouter><Settings me={son} members={[papa, son]} reload={vi.fn()} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Выбрать фото'), file);
    expect(screen.getByLabelText('Приблизить')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(setAvatar).toHaveBeenCalledWith(son, { kind: 'new', file, crop: { x: 0.5, y: 0.5, zoom: 1 } });
  });
});

