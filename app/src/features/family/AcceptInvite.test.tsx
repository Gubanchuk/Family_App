import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AcceptInvite from './AcceptInvite';

vi.mock('./api', () => ({ MEMBER_COLORS: ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'], acceptInvite: vi.fn(() => Promise.resolve('m1')) }));

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
    await userEvent.type(screen.getByLabelText('Как вас называть'), 'Сын');
    await userEvent.click(screen.getByRole('button', { name: 'Вступить' }));
    expect(await screen.findByText('Главная')).toBeInTheDocument();
    expect(done).toHaveBeenCalled();
  });

  it('keeps the invite until the family has loaded, so «Создать семью» never flashes', async () => {
    sessionStorage.setItem('fa.invite', 'ABCD234XYZ');
    let finish = () => {};
    const done = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    render(<MemoryRouter initialEntries={['/join?code=ABCD234XYZ']}><Routes>
      <Route path="/join" element={<AcceptInvite code="ABCD234XYZ" onDone={done} />} />
      <Route path="/" element={<p>Главная</p>} />
    </Routes></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Как вас называть'), 'Сын');
    await userEvent.click(screen.getByRole('button', { name: 'Вступить' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(sessionStorage.getItem('fa.invite')).toBe('ABCD234XYZ');
    finish();
    await waitFor(() => expect(sessionStorage.getItem('fa.invite')).toBeNull());
  });
});
