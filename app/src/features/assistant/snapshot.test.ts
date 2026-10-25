import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { buildSnapshot, snapshotHash } from './snapshot';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1, kin: 'father' };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false, kin: 'mother' };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false, kin: 'son' };
const dima: Member = { ...papa, id: 'm-dima', user_id: null, name: 'Дима', role: 'child', is_owner: false, portion: 0.5, kin: null };
const family = [papa, mama, son, dima];
// Tuesday of the week seeded by seedMenu.
const TUESDAY = new Date(2026, 9, 13, 14, 32);

async function seeded(): Promise<LocalDb> {
  const db = createLocalDb(`t-${Math.random()}`);
  await seedMenu(db, { currentWeek: true });
  await db.shopping_items.bulkPut([
    { id: 'u:1', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: 'молоко', title: 'Молоко', qty: null, unit: null, qty_text: '1 л', dept: 'Молочное и яйца', urgent: true, est_price: 89, added_by: 'm-mama', updated_at: 'x', deleted_at: null },
    { id: 'u:2', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Хлеб', qty: null, unit: null, qty_text: '', dept: 'Хлеб', urgent: false, est_price: null, added_by: 'm-papa', updated_at: 'x', deleted_at: null },
    { id: 'u:3', household_id: 'h1', week_id: null, offer_id: null, source: 'manual', item: null, title: 'Сок', qty: null, unit: null, qty_text: '', dept: 'Другое', urgent: false, est_price: 120, added_by: 'm-papa', updated_at: 'x', deleted_at: null },
  ]);
  // Bought: off the list.
  await db.shopping_marks.put({ item_id: 'u:3', household_id: 'h1', bought: true, by_member: 'm-papa', price_real: 120, updated_at: '2026-10-13T10:00:00Z' });
  await db.home_stock.bulkPut([
    { household_id: 'h1', key: 'яйца', item: 'яйца', title: 'Яйца', dept: 'Молочное и яйца', state: 'have', by_member: 'm-mama', updated_at: 'x', deleted_at: null },
    { household_id: 'h1', key: 't:кофе', item: null, title: 'Кофе', dept: 'Бакалея', state: 'out', by_member: 'm-mama', updated_at: 'x', deleted_at: null },
  ]);
  await db.not_eat.bulkPut([
    { household_id: 'h1', kind: 'item', ref: 'грибы', updated_at: 'x', deleted_at: null },
    { household_id: 'h1', kind: 'dish', ref: 'sp-ukha', updated_at: 'x', deleted_at: null },
  ]);
  await db.wishes.put({ id: 'w1', household_id: 'h1', owner_id: 'm-son', title: 'Велосипед', price: 15000, saved: 3000, done_at: null, created_by: 'm-son', updated_at: 'x', deleted_at: null });
  await db.goals.put({ id: 'g1', household_id: 'h1', owner_id: null, title: 'Отпуск', target: 100000, saved: 40000, steps: [{ id: 's1', t: 'Выбрать место', done: true }, { id: 's2', t: 'Купить билеты', done: false }], created_by: 'm-papa', updated_at: 'x', deleted_at: null });
  await db.requests.put({ id: 'r1', household_id: 'h1', from_id: 'm-mama', to_id: 'm-papa', title: 'Забрать посылку', due_on: '2026-10-13', urgent: true, status: 'open', done_at: null, updated_at: 'x', deleted_at: null });
  await db.payments.put({ id: 'p1', household_id: 'h1', title: 'Ипотека', amount: 25000, day: 20, kind: 'monthly', total: null, first_month: null, note: '', created_by: 'm-papa', updated_at: 'x', deleted_at: null });
  await db.money_entries.put({ id: 'e1', household_id: 'h1', kind: 'expense', amount: 2700, category: 'Кафе и доставка', member_id: 'm-papa', on_date: '2026-10-05', note: 'Пицца', created_by: 'm-papa', updated_at: 'x', deleted_at: null });
  await db.budgets.put({ household_id: 'h1', category: 'Кафе и доставка', amount: 5000, updated_at: 'x', deleted_at: null });
  return db;
}

describe('family snapshot', () => {
  it('gives a parent the family, the day, the menu, the list, home, the board and money', async () => {
    const db = await seeded();
    const s = await buildSnapshot(db, papa, family, TUESDAY, 'shop');
    expect(s.startsWith('<снимок_семьи>')).toBe(true);
    expect(s.trimEnd().endsWith('</снимок_семьи>')).toBe(true);
    expect(s).toContain('Спрашивает: Папа');
    expect(s).toMatch(/Мама — мама, родитель/);
    expect(s).toMatch(/Дима — ребёнок, без своего входа, полпорции/);
    expect(s).toContain('вторник, 13 октября 2026');
    expect(s).toContain('Экран: Покупки');
    expect(s).toContain('Сырники');
    expect(s).toMatch(/Котлеты \+ гречка/);
    expect(s).toMatch(/Молоко 1 л · ~89 ₽ · Мама · срочно/);
    expect(s).toContain('Хлеб');
    expect(s).not.toContain('Сок');
    expect(s).toMatch(/Дома есть: Яйца/);
    expect(s).toMatch(/закончилось: Кофе/);
    expect(s).toMatch(/Велосипед \(Сын\) — 15 000 ₽, в копилке 3 000 ₽/);
    expect(s).toMatch(/Отпуск .*40 000 из 100 000 ₽/);
    expect(s).toMatch(/Мама → Папа: «Забрать посылку» — ждёт ответа · сегодня · срочно/);
    expect(s).toMatch(/Не едим: грибы; блюда: Уха/);
    expect(s).toContain('Деньги');
    expect(s).toMatch(/Кафе и доставка 2 700 ₽ из бюджета 5 000 ₽/);
    expect(s).toMatch(/Ипотека 25 000 ₽ — 20 октября/);
    expect(s).toMatch(/Категории расходов: Продукты, Дети/);
  });

  it('gives a child no money, even when the phone has some', async () => {
    const db = await seeded();
    const s = await buildSnapshot(db, son, family, TUESDAY, 'home');
    expect(s).toContain('Спрашивает: Сын (сын, ребёнок)');
    expect(s).not.toContain('Деньги');
    expect(s).not.toContain('Ипотека');
    expect(s).not.toContain('Категории расходов');
    expect(s).toContain('Велосипед');
  });

  it('leaves out sections that have nothing in them', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    const s = await buildSnapshot(db, papa, family, TUESDAY);
    expect(s).toContain('Меню этой недели: не составлено');
    for (const head of ['Доска', 'Хотелки', 'Цели', 'Просьбы', 'Дома', 'Список покупок', 'Не едим', 'Предложенные блюда', 'Экран']) expect(s).not.toContain(head);
    // A parent still gets the categories to file an expense under.
    expect(s).toContain('Категории расходов');
    expect(s.length).toBeLessThan(1200);
  });

  it('changes its hash with the data, not with the minutes', async () => {
    const db = await seeded();
    const a = await buildSnapshot(db, papa, family, TUESDAY, 'shop');
    const b = await buildSnapshot(db, papa, family, new Date(2026, 9, 13, 14, 58), 'shop');
    expect(a).not.toBe(b);
    expect(snapshotHash(a)).toBe(snapshotHash(b));
    await db.home_stock.put({ household_id: 'h1', key: 'молоко', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', state: 'have', by_member: 'm-mama', updated_at: 'x', deleted_at: null });
    expect(snapshotHash(await buildSnapshot(db, papa, family, TUESDAY, 'shop'))).not.toBe(snapshotHash(a));
    expect(snapshotHash(await buildSnapshot(db, papa, family, new Date(2026, 9, 13, 15, 2), 'shop'))).not.toBe(snapshotHash(a));
  });
});
