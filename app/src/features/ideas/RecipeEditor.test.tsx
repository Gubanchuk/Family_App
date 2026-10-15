import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import RecipeEditor from './RecipeEditor';
import { saveRecipe } from './recipeApi';

vi.mock('./recipeApi', () => ({ saveRecipe: vi.fn(async () => 'own-1'), deleteRecipe: vi.fn(async () => {}) }));
const mama: Member = { id: 'mama', household_id: 'h', user_id: 'u', name: 'Оля', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };

async function vocab() {
  const db = createLocalDb(`t-${Math.random()}`);
  await db.ingredients.bulkPut([
    { item: 'творог', unit: 'г', dept: 'Молочное и яйца', grp: 'dairy', piece_weight: null, piece_name: null, pantry: false },
    { item: 'яйца', unit: 'шт', dept: 'Молочное и яйца', grp: 'egg', piece_weight: null, piece_name: null, pantry: false },
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
    expect(saveRecipe).toHaveBeenCalledWith('h', expect.objectContaining({ name: 'Мамины сырники', category: 'breakfast', servings: '4', rows: [expect.objectContaining({ item: 'творог', qty: '500', note: '9%' })], steps: ['Смешать и обжарить'] }));
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
});
