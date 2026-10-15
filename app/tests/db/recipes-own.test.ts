// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const MAMA = '00000000-0000-0000-0000-0000000000a5';
const STRANGER = '00000000-0000-0000-0000-0000000000a6';
let db: PGlite;
let hh: string;
const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const recipe = (u: string, h: string, id = 'own-1') => asUser(db, u,
  "insert into public.recipes (id, household_id, name, category, meals, time_active, time_total, servings, protein, dima_level, steps) values ($1, $2, 'Мамины сырники', 'breakfast', '{breakfast}', 20, 25, 4, 'dairy', 'ok', '{Смешать,Обжарить}') on conflict (id) do update set name = excluded.name",
  [id, h]);

describe('own recipes', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [MAMA, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(MAMA, "select public.create_household('Губанчуки', 'Оля', '#E0457B', 'mother') as id"))[0].id;
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
  });

  it('lets a family write its own recipes and their products, and keeps them from other families', async () => {
    await recipe(MAMA, hh);
    await asUser(db, MAMA, "insert into public.recipe_ingredients (recipe_id, pos, item, qty) values ('own-1', 0, (select item from public.ingredients limit 1), 300)");
    await asUser(db, MAMA, "delete from public.recipe_ingredients where recipe_id = 'own-1'");
    expect(await rows(MAMA, "select * from public.recipe_ingredients where recipe_id = 'own-1'")).toEqual([]);
    expect(await rows(STRANGER, "select id from public.recipes where id = 'own-1'")).toEqual([]);
    await expect(recipe(STRANGER, hh, 'own-2')).rejects.toThrow();
  });

  it('never lets a family change a base recipe', async () => {
    const [{ id }] = await rows<{ id: string }>(MAMA, 'select id from public.recipes where household_id is null limit 1');
    await asUser(db, MAMA, "update public.recipes set name = 'Испорчено' where id = $1", [id]);
    expect((await rows<{ name: string }>(MAMA, 'select name from public.recipes where id = $1', [id]))[0].name).not.toBe('Испорчено');
  });
});
