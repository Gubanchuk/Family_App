// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000a1';
const SON = '00000000-0000-0000-0000-0000000000a2';
const STRANGER = '00000000-0000-0000-0000-0000000000a3';
const MON = '2026-10-12';
const NEXT_MON = '2026-10-19';
let db: PGlite;
let hh: string;
let papaId: string;
let sonId: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];

describe('menu schema', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    papaId = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA]))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    sonId = (await rows<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code]))[0].id;
  });

  // An approved week must hold all 28 meals, so the helpers fill the whole week.
  const fill = (u: string, w: string) => asUser(db, u, `insert into public.week_slots (week_id, household_id, day, meal, dish_id)
    select $1, $2, d, m, case when d = 0 and m = 'dinner' then 'mn-kotlety' else 'mn-plov' end
    from generate_series(0, 6) d, unnest(array['breakfast', 'lunch', 'snack', 'dinner']) m`, [w, hh]);

  async function approvedWeek() {
    const w = (await rows<{ id: string }>(PAPA, "insert into public.weeks (household_id, starts_on, template_id, status) values ($1, $2, 'autumn', 'proposed') returning id", [hh, MON]))[0].id;
    await fill(PAPA, w);
    await asUser(db, PAPA, "update public.weeks set status = 'approved', approved_by = $2 where id = $1", [w, papaId]);
    return w;
  }

  it('lets the family read a week a parent set', async () => {
    await approvedWeek();
    const seen = await rows<{ dish_id: string }>(SON, "select dish_id from public.week_slots where day = 0 and meal = 'dinner'");
    expect(seen).toEqual([{ dish_id: 'mn-kotlety' }]);
    expect((await rows<{ n: number }>(SON, 'select count(*)::int as n from public.week_slots'))[0].n).toBe(28);
  });

  it('lets a child propose next week but not approve it', async () => {
    const w = (await rows<{ id: string }>(SON, "insert into public.weeks (household_id, starts_on, template_id, status, proposed_by) values ($1, $2, 'quick', 'proposed', $3) returning id", [hh, NEXT_MON, sonId]))[0].id;
    await fill(SON, w);
    await expect(asUser(db, SON, "update public.weeks set status = 'approved' where id = $1", [w])).rejects.toThrow(/not_a_parent/);
    await asUser(db, PAPA, "update public.weeks set status = 'approved', approved_by = $2 where id = $1", [w, papaId]);
    expect((await rows<{ status: string }>(SON, 'select status from public.weeks where id = $1', [w]))[0].status).toBe('approved');
  });

  it('keeps an approved week closed to a child', async () => {
    const w = await approvedWeek();
    await expect(asUser(db, SON, "update public.week_slots set dish_id = 'mn-plov' where week_id = $1 and day = 0 and meal = 'dinner'", [w])).rejects.toThrow(/not_a_parent/);
    await expect(asUser(db, SON, "insert into public.weeks (household_id, starts_on, status) values ($1, '2026-10-26', 'approved')", [hh])).rejects.toThrow(/not_a_parent/);
  });

  it('rejects a slot that points to another family', async () => {
    const w = await approvedWeek();
    await addUser(db, '00000000-0000-0000-0000-0000000000a4');
    const other = (await rows<{ id: string }>('00000000-0000-0000-0000-0000000000a4', "select public.create_household('Чужие', 'Кто-то', '#000000') as id"))[0].id;
    await expect(asUser(db, PAPA, "insert into public.week_slots (week_id, household_id, day, meal, dish_id) values ($1, $2, 1, 'dinner', 'mn-plov')", [w, other])).rejects.toThrow();
  });

  it('lets each member vote only as themselves', async () => {
    const w = await approvedWeek();
    await asUser(db, SON, "insert into public.votes (week_id, member_id, household_id, value) values ($1, $2, $3, 'yes')", [w, sonId, hh]);
    await expect(asUser(db, SON, "insert into public.votes (week_id, member_id, household_id, value) values ($1, $2, $3, 'yes')", [w, papaId, hh])).rejects.toThrow();
    expect(await rows(PAPA, 'select value from public.votes')).toEqual([{ value: 'yes' }]);
  });

  it('hides weeks from strangers', async () => {
    await approvedWeek();
    expect(await rows(STRANGER, 'select * from public.weeks')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.week_slots')).toEqual([]);
  });

  it('lets the family save its own template but not edit the base one', async () => {
    await asUser(db, PAPA, "insert into public.week_templates (id, household_id, name) values ('h-1', $1, 'Наша')", [hh]);
    await asUser(db, PAPA, "insert into public.template_slots (template_id, day, meal, dish_id) values ('h-1', 0, 'dinner', 'mn-plov')");
    await asUser(db, PAPA, "update public.week_templates set name = 'Сломали' where id = 'autumn'");
    expect((await rows<{ name: string }>(PAPA, "select name from public.week_templates where id = 'autumn'"))[0].name).toBe('Осенняя');
    expect((await rows<{ n: number }>(SON, "select count(*) as n from public.template_slots where template_id = 'h-1'"))[0].n).toBe(1);
  });

  it('moves updated_at forward on every change', async () => {
    const w = await approvedWeek();
    const pick = "select updated_at::text as t from public.week_slots where week_id = $1 and day = 0 and meal = 'dinner'";
    const before = (await rows<{ t: string }>(PAPA, pick, [w]))[0].t;
    await new Promise((r) => setTimeout(r, 20));
    await asUser(db, PAPA, "update public.week_slots set dish_id = 'mn-plov' where week_id = $1 and day = 0 and meal = 'dinner'", [w]);
    const after = (await rows<{ t: string }>(PAPA, pick, [w]))[0].t;
    expect(after > before).toBe(true);
  });
});
