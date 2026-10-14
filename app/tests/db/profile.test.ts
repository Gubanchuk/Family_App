// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000c1';
const SON = '00000000-0000-0000-0000-0000000000c2';
const GUEST = '00000000-0000-0000-0000-0000000000c3';
let db: PGlite;
let hh: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;

describe('own profile and invite preview', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, GUEST]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Папа', '#2F6FDB') as id"))[0].id;
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [await invite('child')]);
  });

  it('lets a child fix their own name and colour, and nobody else\'s', async () => {
    await asUser(db, SON, "select public.update_my_profile('  Тёма ', '#F2A900')");
    expect(await rows(PAPA, 'select name, color from public.members where user_id = $1', [SON])).toEqual([{ name: 'Тёма', color: '#F2A900' }]);
    expect(await rows(PAPA, 'select name from public.members where user_id = $1', [PAPA])).toEqual([{ name: 'Папа' }]);
    await expect(asUser(db, SON, "select public.update_my_profile('', '#F2A900')")).rejects.toThrow();
    await expect(asUser(db, GUEST, "select public.update_my_profile('Кто-то', '#000000')")).rejects.toThrow(/member_not_found/);
  });

  it('tells anyone holding a live code whose family it is, the role and the colours taken', async () => {
    const code = await invite('parent');
    const [{ info }] = await rows<{ info: { family: string; role: string; members: Array<{ name: string; color: string }> } }>(null, 'select public.invite_info($1) as info', [code.toLowerCase()]);
    expect(info.family).toBe('Губанчуки');
    expect(info.role).toBe('parent');
    expect(info.members).toEqual([{ name: 'Папа', color: '#2F6FDB', kin: null }, { name: 'Сын', color: '#1FA463', kin: null }]);
  });

  it('keeps who each person is in the family, set by the person or by a parent', async () => {
    const kin = async (u: string) => (await rows<{ kin: string | null }>(PAPA, 'select kin from public.members where user_id = $1', [u]))[0].kin;
    await asUser(db, SON, "select public.update_my_profile('Тёма', '#1FA463', 'son')");
    expect(await kin(SON)).toBe('son');
    // An app that does not know about kin leaves it alone.
    await asUser(db, SON, "select public.update_my_profile('Тёма', '#F2A900')");
    expect(await kin(SON)).toBe('son');
    await expect(asUser(db, SON, "select public.update_my_profile('Тёма', '#1FA463', 'uncle')")).rejects.toThrow();

    // A parent sets it for the others; a child cannot set it for a parent.
    await asUser(db, PAPA, "update public.members set kin = 'daughter' where user_id = $1", [SON]);
    expect(await kin(SON)).toBe('daughter');
    await asUser(db, SON, "update public.members set kin = 'grandfather' where user_id = $1", [PAPA]);
    expect(await kin(PAPA)).toBeNull();

    const code = await invite('parent');
    await asUser(db, GUEST, "select public.accept_invite($1, 'Аня', '#E0457B', 'mother')", [code]);
    expect(await kin(GUEST)).toBe('mother');
    const [{ info }] = await rows<{ info: { members: Array<{ name: string; kin: string | null }> } }>(null, 'select public.invite_info($1) as info', [await invite('child')]);
    expect(info.members.map((m) => `${m.name}:${m.kin}`)).toEqual(['Папа:null', 'Тёма:daughter', 'Аня:mother']);
  });

  it('records the founder as mum or dad when the family is created', async () => {
    const MAMA = '00000000-0000-0000-0000-0000000000c4';
    await addUser(db, MAMA);
    await asUser(db, MAMA, "select public.create_household('Ивановы', 'Оля', '#E0457B', 'mother')");
    expect(await rows(MAMA, 'select name, kin, role, is_owner from public.members where user_id = $1', [MAMA])).toEqual([{ name: 'Оля', kin: 'mother', role: 'parent', is_owner: true }]);
  });

  it('keeps a toddler profile\'s kin when the grown-up child logs into it', async () => {
    await asUser(db, PAPA, "insert into public.members (household_id, name, color, role, portion, kin) values ($1, 'Дима', '#F2A900', 'child', 0.5, 'son')", [hh]);
    const [{ id }] = await rows<{ id: string }>(PAPA, "select id from public.members where name = 'Дима'");
    const [{ c }] = await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child', $2) as c", [hh, id]);
    await asUser(db, GUEST, "select public.accept_invite($1, '', '#000000')", [c]);
    expect(await rows(PAPA, 'select user_id, kin from public.members where id = $1', [id])).toEqual([{ user_id: GUEST, kin: 'son' }]);
  });

  it('says why a code leads nowhere', async () => {
    await expect(rows(null, "select public.invite_info('NOSUCHCODE')")).rejects.toThrow(/invite_not_found/);
    const code = await invite('child');
    await asUser(db, GUEST, "select public.accept_invite($1, 'Гость', '#E0457B')", [code]);
    await expect(rows(null, 'select public.invite_info($1)', [code])).rejects.toThrow(/invite_used/);
  });
});
