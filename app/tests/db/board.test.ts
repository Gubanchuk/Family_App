// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000b1';
const MAMA = '00000000-0000-0000-0000-0000000000b2';
const SON = '00000000-0000-0000-0000-0000000000b3';
const STRANGER = '00000000-0000-0000-0000-0000000000b4';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};
const W = '00000000-0000-0000-0000-00000000c001';
const G = '00000000-0000-0000-0000-00000000c002';
const R = '00000000-0000-0000-0000-00000000c003';

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
// The phone sends every change as an upsert; these helpers do the same.
const upsertWish = (u: string, owner: string, by: string, title = 'Велосипед', saved = 0) => asUser(db, u,
  'insert into public.wishes (id, household_id, owner_id, title, price, saved, created_by) values ($1, $2, $3, $4, 25000, $5, $6) on conflict (id) do update set title = excluded.title, saved = excluded.saved',
  [W, hh, owner, title, saved, by]);
const upsertRequest = (u: string, title: string, status: string) => asUser(db, u,
  'insert into public.requests (id, household_id, from_id, to_id, title, status) values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set title = excluded.title, status = excluded.status',
  [R, hh, m['Оля'], m['Тёма'], title, status]);

describe('board', { timeout: 60_000 }, () => {
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

  it('lets a child add a wish only for themself, and only the owner or a parent change it', async () => {
    await expect(upsertWish(SON, m['Оля'], m['Тёма'])).rejects.toThrow();
    await upsertWish(SON, m['Тёма'], m['Тёма']);
    await upsertWish(MAMA, m['Тёма'], m['Оля'], 'Велосипед', 3000);
    expect(await rows(SON, 'select saved from public.wishes')).toEqual([{ saved: 3000 }]);
    await expect(upsertWish(STRANGER, m['Тёма'], m['Тёма'], 'Чужое')).rejects.toThrow();
    expect(await rows(STRANGER, 'select * from public.wishes')).toEqual([]);
  });

  it('hides a gift mark from children and from the owner of the wish', async () => {
    await upsertWish(SON, m['Тёма'], m['Тёма']);
    await asUser(db, MAMA, 'insert into public.wish_gifts (wish_id, giver_id, household_id) values ($1, $2, $3)', [W, m['Оля'], hh]);
    expect(await rows(PAPA, 'select giver_id from public.wish_gifts')).toEqual([{ giver_id: m['Оля'] }]);
    expect(await rows(SON, 'select * from public.wish_gifts')).toEqual([]);
    await expect(asUser(db, SON, 'insert into public.wish_gifts (wish_id, giver_id, household_id) values ($1, $2, $3) on conflict (wish_id) do update set giver_id = excluded.giver_id', [W, m['Тёма'], hh])).rejects.toThrow();
    // A parent's own wish keeps its surprise from that parent.
    await asUser(db, MAMA, 'update public.wishes set owner_id = $1 where id = $2', [m['Андрей'], W]);
    expect(await rows(PAPA, 'select * from public.wish_gifts')).toEqual([]);
    expect((await rows(MAMA, 'select * from public.wish_gifts')).length).toBe(1);
  });

  it('records «я тоже» only for oneself', async () => {
    await upsertWish(SON, m['Тёма'], m['Тёма']);
    await asUser(db, PAPA, 'insert into public.wish_metoo (wish_id, member_id, household_id) values ($1, $2, $3)', [W, m['Андрей'], hh]);
    await expect(asUser(db, PAPA, 'insert into public.wish_metoo (wish_id, member_id, household_id) values ($1, $2, $3)', [W, m['Оля'], hh])).rejects.toThrow();
    expect(await rows(SON, 'select member_id from public.wish_metoo')).toEqual([{ member_id: m['Андрей'] }]);
  });

  it('keeps family goals to parents and personal ones to their owner and parents', async () => {
    const goal = (u: string, owner: string | null) => asUser(db, u, "insert into public.goals (id, household_id, owner_id, title, target, created_by) values ($1, $2, $3, 'Море', 120000, $4) on conflict (id) do update set saved = public.goals.saved + 1000", [G, hh, owner, m['Тёма']]);
    await expect(goal(SON, null)).rejects.toThrow();
    await goal(SON, m['Тёма']);
    await goal(MAMA, m['Тёма']);
    expect(await rows(SON, 'select saved from public.goals')).toEqual([{ saved: 1000 }]);
  });

  it('lets the recipient only mark a request done, and the author change or cancel it', async () => {
    await upsertRequest(MAMA, 'Вынести мусор', 'open');
    await expect(upsertRequest(SON, 'Ничего не делать', 'done')).rejects.toThrow(/not_yours/);
    await upsertRequest(SON, 'Вынести мусор', 'done');
    expect(await rows(MAMA, 'select status, done_at is not null as d from public.requests')).toEqual([{ status: 'done', d: true }]);
    await expect(upsertRequest(SON, 'Вынести мусор', 'cancelled')).rejects.toThrow(/not_yours/);
    await upsertRequest(MAMA, 'Вынести мусор и пакеты', 'cancelled');
    expect(await rows(SON, 'select title, status from public.requests')).toEqual([{ title: 'Вынести мусор и пакеты', status: 'cancelled' }]);
    await expect(asUser(db, SON, "insert into public.requests (household_id, from_id, to_id, title) values ($1, $2, $3, 'Купи мне')", [hh, m['Оля'], m['Андрей']])).rejects.toThrow(/not_yours/);
  });

  it('lets anyone in the family keep the list of things to buy', async () => {
    await asUser(db, SON, "insert into public.needs (household_id, for_id, title, note, price, created_by) values ($1, $2, 'Ботинки', 'размер 37', 6000, $2)", [hh, m['Тёма']]);
    await asUser(db, MAMA, "update public.needs set note = 'размер 38'");
    expect(await rows(SON, 'select note from public.needs')).toEqual([{ note: 'размер 38' }]);
    expect(await rows(STRANGER, 'select * from public.needs')).toEqual([]);
  });

  it('lets only the parent who took a wish as a present take the mark back', async () => {
    await upsertWish(SON, m['Тёма'], m['Тёма']);
    // Full-row upserts, the way the phone sends them.
    const gift = (u: string, giver: string, deleted: string | null) => asUser(db, u,
      'insert into public.wish_gifts (wish_id, giver_id, household_id, deleted_at) values ($1, $2, $3, $4) on conflict (wish_id) do update set wish_id = excluded.wish_id, giver_id = excluded.giver_id, household_id = excluded.household_id, deleted_at = excluded.deleted_at',
      [W, giver, hh, deleted]);
    await gift(MAMA, m['Оля'], null);
    await expect(gift(PAPA, m['Андрей'], '2026-10-15T00:00:00Z')).rejects.toThrow(/not_yours/);
    await gift(MAMA, m['Оля'], '2026-10-15T00:00:00Z');
    await gift(PAPA, m['Андрей'], null);
    expect(await rows(MAMA, 'select giver_id, deleted_at from public.wish_gifts')).toEqual([{ giver_id: m['Андрей'], deleted_at: null }]);
  });

  it('does not let a recipient tick a request the author has cancelled', async () => {
    await upsertRequest(MAMA, 'Вынести мусор', 'open');
    await upsertRequest(MAMA, 'Вынести мусор', 'cancelled');
    await expect(upsertRequest(SON, 'Вынести мусор', 'done')).rejects.toThrow(/not_yours/);
    expect(await rows(MAMA, 'select status from public.requests')).toEqual([{ status: 'cancelled' }]);
  });

  it('keeps the department chosen for a thing to buy', async () => {
    await asUser(db, SON, "insert into public.needs (household_id, for_id, title, dept, created_by) values ($1, $2, 'Процессор', 'Техника', $2)", [hh, m['Тёма']]);
    expect(await rows(MAMA, 'select dept from public.needs')).toEqual([{ dept: 'Техника' }]);
    await expect(asUser(db, SON, "update public.needs set dept = ''")).rejects.toThrow();
  });
});
