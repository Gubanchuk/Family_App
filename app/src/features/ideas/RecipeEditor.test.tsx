import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import RecipeEditor from './RecipeEditor';
import { saveRecipe } from './recipeApi';

vi.mock('./recipeApi', () => ({ saveRecipe: vi.fn(async () => 'own-1'), deleteRecipe: vi.fn(async () => {}) }));
vi.mock('../../lib/photos', () => ({
  photoPathFor: vi.fn(async (h: string, k: string, id: string, e: { kind: string }) => (e.kind === 'new' ? `${h}/photos/${k}/${id}/1.jpg` : e.kind === 'remove' ? null : undefined)),
  dropOldPhoto: vi.fn(async () => {}),
}));
const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };

async function vocab() {
  const db = createLocalDb(`t-${Math.random()}`);
  await db.ingredients.bulkPut([
    { item: 'творог', unit: 'г', dept: 'Молочное и яйца', grp: 'dairy', piece_weight: null, piece_name: null, pantry: false },
    { item: 'яйца', unit: 'шт', dept: 'Молочное и яйца', grp: 'egg', piece_weight: null, piece_name: null, pantry: false },
    { item: 'свёкла', unit: 'г', dept: 'Овощи и фрукты', grp: 'veg', piece_weight: null, piece_name: null, pantry: false },
  ]);
  return db;
}

describe('RecipeEditor', () => {
  it('builds a recipe from the vocabulary and saves it', async () => {
    const db = await vocab();
    const onClose = vi.fn();
    render(<RecipeEditor me={mama} db={db} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Мамины сырники');
    await userEvent.click(screen.getByRole('button', { name: 'Завтрак' }));
    await userEvent.type(screen.getByLabelText('Порций'), '4');
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'тво');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить: творог' }));
    await userEvent.type(screen.getByLabelText('Творог, г'), '500');
    await userEvent.type(screen.getByLabelText('Творог: пометка'), '9%');
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Шаг 1'), 'Смешать и обжарить');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(saveRecipe).toHaveBeenCalledWith('h', expect.objectContaining({ name: 'Мамины сырники', category: 'breakfast', servings: '4', rows: [expect.objectContaining({ item: 'творог', qty: '500', note: '9%' })], steps: ['Смешать и обжарить'] }), true);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the form and says so when there is no network', async () => {
    vi.mocked(saveRecipe).mockRejectedValueOnce(new Error('offline'));
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Омлет');
    await userEvent.click(screen.getByRole('button', { name: 'Завтрак' }));
    await userEvent.type(screen.getByLabelText('Порций'), '2');
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'яй');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить: яйца' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Яйца: по вкусу' }));
    await userEvent.type(screen.getByLabelText('Шаг 1'), 'Взбить');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет интернета. Рецепт сохранится, когда появится сеть');
  });
  it('keeps one recipe id when a failed save is tried again', async () => {
    vi.mocked(saveRecipe).mockClear();
    vi.mocked(saveRecipe).mockRejectedValueOnce(new Error('network'));
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Омлет');
    await userEvent.click(screen.getByRole('button', { name: 'Завтрак' }));
    await userEvent.type(screen.getByLabelText('Порций'), '2');
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'яй');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить: яйца' }));
    await userEvent.type(screen.getByLabelText('Яйца, шт'), '3');
    await userEvent.type(screen.getByLabelText('Шаг 1'), 'Взбить');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const [first, second] = vi.mocked(saveRecipe).mock.calls;
    expect(first[1].id).toMatch(/^own-/);
    expect(second[1].id).toBe(first[1].id);
    expect(first[2]).toBe(true);
  });

  it('finds a product typed without ё', async () => {
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'свекла');
    expect(await screen.findByRole('button', { name: 'Добавить: свёкла' })).toBeInTheDocument();
  });

  it('adds the first match on Enter in the product search instead of saving', async () => {
    vi.mocked(saveRecipe).mockClear();
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'тво');
    await screen.findByRole('button', { name: 'Добавить: творог' });
    await userEvent.type(screen.getByLabelText('Найти продукт'), '{Enter}');
    expect(screen.getByLabelText('Творог, г')).toBeInTheDocument();
    expect(saveRecipe).not.toHaveBeenCalled();
  });
  it('says under Save what is still missing', async () => {
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    expect(screen.getByText('Нужно: название, что это, порции, продукт, шаг')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Название'), 'Омлет');
    expect(screen.getByText('Нужно: что это, порции, продукт, шаг')).toBeInTheDocument();
  });

  it('asks before closing a recipe with something typed in it', async () => {
    const db = await vocab();
    const onClose = vi.fn();
    render(<RecipeEditor me={mama} db={db} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Омлет');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Остаться' }));
    expect(screen.getByLabelText('Название')).toHaveValue('Омлет');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('adds a photo to a new recipe once the server keeps photos', async () => {
    const db = await vocab();
    await db.meta.put({ key: 'features', value: ['photos'] });
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Пирог');
    await userEvent.click(screen.getByRole('button', { name: 'Десерт' }));
    await userEvent.type(screen.getByLabelText('Порций'), '6');
    await userEvent.type(screen.getByLabelText('Найти продукт'), 'тво');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить: творог' }));
    await userEvent.type(screen.getByLabelText('Творог, г'), '400');
    await userEvent.type(screen.getByLabelText('Шаг 1'), 'Испечь');
    await userEvent.upload(await screen.findByLabelText('Добавить фото'), new File(['x'], 'pie.jpg', { type: 'image/jpeg' }));
    expect(screen.getByRole('button', { name: 'Убрать фото' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(saveRecipe).toHaveBeenLastCalledWith('h', expect.objectContaining({ name: 'Пирог' }), true, { photo_path: expect.stringMatching(/^h\/photos\/recipes\/own-[\w-]+\/1\.jpg$/) });
  });

  it('removes the photo of a recipe being changed', async () => {
    const db = await vocab();
    await db.meta.put({ key: 'features', value: ['photos'] });
    const draft = { id: 'own-7', name: 'Пирог', about: '', category: 'dessert' as const, time: '40', servings: '6', dima: 'ok' as const, dimaNote: '', rows: [{ item: 'творог', qty: '400', toTaste: false, note: '' }], steps: ['Испечь'], source: '', photo: 'h/photos/recipes/own-7/1.jpg' };
    render(<RecipeEditor me={mama} db={db} draft={draft} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Убрать фото' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(saveRecipe).toHaveBeenLastCalledWith('h', expect.objectContaining({ id: 'own-7' }), false, { photo_path: null });
  });

  it('offers no photo before the server keeps photos', async () => {
    const db = await vocab();
    render(<RecipeEditor me={mama} db={db} onClose={vi.fn()} />);
    await screen.findByLabelText('Название');
    expect(screen.queryByLabelText('Добавить фото')).toBeNull();
  });

  it('asks before the phone Back button throws away a typed recipe', async () => {
    const db = await vocab();
    const onClose = vi.fn();
    render(<RecipeEditor me={mama} db={db} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Название'), 'Пирог');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('group', { name: 'Выйти без сохранения?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onClose).toHaveBeenCalled();
  });
});
