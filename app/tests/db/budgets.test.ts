// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000a1';
const SON = '00000000-0000-0000-0000-0000000000a3';
const STRANGER = '00000000-0000-0000-0000-0000000000a4';
let db: PGlite;
let hh: string;
let other: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const budget = (u: string, household: string, category: string, amount: number) => asUser(db, u,
  'insert into public.budgets (household_id, category, amount) values ($1, $2, $3) on conflict (household_id, category) do update set amount = excluded.amount',
  [household, category, amount]);

describe('budgets', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [code]);
    other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB') as id"))[0].id;
  });

  it('lets parents set a monthly budget per category and keeps it from children and other families', async () => {
    await budget(PAPA, hh, 'Продукты', 40000);
    await budget(PAPA, hh, 'Продукты', 45000);
    expect(await rows(PAPA, 'select category, amount from public.budgets')).toEqual([{ category: 'Продукты', amount: 45000 }]);
    expect(await rows(SON, 'select * from public.budgets')).toEqual([]);
    await expect(budget(SON, hh, 'Кафе и доставка', 1)).rejects.toThrow();
    await expect(budget(STRANGER, hh, 'Дом', 1000)).rejects.toThrow();
    expect(await rows(STRANGER, 'select * from public.budgets')).toEqual([]);
    await budget(STRANGER, other, 'Дом', 1000);
  });

  it('refuses an empty or absurd budget', async () => {
    await expect(budget(PAPA, hh, 'Дом', 0)).rejects.toThrow();
    await expect(budget(PAPA, hh, 'Дом', 20_000_000)).rejects.toThrow();
  });
});
