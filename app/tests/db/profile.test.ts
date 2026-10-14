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
    expect(info.members).toEqual([{ name: 'Папа', color: '#2F6FDB' }, { name: 'Сын', color: '#1FA463' }]);
  });

  it('says why a code leads nowhere', async () => {
    await expect(rows(null, "select public.invite_info('NOSUCHCODE')")).rejects.toThrow(/invite_not_found/);
    const code = await invite('child');
    await asUser(db, GUEST, "select public.accept_invite($1, 'Гость', '#E0457B')", [code]);
    await expect(rows(null, 'select public.invite_info($1)', [code])).rejects.toThrow(/invite_used/);
  });
});
