import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import BoardPage from './BoardPage';

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };

describe('requests', () => {
  it('lets mom ask the son and the son mark it done', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const { unmount } = render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('О чём просим'), 'Вынести мусор');
    await userEvent.click(screen.getByRole('button', { name: 'Тёма' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));
    await userEvent.click(screen.getByRole('button', { name: 'Попросить' }));
    expect(await screen.findByText('Вынести мусор')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Вынести мусор: сделал(а)' }));
    await waitFor(async () => expect((await db.requests.toArray())[0]).toMatchObject({ status: 'done' }));
  });

  it('lets the son answer «Хорошо» or «Не могу», and mom sees the answer', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'features', value: ['requestAnswers'] });
    const ask = { household_id: 'h', from_id: 'mama', to_id: 'son', due_on: null, urgent: false, status: 'open' as const, done_at: null, updated_at: 'x', deleted_at: null };
    await db.requests.bulkPut([{ ...ask, id: 'r1', title: 'Вынести мусор' }, { ...ask, id: 'r2', title: 'Помыть машину' }]);
    const { unmount } = render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    // Nothing to tick before an answer.
    expect(await screen.findByRole('button', { name: 'Вынести мусор: хорошо' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вынести мусор: сделал(а)' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Вынести мусор: хорошо' }));
    await userEvent.click(screen.getByRole('button', { name: 'Помыть машину: не могу' }));
    await waitFor(async () => expect((await db.requests.get('r2'))?.status).toBe('declined'));
    expect((await db.requests.get('r1'))?.status).toBe('accepted');
    // Taken: the row says so, the tick is a labelled button, and a tick taken back leaves it taken.
    expect(await screen.findByText('Ты взялся · отметь, когда сделаешь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вынести мусор: сделал(а)' })).toHaveTextContent('Сделал(а)');
    await userEvent.click(screen.getByRole('button', { name: 'Вынести мусор: сделал(а)' }));
    await waitFor(async () => expect((await db.requests.get('r1'))?.status).toBe('done'));
    await userEvent.click(await screen.findByRole('button', { name: 'Вынести мусор: вернуть' }));
    await waitFor(async () => expect((await db.requests.get('r1'))?.status).toBe('accepted'));
    expect(screen.getByRole('button', { name: 'Всё-таки сделаю' })).toBeInTheDocument();
    unmount();
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={mama} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Тёма · сделает · без срока')).toBeInTheDocument();
    expect(screen.getByText('Тёма · не может')).toBeInTheDocument();
  });

  it('lets the one who took a request change their mind, in words that fit them', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'features', value: ['requestAnswers'] });
    const ask = { household_id: 'h', due_on: null, urgent: false, status: 'accepted' as const, done_at: null, updated_at: 'x', deleted_at: null };
    await db.requests.bulkPut([{ ...ask, id: 'r1', from_id: 'mama', to_id: 'dasha', title: 'Полить цветы' }, { ...ask, id: 'r2', from_id: 'dasha', to_id: 'mama', title: 'Купить краски' }]);
    const dasha: Member = { ...son, id: 'dasha', name: 'Даша', kin: 'daughter' };
    const mom: Member = { ...mama, kin: 'mother' };
    const { unmount } = render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={dasha} members={[mom, dasha]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Ты взялась · отметь, когда сделаешь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Полить цветы: сделала' })).toHaveTextContent('Сделала');
    await userEvent.click(screen.getByRole('button', { name: 'Полить цветы: передумала' }));
    await waitFor(async () => expect((await db.requests.get('r1'))?.status).toBe('open'));
    // Back to the first answer.
    expect(await screen.findByRole('button', { name: 'Полить цветы: хорошо' })).toBeInTheDocument();
    unmount();
    // An adult is spoken to as «вы».
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={mom} members={[mom, dasha]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Вы взялись · отметьте, когда сделаете')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Купить краски: передумала' })).toBeInTheDocument();
    expect(screen.getByText('Даша · ждёт ответа · без срока')).toBeInTheDocument();
  });

  it('shows a request from someone who left the family without breaking', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.requests.put({ id: 'r1', household_id: 'h', from_id: 'gone', to_id: 'son', title: 'Полить цветы', due_on: null, urgent: false, status: 'open', done_at: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/board?tab=requests']}><BoardPage me={son} members={[mama, son]} db={db} /></MemoryRouter>);
    expect(await screen.findByText('Полить цветы')).toBeInTheDocument();
    expect(screen.getByText(/Кто-то/)).toBeInTheDocument();
  });
});
