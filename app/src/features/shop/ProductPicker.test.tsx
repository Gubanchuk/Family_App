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
  it('adds a dictionary product with its amount and price', async () => {
    const { db, sheet } = await open(async () => null);
    await userEvent.type(within(sheet).getByRole('textbox'), 'сыр');
    await userEvent.click(within(sheet).getByRole('button', { name: /Сыр твёрдый/ }));
    expect(within(sheet).getAllByText(/≈/).length).toBeGreaterThan(0);
    await userEvent.click(within(sheet).getByRole('button', { name: /^Добавить/ }));
    await waitFor(async () => expect(await db.shopping_items.count()).toBe(1));
    expect(within(sheet).getByRole('status')).toHaveTextContent('«Сыр твёрдый» в походе');
  });

  it('shows the assistant doubting a new product price, and nothing when it has no answer', async () => {
    const asked: Array<{ title: string; unit: string; price: number | null }> = [];
    const { sheet } = await open(async (p) => { asked.push(p); return { ok: false, note: 'Сыр обычно стоит 700–1000 ₽ за кг.' }; });
    await userEvent.type(within(sheet).getByRole('textbox'), 'Сыр Ламбер');
    await userEvent.click(within(sheet).getByRole('button', { name: /Новый товар «Сыр Ламбер»/ }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: /Цена за 1 кг/ }), '50');
    await userEvent.click(within(sheet).getByRole('button', { name: /^Добавить/ }));
    expect(await within(sheet).findByText(/Помощник сомневается: Сыр обычно стоит 700–1000 ₽ за кг/)).toBeInTheDocument();
    expect(asked).toEqual([{ title: 'Сыр Ламбер', unit: 'кг', price: 50, dept: 'Молочное и яйца' }]);
  });
});
