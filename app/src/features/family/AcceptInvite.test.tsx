import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AcceptInvite from './AcceptInvite';
import { acceptInvite } from './api';

const api = vi.hoisted(() => ({ info: null as unknown }));
vi.mock('./api', () => ({
  MEMBER_COLORS: ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'],
  acceptInvite: vi.fn(() => Promise.resolve('m1')),
  inviteInfo: vi.fn(() => Promise.resolve(api.info)),
}));

describe('AcceptInvite', () => {
  it('takes a new member to the home screen after joining', async () => {
    const done = vi.fn();
    render(
      <MemoryRouter initialEntries={['/join?code=ABCD234XYZ']}>
        <Routes>
          <Route path="/join" element={<AcceptInvite code="ABCD234XYZ" onDone={done} />} />
          <Route path="/" element={<p>Главная</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Как вас называть'), 'Тёма');
    expect(screen.getByRole('button', { name: 'Вступить в семью' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
    await userEvent.click(screen.getByRole('button', { name: 'Вступить в семью' }));
    expect(await screen.findByText('Главная')).toBeInTheDocument();
    expect(done).toHaveBeenCalled();
    expect(acceptInvite).toHaveBeenCalledWith('ABCD234XYZ', 'Тёма', '#1FA463', 'son');
  });

  it('keeps the invite until the family has loaded, so «Создать семью» never flashes', async () => {
    sessionStorage.setItem('fa.invite', 'ABCD234XYZ');
    let finish = () => {};
    const done = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    render(<MemoryRouter initialEntries={['/join?code=ABCD234XYZ']}><Routes>
      <Route path="/join" element={<AcceptInvite code="ABCD234XYZ" onDone={done} />} />
      <Route path="/" element={<p>Главная</p>} />
    </Routes></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Как вас называть'), 'Тёма');
    await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
    await userEvent.click(screen.getByRole('button', { name: 'Вступить в семью' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(sessionStorage.getItem('fa.invite')).toBe('ABCD234XYZ');
    finish();
    await waitFor(() => expect(sessionStorage.getItem('fa.invite')).toBeNull());
  });

  it('names the family, who is there and the role, and keeps colours others have', async () => {
    api.info = { family: 'Губанчуки', role: 'child', expires_at: '2026-10-21T00:00:00Z', profile: null, members: [{ name: 'Андрей', color: '#2F6FDB', kin: 'father' }, { name: 'Мама', color: '#1FA463', kin: 'mother' }] };
    render(<MemoryRouter><AcceptInvite code="ABCD234XYZ" onDone={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Вас зовут в семью «Губанчуки»' })).toBeInTheDocument();
    expect(screen.getByText(/Там уже: Андрей \(папа\), Мама\. Вы будете ребёнком/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Кто вы в семье' })).toHaveTextContent('СынДочь');
    expect(screen.getByRole('button', { name: 'Зелёный, занят: Мама' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Розовый' })).toHaveAttribute('aria-pressed', 'true');
    api.info = null;
  });

  it('says plainly when the link is used up instead of showing a form', async () => {
    api.info = { error: 'invite_used' };
    render(<MemoryRouter><AcceptInvite code="ABCD234XYZ" onDone={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Это приглашение уже использовали');
    expect(screen.queryByRole('button', { name: 'Вступить в семью' })).toBeNull();
    api.info = null;
  });
});
