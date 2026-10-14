// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-00000000000a';
const SON = '00000000-0000-0000-0000-00000000000b';
const STRANGER = '00000000-0000-0000-0000-00000000000c';
let db: PGlite;
let household: string;

async function rows<T>(user: string | null, sql: string, params: unknown[] = []) {
  return (await asUser(db, user, sql, params)).rows as T[];
}

describe('family', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    household = (await rows<{ id: string }>(PAPA, "select public.create_household('Наша семья', 'Папа', '#2F6FDB') as id"))[0].id;
  });

  it('makes the creator the owner and a parent', async () => {
    const m = await rows<{ role: string; is_owner: boolean }>(PAPA, 'select role, is_owner from public.members where user_id = $1', [PAPA]);
    expect(m).toEqual([{ role: 'parent', is_owner: true }]);
  });

  it('refuses a second family for the same person', async () => {
    await expect(asUser(db, PAPA, "select public.create_household('Ещё', 'Папа', '#000000')")).rejects.toThrow(/already_in_family/);
  });

  it('lets a child join by invite exactly once', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    expect(code).toMatch(/^[A-Z2-9]{10}$/);
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    const me = await rows<{ role: string }>(SON, 'select role from public.members where user_id = $1', [SON]);
    expect(me).toEqual([{ role: 'child' }]);
    await expect(asUser(db, STRANGER, "select public.accept_invite($1, 'Кто-то', '#000000')", [code])).rejects.toThrow(/invite_used/);
  });

  it('rejects an expired invite', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    await db.query("update public.invites set expires_at = now() - interval '1 minute' where code = $1", [code]);
    await expect(asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code])).rejects.toThrow(/invite_expired/);
  });

  it('rejects an invite for someone already in a family', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'parent') as c", [household]))[0].c;
    await expect(asUser(db, PAPA, "select public.accept_invite($1, 'Папа', '#2F6FDB')", [code])).rejects.toThrow(/already_in_family/);
  });

  it('links an invite to an existing profile instead of creating a second one', async () => {
    const son = (await rows<{ id: string }>(PAPA, "insert into public.members (household_id, name, color, role) values ($1, 'Сын', '#1FA463', 'child') returning id", [household]))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child', $2) as c", [household, son]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    const all = await rows<{ id: string; user_id: string }>(PAPA, 'select id, user_id from public.members where name = $1', ['Сын']);
    expect(all).toEqual([{ id: son, user_id: SON }]);
  });

  it('keeps a family invisible to strangers', async () => {
    expect(await rows(STRANGER, 'select * from public.households')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.members')).toEqual([]);
  });

  it('does not let a child change roles', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [code]);
    await expect(asUser(db, SON, "update public.members set role = 'parent' where user_id = $1", [SON])).rejects.toThrow(/permission denied/);
    const me = await rows<{ role: string }>(PAPA, 'select role from public.members where user_id = $1', [SON]);
    expect(me).toEqual([{ role: 'child' }]);
    await expect(asUser(db, SON, "select public.create_invite($1, 'parent')", [household])).rejects.toThrow(/not_a_parent/);
  });

  it('lets a parent add a profile without sign-in for the toddler', async () => {
    await asUser(db, PAPA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5)", [household]);
    const dima = await rows<{ user_id: string | null; portion: string }>(PAPA, "select user_id, portion from public.members where name = 'Дима'");
    expect(dima).toEqual([{ user_id: null, portion: '0.50' }]);
  });

  it('lets each member change only their own settings', async () => {
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [household]))[0].c;
    const sonId = (await rows<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code]))[0].id;
    await asUser(db, SON, "update public.member_settings set theme = 'dark' where member_id = $1", [sonId]);
    const papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    await asUser(db, SON, "update public.member_settings set theme = 'dark' where member_id = $1", [papaId]);
    const themes = await rows<{ theme: string }>(PAPA, 'select theme from public.member_settings order by member_id = $1', [papaId]);
    expect(themes.map((t) => t.theme)).toEqual(['dark', 'auto']);
  });
});
