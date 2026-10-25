import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type Ingredient } from '../../data/db';
import type { Member } from '../family/useFamily';
import { buildCatalog } from './catalog';
import ProductPicker from './ProductPicker';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
const cheese: Ingredient = { item: 'сыр твёрдый', unit: 'г', dept: 'Молочное и яйца', grp: 'dairy', piece_weight: null, piece_name: null, pantry: false };
const vocab = new Map([[cheese.item, cheese]]);

async function open(check: Parameters<typeof ProductPicker>[0]['check']) {
  const db = createLocalDb(`t-${Math.random()}`);
  await db.meta.put({ key: 'features', value: ['tripList'] });
  const catalog = buildCatalog({ vocab, prices: new Map([[cheese.item, 0.8]]), items: [], marks: new Map() });
  render(<ProductPicker db={db} me={papa} vocab={vocab} catalog={catalog} inTrip onClose={() => {}} check={check} />);
  return { db, sheet: await screen.findByRole('dialog', { name: 'Добавить товар' }) };
}

describe('ProductPicker', () => {
  it('adds a dictionary product with one tap, then lets its amount be changed', async () => {
    const { db, sheet } = await open(async () => null);
    await userEvent.type(within(sheet).getByRole('textbox'), 'сыр');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Добавить: Сыр твёрдый' }));
    await waitFor(async () => expect(await db.shopping_items.count()).toBe(1));
    expect(within(sheet).getByRole('status')).toHaveTextContent('«Сыр твёрдый»');
    expect(within(sheet).getByRole('status')).toHaveTextContent('в походе');
    const before = (await db.shopping_items.toArray())[0].qty!;
    await userEvent.click(within(sheet).getByRole('button', { name: 'Изменить количество' }));
    await userEvent.click(within(sheet).getByRole('button', { name: /^Больше: Сыр твёрдый/ }));
    await userEvent.click(within(sheet).getByRole('button', { name: /^Сохранить/ }));
    await waitFor(async () => expect((await db.shopping_items.toArray())[0].qty).toBeGreaterThan(before));
    expect(await db.shopping_items.count()).toBe(1);
  });

  it('shows the assistant doubting a new product price, and nothing when it has no answer', async () => {
    const asked: Array<{ title: string; unit: string; price: number | null }> = [];
    const { sheet } = await open(async (p) => { asked.push(p); return { ok: false, note: 'Сыр обычно стоит 700–1000 ₽ за кг.' }; });
    await userEvent.type(within(sheet).getByRole('textbox'), 'Сыр Ламбер');
    await userEvent.click(within(sheet).getByRole('button', { name: /Новый товар «Сыр Ламбер»/ }));
    // Cheese guesses dairy, sold by the pack; it is bought by the kilo here. The details wait behind «Подробнее».
    await userEvent.click(within(sheet).getByRole('button', { name: /^Подробнее/ }));
    expect(within(sheet).getByRole('radio', { name: 'упаковка' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'кг' }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: /Цена за 1 кг/ }), '50');
    await userEvent.click(within(sheet).getByRole('button', { name: /^Добавить/ }));
    expect(await within(sheet).findByText(/Помощник сомневается: Сыр обычно стоит 700–1000 ₽ за кг/)).toBeInTheDocument();
    expect(asked).toEqual([{ title: 'Сыр Ламбер', unit: 'кг', price: 50, dept: 'Молочное и яйца' }]);
  });
});
