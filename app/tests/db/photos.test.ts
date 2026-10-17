// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000f1';
const MAMA = '00000000-0000-0000-0000-0000000000f2';
const SON = '00000000-0000-0000-0000-0000000000f3';
const STRANGER = '00000000-0000-0000-0000-0000000000f4';
const W = '00000000-0000-0000-0000-00000000f001';
const G = '00000000-0000-0000-0000-00000000f002';
let db: PGlite;
let hh: string;
let other: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const put = (u: string, name: string) => asUser(db, u, "insert into storage.objects (bucket_id, name, owner_id) values ('family', $1, $2)", [name, u]);
const setWishPhoto = (u: string, path: string | null) => asUser(db, u, 'update public.wishes set photo_path = $2 where id = $1', [W, path]);

describe('photos of recipes, wishes and goals', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Оля', '#E0457B', 'mother')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [await invite('child')]);
    other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB') as id"))[0].id;
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) m[r.name] = r.id;
    await asUser(db, SON, "insert into public.wishes (id, household_id, owner_id, title, created_by) values ($1, $2, $3, 'Велосипед', $3)", [W, hh, m['Тёма']]);
    await asUser(db, PAPA, "insert into public.goals (id, household_id, title, target, created_by) values ($1, $2, 'Море', 120000, $3)", [G, hh, m['Андрей']]);
  });

  it('lets anyone in the family put a photo into its photos folder, and nobody else', async () => {
    await put(SON, `${hh}/photos/wishes/${W}/1.jpg`);
    expect(await rows(MAMA, 'select name from storage.objects')).toEqual([{ name: `${hh}/photos/wishes/${W}/1.jpg` }]);
    await expect(put(STRANGER, `${hh}/photos/wishes/${W}/2.jpg`)).rejects.toThrow();
    await expect(put(SON, `${other}/photos/wishes/${W}/3.jpg`)).rejects.toThrow();
    expect(await rows(STRANGER, 'select name from storage.objects')).toEqual([]);
  });

  it('keeps a photo path inside the family folder', async () => {
    await setWishPhoto(SON, `${hh}/photos/wishes/${W}/1.jpg`);
    expect((await rows<{ p: string }>(MAMA, 'select photo_path as p from public.wishes'))[0].p).toBe(`${hh}/photos/wishes/${W}/1.jpg`);
    await expect(setWishPhoto(SON, `${other}/photos/wishes/${W}/1.jpg`)).rejects.toThrow();
    await expect(setWishPhoto(SON, `${hh}/avatars/${m['Тёма']}/1.jpg`)).rejects.toThrow();
    await expect(asUser(db, PAPA, 'update public.goals set photo_path = $2 where id = $1', [G, `${other}/photos/goals/${G}/1.jpg`])).rejects.toThrow();
    await asUser(db, PAPA, 'update public.goals set photo_path = $2 where id = $1', [G, `${hh}/photos/goals/${G}/1.jpg`]);
  });

  it('lets only who may change the record change its photo', async () => {
    // A child changes neither a family goal nor someone else's wish.
    await expect(asUser(db, SON, 'update public.goals set photo_path = $2 where id = $1', [G, `${hh}/photos/goals/${G}/1.jpg`])).rejects.toThrow();
    await asUser(db, MAMA, 'update public.wishes set photo_path = $2 where id = $1', [W, `${hh}/photos/wishes/${W}/2.jpg`]);
    expect((await rows<{ p: string }>(SON, 'select photo_path as p from public.wishes'))[0].p).toBe(`${hh}/photos/wishes/${W}/2.jpg`);
  });

  it('puts a photo only on a family recipe, never on the base', async () => {
    await asUser(db, MAMA, "insert into public.recipes (id, household_id, name, category, meals, time_active, time_total, servings, protein, dima_level, steps, photo_path) values ('own-p', $1, 'Сырники', 'breakfast', '{breakfast}', 20, 25, 4, 'dairy', 'ok', '{Смешать}', $2)", [hh, `${hh}/photos/recipes/own-p/1.jpg`]);
    expect(await rows(PAPA, "select photo_path as p from public.recipes where id = 'own-p'")).toEqual([{ p: `${hh}/photos/recipes/own-p/1.jpg` }]);
    await expect(asUser(db, MAMA, "update public.recipes set photo_path = $1 where id = 'own-p'", [`${other}/photos/recipes/own-p/1.jpg`])).rejects.toThrow();
    expect(await rows(STRANGER, "select photo_path from public.recipes where id = 'own-p'")).toEqual([]);
  });

  it('lets every member read photos of the base recipes and nobody add there', async () => {
    await db.query("insert into storage.objects (bucket_id, name) values ('family', 'base/br-syrniki.jpg')");
    expect(await rows(SON, "select name from storage.objects where name like 'base/%'")).toEqual([{ name: 'base/br-syrniki.jpg' }]);
    expect(await rows(STRANGER, "select name from storage.objects where name like 'base/%'")).toEqual([{ name: 'base/br-syrniki.jpg' }]);
    await expect(put(PAPA, 'base/br-omlet.jpg')).rejects.toThrow();
    expect(await rows(PAPA, "select photo_path as p from public.recipes where id = 'br-syrniki'")).toEqual([{ p: 'base/br-syrniki.jpg' }]);
    await expect(asUser(db, MAMA, "insert into public.recipes (id, household_id, name, category, meals, time_active, time_total, servings, protein, dima_level, steps, photo_path) values ('own-b', $1, 'Сырники', 'breakfast', '{breakfast}', 20, 25, 4, 'dairy', 'ok', '{Смешать}', 'base/br-syrniki.jpg')", [hh])).rejects.toThrow();
  });
});
