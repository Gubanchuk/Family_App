// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000f1';
const SON = '00000000-0000-0000-0000-0000000000f2';
const STRANGER = '00000000-0000-0000-0000-0000000000f3';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const post = async (u: string, id: string, member: string) => asUser(db, u,
  "insert into public.stories (id, household_id, member_id, kind, path, width, height) values ($1, $2, $3, 'photo', $4, 1080, 1920)",
  [id, hh, member, `${hh}/stories/${id}.jpg`]);
const S1 = '00000000-0000-0000-0000-00000000aa01';
const S2 = '00000000-0000-0000-0000-00000000aa02';

describe('stories', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [code]);
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) m[r.name] = r.id;
  });

  it('shows a story to the family only, and only while it lives', async () => {
    await post(SON, S1, m['Тёма']);
    expect(await rows(PAPA, 'select id from public.stories')).toEqual([{ id: S1 }]);
    expect(await rows(STRANGER, 'select id from public.stories')).toEqual([]);
    await db.query("update public.stories set expires_at = now() - interval '1 minute'");
    expect(await rows(PAPA, 'select id from public.stories')).toEqual([]);
  });

  it('lets a person post only as themselves, into their family folder, without choosing the lifetime', async () => {
    await expect(post(SON, S1, m['Андрей'])).rejects.toThrow();
    await expect(asUser(db, SON, "insert into public.stories (household_id, member_id, kind, path, width, height) values ($1, $2, 'photo', 'elsewhere/x.jpg', 1, 1)", [hh, m['Тёма']])).rejects.toThrow();
    await expect(asUser(db, SON, "insert into public.stories (household_id, member_id, kind, path, width, height, expires_at) values ($1, $2, 'photo', $3, 1, 1, now() + interval '9 days')", [hh, m['Тёма'], `${hh}/stories/x.jpg`])).rejects.toThrow();
  });

  it('lets only the author change captions or delete, and never the file path', async () => {
    await post(SON, S1, m['Тёма']);
    await asUser(db, PAPA, `update public.stories set overlays = '[{"id":"a"}]'`);
    expect(await rows(SON, 'select overlays from public.stories')).toEqual([{ overlays: [] }]);
    await asUser(db, SON, `update public.stories set overlays = '[{"id":"a"}]'`);
    expect(await rows(SON, 'select overlays from public.stories')).toEqual([{ overlays: [{ id: 'a' }] }]);
    await expect(asUser(db, SON, "update public.stories set path = 'x'")).rejects.toThrow();
    await asUser(db, PAPA, 'delete from public.stories');
    expect((await rows(SON, 'select id from public.stories')).length).toBe(1);
    await asUser(db, SON, 'delete from public.stories');
    expect(await rows(SON, 'select id from public.stories')).toEqual([]);
  });

  it('records a view and one reaction per person, only for oneself', async () => {
    await post(SON, S1, m['Тёма']);
    const view = (u: string, member: string, reaction: string | null) => asUser(db, u,
      'insert into public.story_views (story_id, member_id, household_id, reaction) values ($1, $2, $3, $4) on conflict (story_id, member_id) do update set reaction = excluded.reaction',
      [S1, member, hh, reaction]);
    await view(PAPA, m['Андрей'], null);
    await view(PAPA, m['Андрей'], '❤️');
    await expect(view(PAPA, m['Тёма'], '😂')).rejects.toThrow();
    await expect(view(PAPA, m['Андрей'], '🤡')).rejects.toThrow();
    expect(await rows(SON, 'select member_id, reaction from public.story_views')).toEqual([{ member_id: m['Андрей'], reaction: '❤️' }]);
    expect(await rows(STRANGER, 'select * from public.story_views')).toEqual([]);
  });

  it("removes only expired stories of one's own family, and lets the family delete their files", async () => {
    // Both files are the son's, so Papa can remove one only because its story is gone.
    await post(SON, S1, m['Тёма']);
    await post(SON, S2, m['Тёма']);
    for (const [u, id] of [[SON, S1], [SON, S2]]) await asUser(db, u, "insert into storage.objects (bucket_id, name, owner_id) values ('family', $1, $2)", [`${hh}/stories/${id}.jpg`, u]);
    await db.query("update public.stories set expires_at = now() - interval '1 minute' where id = $1", [S1]);
    expect(await rows(STRANGER, 'select public.drop_expired_stories() as n')).toEqual([{ n: 0 }]);
    expect(await rows(PAPA, 'select public.drop_expired_stories() as n')).toEqual([{ n: 1 }]);
    await asUser(db, PAPA, 'delete from storage.objects');
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/${S2}.jpg` }]);
    await asUser(db, SON, 'delete from storage.objects');
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([]);
  });

  it('turns story pushes on for everyone by default', async () => {
    expect(await rows(PAPA, "select notify->>'stories' as s from public.member_settings where member_id = $1", [m['Тёма']])).toEqual([{ s: 'true' }]);
  });
});
