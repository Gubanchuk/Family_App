// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000d1';
const MAMA = '00000000-0000-0000-0000-0000000000d2';
const SON = '00000000-0000-0000-0000-0000000000d3';
const STRANGER = '00000000-0000-0000-0000-0000000000d4';
const W = '00000000-0000-0000-0000-00000000e001';
const G = '00000000-0000-0000-0000-00000000e002';
const D1 = '00000000-0000-0000-0000-00000000e101';
const D2 = '00000000-0000-0000-0000-00000000e102';
let db: PGlite;
let hh: string;
let other: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
// The phone sends a deposit as an upsert, and removes it by setting deleted_at the same way.
const deposit = (u: string, id: string, by: string, amount: number, target: { wish?: string; goal?: string }, household = hh, deleted: string | null = null) => asUser(db, u,
  'insert into public.deposits (id, household_id, wish_id, goal_id, member_id, amount, deleted_at) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do update set amount = excluded.amount, deleted_at = excluded.deleted_at',
  [id, household, target.wish ?? null, target.goal ?? null, by, amount, deleted]);

describe('piggy bank deposits', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Оля', '#E0457B', 'mother')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [await invite('child')]);
    other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB') as id"))[0].id;
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) m[r.name] = r.id;
    await asUser(db, SON, "insert into public.wishes (id, household_id, owner_id, title, price, created_by) values ($1, $2, $3, 'Велосипед', 25000, $3)", [W, hh, m['Тёма']]);
    await asUser(db, PAPA, "insert into public.goals (id, household_id, title, target, created_by) values ($1, $2, 'Море', 120000, $3)", [G, hh, m['Андрей']]);
  });

  it('lets anyone in the family put money into a wish or a goal as themself, seen by the whole family', async () => {
    await deposit(PAPA, D1, m['Андрей'], 2000, { wish: W });
    await deposit(SON, D2, m['Тёма'], 500, { goal: G });
    expect(await rows(MAMA, 'select amount from public.deposits order by amount')).toEqual([{ amount: 500 }, { amount: 2000 }]);
    expect(await rows(STRANGER, 'select id from public.deposits')).toEqual([]);
  });

  it('refuses a deposit in the name of another member, into another family, without a target or with two', async () => {
    await expect(deposit(SON, D1, m['Андрей'], 2000, { wish: W })).rejects.toThrow();
    await expect(deposit(STRANGER, D1, m['Пётр'], 2000, { wish: W }, other)).rejects.toThrow();
    await expect(deposit(PAPA, D1, m['Андрей'], 2000, {})).rejects.toThrow();
    await expect(deposit(PAPA, D1, m['Андрей'], 2000, { wish: W, goal: G })).rejects.toThrow();
    await expect(deposit(PAPA, D1, m['Андрей'], 0, { wish: W })).rejects.toThrow();
    await expect(deposit(PAPA, D1, m['Андрей'], 20_000_000, { wish: W })).rejects.toThrow();
  });

  it('lets only the author take a deposit back, and only within a day', async () => {
    await deposit(PAPA, D1, m['Андрей'], 2000, { wish: W });
    await deposit(MAMA, D1, m['Андрей'], 2000, { wish: W }, hh, new Date().toISOString()).catch(() => {});
    expect((await rows<{ deleted_at: string | null }>(PAPA, 'select deleted_at from public.deposits'))[0].deleted_at).toBeNull();
    await deposit(PAPA, D1, m['Андрей'], 2000, { wish: W }, hh, new Date().toISOString());
    expect((await rows<{ deleted_at: string | null }>(PAPA, 'select deleted_at from public.deposits'))[0].deleted_at).not.toBeNull();
    await deposit(PAPA, D2, m['Андрей'], 700, { goal: G });
    // Backdating is test setup, not a member's change: triggers are off for it.
    await db.exec("set session_replication_role = replica");
    await db.query("update public.deposits set created_at = now() - interval '2 days' where id = $1", [D2]);
    await db.exec("set session_replication_role = default");
    await deposit(PAPA, D2, m['Андрей'], 700, { goal: G }, hh, new Date().toISOString()).catch(() => {});
    expect((await rows<{ deleted_at: string | null }>(PAPA, 'select deleted_at from public.deposits where id = $1', [D2]))[0].deleted_at).toBeNull();
  });

  it('never lets a deposit change its sum after the fact', async () => {
    await deposit(PAPA, D1, m['Андрей'], 2000, { wish: W });
    await deposit(PAPA, D1, m['Андрей'], 9000, { wish: W }).catch(() => {});
    expect((await rows<{ amount: number }>(PAPA, 'select amount from public.deposits'))[0].amount).toBe(2000);
  });

  it('stamps a deposit with the server time even when the phone sends another', async () => {
    await asUser(db, MAMA, "insert into public.deposits (id, household_id, wish_id, member_id, amount, created_at) values ($1, $2, $3, $4, 100, '2099-01-01')", [D1, hh, W, m['Оля']]);
    const [{ late }] = await rows<{ late: boolean }>(MAMA, 'select created_at > now() + interval \'1 hour\' as late from public.deposits where id = $1', [D1]);
    expect(late).toBe(false);
  });
});
