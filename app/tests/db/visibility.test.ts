// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000d1';
const MAMA = '00000000-0000-0000-0000-0000000000d2';
const SON = '00000000-0000-0000-0000-0000000000d3';
const STRANGER = '00000000-0000-0000-0000-0000000000d4';
const W = '00000000-0000-0000-0000-00000000d001';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const titles = async (u: string, table: string) => (await rows<{ title: string }>(u, `select title from public.${table} order by title`)).map((r) => r.title);
const hiddenWish = () => asUser(db, MAMA,
  'insert into public.wishes (id, household_id, owner_id, title, created_by, visible_to) values ($1, $2, $3, $4, $3, $5)',
  [W, hh, m['Оля'], 'Подарок Тёме', [m['Андрей']]]);

describe('who sees a wish or a thing to buy', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Оля', '#E0457B', 'mother')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [await invite('child')]);
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) m[r.name] = r.id;
  });

  it('shows a surprise only to the people chosen and its author', async () => {
    await hiddenWish();
    await asUser(db, MAMA, "insert into public.needs (household_id, title, created_by, visible_to) values ($1, 'Торт на день рождения', $2, '{}')", [hh, m['Оля']]);
    await asUser(db, MAMA, "insert into public.needs (household_id, title, created_by) values ($1, 'Батарейки', $2)", [hh, m['Оля']]);
    expect(await titles(PAPA, 'wishes')).toEqual(['Подарок Тёме']);
    expect(await titles(SON, 'wishes')).toEqual([]);
    expect(await titles(MAMA, 'needs')).toEqual(['Батарейки', 'Торт на день рождения']);
    expect(await titles(PAPA, 'needs')).toEqual(['Батарейки']);
    expect(await titles(SON, 'needs')).toEqual(['Батарейки']);
  });

  it('hides what hangs on a hidden wish, and does not let the hidden one change it', async () => {
    await hiddenWish();
    await asUser(db, PAPA, 'insert into public.wish_metoo (wish_id, member_id, household_id) values ($1, $2, $3)', [W, m['Андрей'], hh]);
    await asUser(db, PAPA, 'insert into public.deposits (household_id, wish_id, member_id, amount) values ($1, $2, $3, 500)', [hh, W, m['Андрей']]);
    expect((await rows(SON, 'select * from public.wish_metoo')).length).toBe(0);
    expect((await rows(SON, 'select * from public.deposits')).length).toBe(0);
    expect((await rows(MAMA, 'select * from public.deposits')).length).toBe(1);
    await asUser(db, SON, "update public.wishes set title = 'Испорчено' where id = $1", [W]);
    await expect(asUser(db, SON,
      "insert into public.wishes (id, household_id, owner_id, title, created_by) values ($1, $2, $3, 'Испорчено', $3) on conflict (id) do update set title = excluded.title",
      [W, hh, m['Тёма']])).rejects.toThrow();
    expect(await titles(MAMA, 'wishes')).toEqual(['Подарок Тёме']);
  });

  it('names only members of the family', async () => {
    const [{ id: stranger }] = await rows<{ id: string }>(STRANGER, 'select id from public.members');
    await expect(asUser(db, MAMA, "insert into public.needs (household_id, title, created_by, visible_to) values ($1, 'Торт', $2, $3)", [hh, m['Оля'], [stranger]])).rejects.toThrow(/wrong_household/);
  });
});
