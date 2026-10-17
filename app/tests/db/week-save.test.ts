// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000e1';
const SON = '00000000-0000-0000-0000-0000000000e2';
const NEXT_MON = '2026-10-19';
let db: PGlite;
let hh: string;
let papaId: string;
let sonId: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
const slots = (dish = 'mn-plov', count = 28) => Array.from({ length: count }, (_, i) => ({ day: Math.floor(i / 4), meal: MEALS[i % 4], dish_id: dish, side_id: null, salad_id: null, simple: null }));
const week = (id: string, status: string, by: string, template = 'quick') => ({ id, household_id: hh, starts_on: NEXT_MON, template_id: template, status, proposed_by: status === 'proposed' ? by : null, approved_by: status === 'approved' ? by : null, deleted_at: null });
const save = (u: string, w: object, s: object[]) => asUser(db, u, 'select public.save_week($1::jsonb, $2::jsonb)', [JSON.stringify(w), JSON.stringify(s)]);
const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';

describe('saving a week in one step', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const u of [PAPA, SON]) await addUser(db, u);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    sonId = (await rows<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code]))[0].id;
  });

  it('stores a proposal with all its meals at once', async () => {
    await save(SON, week(W1, 'proposed', sonId), slots());
    expect((await rows<{ n: number }>(PAPA, 'select count(*)::int as n from public.week_slots where week_id = $1', [W1]))[0].n).toBe(28);
  });

  it('refuses to approve a week that has not arrived in full', async () => {
    await asUser(db, SON, "insert into public.weeks (id, household_id, starts_on, template_id, status, proposed_by) values ($1, $2, $3, 'quick', 'proposed', $4)", [W1, hh, NEXT_MON, sonId]);
    await asUser(db, SON, "insert into public.week_slots (week_id, household_id, day, meal, dish_id) values ($1, $2, 0, 'dinner', 'mn-plov')", [W1, hh]);
    await expect(asUser(db, PAPA, "update public.weeks set status = 'approved', approved_by = $2 where id = $1", [W1, papaId])).rejects.toThrow(/week_incomplete/);
    expect((await rows<{ status: string }>(PAPA, 'select status from public.weeks where id = $1', [W1]))[0].status).toBe('proposed');
  });

  it('lets a parent set an approved week with its meals in one call', async () => {
    await save(PAPA, week(W1, 'approved', papaId), slots());
    expect((await rows<{ status: string }>(SON, 'select status from public.weeks where id = $1', [W1]))[0].status).toBe('approved');
  });

  it('clears the votes when the proposal changes', async () => {
    await save(SON, week(W1, 'proposed', sonId), slots());
    await asUser(db, SON, "insert into public.votes (week_id, member_id, household_id, value) values ($1, $2, $3, 'yes')", [W1, sonId, hh]);
    await save(PAPA, week(W1, 'proposed', papaId, 'autumn'), slots('mn-kotlety'));
    expect(await rows(PAPA, 'select * from public.votes where week_id = $1', [W1])).toEqual([]);
  });

  it('names the clash when two phones propose the same week', async () => {
    await save(SON, week(W1, 'proposed', sonId), slots());
    await expect(save(PAPA, week(W2, 'proposed', papaId, 'autumn'), slots())).rejects.toThrow(/weeks_household_id_starts_on_key/);
    expect((await rows<{ n: number }>(PAPA, 'select count(*)::int as n from public.week_slots where week_id = $1', [W2]))[0].n).toBe(0);
  });

  it('does not let a child move meals out of an approved week', async () => {
    await save(PAPA, week(W1, 'approved', papaId), slots());
    await asUser(db, SON, "insert into public.weeks (id, household_id, starts_on, template_id, status, proposed_by) values ($1, $2, '2026-10-26', 'quick', 'proposed', $3)", [W2, hh, sonId]);
    await expect(asUser(db, SON, 'update public.week_slots set week_id = $2 where week_id = $1', [W1, W2])).rejects.toThrow(/not_yours/);
    expect((await rows<{ n: number }>(PAPA, 'select count(*)::int as n from public.week_slots where week_id = $1', [W1]))[0].n).toBe(28);
  });

  it('keeps a child from saving an approved week through the call', async () => {
    await expect(save(SON, week(W1, 'approved', sonId), slots())).rejects.toThrow(/not_a_parent/);
  });

  it('approves an empty week where nothing is chosen yet', async () => {
    await save(PAPA, { ...week(W1, 'approved', papaId), template_id: null }, slots('', 28).map((x) => ({ ...x, dish_id: null })));
    expect((await rows<{ status: string }>(PAPA, 'select status from public.weeks where id = $1', [W1]))[0].status).toBe('approved');
  });

  it('keeps the days the shopping list is built from, and only real days', async () => {
    await save(PAPA, { ...week(W1, 'approved', papaId), list_days: [3, 4, 5, 6] }, slots());
    expect(await rows(PAPA, 'select list_days from public.weeks where id = $1', [W1])).toEqual([{ list_days: [3, 4, 5, 6] }]);
    await save(PAPA, { ...week(W1, 'approved', papaId), list_days: null }, slots());
    expect(await rows(PAPA, 'select list_days from public.weeks where id = $1', [W1])).toEqual([{ list_days: null }]);
    await expect(asUser(db, PAPA, 'update public.weeks set list_days = $2 where id = $1', [W1, [2, 7]])).rejects.toThrow();
    await asUser(db, PAPA, 'update public.weeks set list_days = $2 where id = $1', [W1, [5, 6]]);
    expect(await rows(PAPA, 'select list_days from public.weeks where id = $1', [W1])).toEqual([{ list_days: [5, 6] }]);
  });
});
