// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000b1';
const MAMA = '00000000-0000-0000-0000-0000000000b2';
const SON = '00000000-0000-0000-0000-0000000000b3';
const STRANGER = '00000000-0000-0000-0000-0000000000b4';
const HELPER = '00000000-0000-0000-0000-0000000000b5';
let db: PGlite;
let hh: string;
let papaId: string;
let sonId: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const invite = async (u: string, h: string, role: string, member: string | null = null) =>
  (await rows<{ c: string }>(u, 'select public.create_invite($1, $2::public.member_role, $3) as c', [h, role, member]))[0].c;
const accept = (u: string, code: string, name: string) => asUser(db, u, "select public.accept_invite($1, $2, '#1FA463') as id", [code, name]);
const papaRow = async () => (await db.query<{ role: string; is_owner: boolean; user_id: string | null; deleted_at: string | null }>(
  'select role, is_owner, user_id, deleted_at from public.members where id = $1', [papaId])).rows[0];

describe('family guard', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER, HELPER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    await accept(MAMA, await invite(PAPA, hh, 'parent'), 'Мама');
    await accept(SON, await invite(PAPA, hh, 'child'), 'Сын');
    sonId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [SON]))[0].id;
  });

  it('keeps the owner safe from a second parent', async () => {
    await expect(asUser(db, MAMA, "update public.members set role = 'child' where id = $1", [papaId])).rejects.toThrow();
    await expect(asUser(db, MAMA, 'update public.members set is_owner = false where id = $1', [papaId])).rejects.toThrow();
    await expect(asUser(db, MAMA, 'update public.members set user_id = null where id = $1', [papaId])).rejects.toThrow();
    await asUser(db, MAMA, 'update public.members set deleted_at = now() where id = $1', [papaId]);
    expect(await papaRow()).toEqual({ role: 'parent', is_owner: true, user_id: PAPA, deleted_at: null });
  });

  it('does not let a parent attach someone else\'s login to a profile', async () => {
    await expect(asUser(db, MAMA, "insert into public.members (household_id, user_id, name, color, role) values ($1, $2, 'Кто-то', '#000000', 'child')", [hh, HELPER])).rejects.toThrow();
    await expect(asUser(db, MAMA, "insert into public.members (household_id, name, color, role) values ($1, 'Ещё родитель', '#000000', 'parent')", [hh])).rejects.toThrow();
  });

  it('still lets parents add a toddler and rename members', async () => {
    await asUser(db, MAMA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5)", [hh]);
    await asUser(db, MAMA, "update public.members set name = 'Сынок' where id = $1", [sonId]);
    expect((await rows<{ name: string }>(PAPA, 'select name from public.members where id = $1', [sonId]))[0].name).toBe('Сынок');
    expect(await rows(PAPA, "select 1 from public.members where name = 'Дима'")).toHaveLength(1);
  });

  it('lets only the owner change roles', async () => {
    await expect(asUser(db, MAMA, "select public.set_member_role($1, 'parent')", [sonId])).rejects.toThrow(/not_owner/);
    await asUser(db, PAPA, "select public.set_member_role($1, 'parent')", [sonId]);
    expect((await rows<{ role: string }>(PAPA, 'select role from public.members where id = $1', [sonId]))[0].role).toBe('parent');
    await expect(asUser(db, PAPA, "select public.set_member_role($1, 'child')", [papaId])).rejects.toThrow(/not_owner|owner_stays_parent/);
  });

  it('lets only the owner invite another parent', async () => {
    await expect(invite(MAMA, hh, 'parent')).rejects.toThrow(/not_owner/);
    expect(await invite(MAMA, hh, 'child')).toMatch(/^[A-Z2-9]{10}$/);
  });

  it('refuses an invite aimed at a profile in another family', async () => {
    const other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Кто-то', '#000000') as id"))[0].id;
    await expect(invite(STRANGER, other, 'parent', papaId)).rejects.toThrow(/member_not_found/);
    expect((await papaRow()).user_id).toBe(PAPA);
  });

  it('refuses an invite aimed at a profile that already has a login', async () => {
    await expect(invite(PAPA, hh, 'child', sonId)).rejects.toThrow(/member_not_found/);
  });

  it('does not hand over a profile that got a login after the invite was made', async () => {
    const dima = (await rows<{ id: string }>(PAPA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5) returning id", [hh]))[0].id;
    const code = await invite(PAPA, hh, 'child', dima);
    await db.query('update public.members set user_id = $2 where id = $1', [dima, HELPER]);
    await expect(accept(STRANGER, code, 'Кто-то')).rejects.toThrow(/member_not_found/);
    expect((await db.query<{ user_id: string }>('select user_id from public.members where id = $1', [dima])).rows[0].user_id).toBe(HELPER);
  });

  it('lets an account that used an invite be deleted', async () => {
    await db.query('delete from auth.users where id = $1', [SON]);
    expect((await db.query('select 1 from auth.users where id = $1', [SON])).rows).toHaveLength(0);
  });
});
