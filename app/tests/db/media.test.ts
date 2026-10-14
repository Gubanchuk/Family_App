// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000e1';
const MAMA = '00000000-0000-0000-0000-0000000000e2';
const SON = '00000000-0000-0000-0000-0000000000e3';
const STRANGER = '00000000-0000-0000-0000-0000000000e4';
let db: PGlite;
let hh: string;
let other: string;
const ids: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const put = (u: string, name: string) => asUser(db, u, "insert into storage.objects (bucket_id, name, owner_id) values ('family', $1, $2)", [name, u]);

describe('family media bucket', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Оля', '#E0457B', 'mother')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [await invite('child')]);
    await asUser(db, PAPA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5)", [hh]);
    other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB') as id"))[0].id;
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) ids[r.name] = r.id;
  });

  it('lets the family post into its own folder and read it, and keeps other families out', async () => {
    await put(SON, `${hh}/stories/a.jpg`);
    expect(await rows(MAMA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/a.jpg` }]);
    expect(await rows(STRANGER, 'select name from storage.objects')).toEqual([]);
    await expect(put(STRANGER, `${hh}/stories/b.jpg`)).rejects.toThrow();
    await expect(put(SON, `${other}/stories/c.jpg`)).rejects.toThrow();
  });

  it("lets a person put only their own avatar, and a parent anyone's in the family", async () => {
    await put(SON, `${hh}/avatars/${ids['Тёма']}/1.jpg`);
    await expect(put(SON, `${hh}/avatars/${ids['Оля']}/1.jpg`)).rejects.toThrow();
    await put(MAMA, `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await expect(put(SON, `${hh}/other/1.jpg`)).rejects.toThrow();
  });

  it('lets the owner of a file or a parent (for avatars) delete it', async () => {
    await put(MAMA, `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await put(MAMA, `${hh}/stories/m.jpg`);
    // A child cannot remove someone else's avatar. (A story file with no story behind it is fair game
    // for the family, see the stories tests, so this check stays on avatars.)
    await asUser(db, SON, "delete from storage.objects where name like '%/avatars/%'");
    expect((await rows(PAPA, 'select name from storage.objects order by name')).length).toBe(2);
    await asUser(db, PAPA, "delete from storage.objects where name like '%/avatars/%'");
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/m.jpg` }]);
    await asUser(db, MAMA, 'delete from storage.objects');
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([]);
  });

  it('sets an avatar path for oneself or, as a parent, for others but the owner, and returns the old one', async () => {
    const set = (u: string, m: string, p: string | null) => rows<{ old: string | null }>(u, 'select public.set_avatar($1, $2) as old', [m, p]);
    expect(await set(SON, ids['Тёма'], `${hh}/avatars/${ids['Тёма']}/1.jpg`)).toEqual([{ old: null }]);
    expect(await set(SON, ids['Тёма'], `${hh}/avatars/${ids['Тёма']}/2.jpg`)).toEqual([{ old: `${hh}/avatars/${ids['Тёма']}/1.jpg` }]);
    await expect(set(SON, ids['Оля'], `${hh}/avatars/${ids['Оля']}/1.jpg`)).rejects.toThrow(/not_allowed/);
    await expect(set(SON, ids['Тёма'], `${hh}/avatars/${ids['Оля']}/3.jpg`)).rejects.toThrow(/bad_path/);
    await set(MAMA, ids['Дима'], `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await expect(set(MAMA, ids['Андрей'], `${hh}/avatars/${ids['Андрей']}/1.jpg`)).rejects.toThrow(/not_allowed/);
    expect(await set(SON, ids['Тёма'], null)).toEqual([{ old: `${hh}/avatars/${ids['Тёма']}/2.jpg` }]);
    expect(await rows(PAPA, 'select avatar_path from public.members where id = $1', [ids['Тёма']])).toEqual([{ avatar_path: null }]);
  });
});
