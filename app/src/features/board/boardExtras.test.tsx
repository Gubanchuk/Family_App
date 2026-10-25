import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { setAvatarSigner } from '../family/avatarUrls';
import BoardPage from './BoardPage';

vi.mock('../../lib/photos', () => ({
  photoPathFor: vi.fn(async (h: string, k: string, id: string, e: { kind: string }) => (e.kind === 'new' ? `${h}/photos/${k}/${id}/1.jpg` : e.kind === 'remove' ? null : undefined)),
  dropOldPhoto: vi.fn(async () => {}),
}));

const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u1', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const papa: Member = { ...mama, id: 'papa', user_id: 'u3', name: 'Андрей', is_owner: false, kin: 'father' };
const son: Member = { ...mama, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
const dima: Member = { ...mama, id: 'dima', user_id: null, name: 'Дима', role: 'child', is_owner: false, kin: 'son' };
const family = [mama, papa, son, dima];
const board = async (features: string[], tab = 'wishes', me = mama) => {
  const db = createLocalDb(`t-${Math.random()}`);
  await db.meta.put({ key: 'features', value: features });
  render(<MemoryRouter initialEntries={[`/board?tab=${tab}`]}><BoardPage me={me} members={family} db={db} /></MemoryRouter>);
  return db;
};

describe('board: who sees it and photos', () => {
  it('hides a surprise wish from the person it is for', async () => {
    const db = await board(['visibility']);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что хочется'), 'Подарок Тёме');
    const seen = screen.getByRole('group', { name: 'Кто видит' });
    expect(within(seen).getByRole('button', { name: 'Вся семья' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(seen).queryByRole('button', { name: 'Дима' })).toBeNull();
    await userEvent.click(within(seen).getByRole('button', { name: 'Андрей' }));
    expect(screen.getByText('Не увидит: Тёма')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.wishes.toArray())[0]).toMatchObject({ visible_to: ['papa'] }));
    expect(await screen.findByText('видят: Андрей')).toBeInTheDocument();
  });

  it('keeps a thing to buy to oneself with «Только я»', async () => {
    const db = await board(['visibility'], 'needs');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что купить'), 'Торт');
    await userEvent.click(within(screen.getByRole('group', { name: 'Кто видит' })).getByRole('button', { name: 'Только я' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.needs.toArray())[0]).toMatchObject({ visible_to: [] }));
    expect(await screen.findByText(/только вы/)).toBeInTheDocument();
  });

  it('sends nothing about who sees it before the server keeps it', async () => {
    const db = await board([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что хочется'), 'Велосипед');
    expect(screen.queryByRole('group', { name: 'Кто видит' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.outbox.toArray()).some((o) => o.table === 'wishes' && !('visible_to' in o.row) && !('photo_path' in o.row))).toBe(true));
  });

  it('puts a photo on a wish and shows it on the board', async () => {
    setAvatarSigner(async (paths) => new Map(paths.map((p) => [p, `https://files.example/${p}`])));
    const db = await board(['photos']);
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Что хочется'), 'Самокат');
    await userEvent.upload(screen.getByLabelText('Добавить фото'), new File(['x'], 'scooter.jpg', { type: 'image/jpeg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.wishes.toArray())[0].photo_path).toMatch(/^h\/photos\/wishes\/[\w-]+\/1\.jpg$/));
    const card = (await screen.findByText('Самокат')).closest('article')!;
    await waitFor(() => expect(card.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/photos/wishes/')));
  });

  it('puts a photo on a goal', async () => {
    const db = await board(['photos'], 'goals');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Цель'), 'Море');
    await userEvent.type(screen.getByLabelText('Сколько нужно, ₽'), '120000');
    await userEvent.upload(screen.getByLabelText('Добавить фото'), new File(['x'], 'sea.jpg', { type: 'image/jpeg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.goals.toArray())[0].photo_path).toMatch(/^h\/photos\/goals\/[\w-]+\/1\.jpg$/));
  });

  it('keeps the parent who edits a child\u2019s wish among those who see it', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.meta.put({ key: 'features', value: ['visibility'] });
    await db.wishes.put({ id: 'w1', household_id: 'h', owner_id: 'son', title: 'Лего', price: null, saved: 0, done_at: null, created_by: 'son', visible_to: null, updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/board?tab=wishes']}><BoardPage me={mama} members={family} db={db} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Лего, открыть' }));
    await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const seen = screen.getByRole('group', { name: 'Кто видит' });
    expect(within(seen).queryByRole('button', { name: 'Тёма' })).toBeNull();
    await userEvent.click(within(seen).getByRole('button', { name: 'Только я и Тёма' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(async () => expect((await db.wishes.get('w1'))?.visible_to).toEqual(['mama']));
  });

  it('names the second piggy bank of the same thing and opens it from the form', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await db.wishes.put({ id: 'w1', household_id: 'h', owner_id: 'son', title: 'Велосипед', price: 25000, saved: 10500, done_at: null, created_by: 'son', updated_at: 'x', deleted_at: null });
    await db.goals.put({ id: 'g1', household_id: 'h', owner_id: 'son', title: 'Новый велосипед', target: 25000, saved: 8000, steps: [], created_by: 'son', updated_at: 'x', deleted_at: null });
    render(<MemoryRouter initialEntries={['/board?tab=wishes']}><BoardPage me={son} members={family} db={db} /></MemoryRouter>);
    expect(await screen.findByText(/отдельно в цели: 8\s000\s₽/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Цели' }));
    expect(await screen.findByText(/Отдельно в хотелке «Велосипед»: 10\s500\s₽/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await userEvent.type(await screen.findByLabelText('Цель'), 'Велосипед');
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(/Уже есть хотелка «Велосипед»: в копилке 10\s500\s₽ из 25\s000\s₽/);
    await userEvent.click(within(note).getByRole('button', { name: 'Открыть хотелку' }));
    expect(await screen.findByRole('dialog', { name: 'Велосипед' })).toBeInTheDocument();
  });
});

