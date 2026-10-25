// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { PGlite as Pg } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000f1';
const SON = '00000000-0000-0000-0000-0000000000f2';
const STRANGER = '00000000-0000-0000-0000-0000000000f3';
let db: PGlite;
let hh: string;

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const line = (u: string, id: string, source = 'manual') => asUser(db, u,
  `insert into public.shopping_items (id, household_id, source, title, dept) values ($1, $2, $3, 'Хлеб', 'Хлеб')`, [id, hh, source]);

describe('the trip list on shopping lines', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child'::public.member_role) as c", [hh]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [code]);
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
  });

  it('starts a new line outside the trip', async () => {
    await line(PAPA, 'u:1');
    expect(await rows(PAPA, 'select in_trip from public.shopping_items')).toEqual([{ in_trip: false }]);
  });

  it('lets anyone in the family put a line in the trip and take it out, and nobody else', async () => {
    await line(PAPA, 'u:1');
    await asUser(db, SON, "update public.shopping_items set in_trip = true where id = 'u:1'");
    expect(await rows(PAPA, 'select in_trip from public.shopping_items')).toEqual([{ in_trip: true }]);
    await asUser(db, STRANGER, "update public.shopping_items set in_trip = false where id = 'u:1'");
    expect(await rows(PAPA, 'select in_trip from public.shopping_items')).toEqual([{ in_trip: true }]);
  });

  it('lets a bought menu line change only its trip mark', async () => {
    const week = (await rows<{ id: string }>(PAPA,
      "insert into public.weeks (household_id, starts_on, status, proposed_by) values ($1, '2026-10-26', 'proposed', (select id from public.members where name = 'Андрей')) returning id", [hh]))[0].id;
    await asUser(db, PAPA, "insert into public.shopping_items (id, household_id, week_id, source, item, title, qty, unit, dept) values ('m:1', $1, $2, 'menu', 'молоко', 'Молоко', 1000, 'мл', 'Молочное и яйца')", [hh, week]);
    await asUser(db, PAPA, "insert into public.shopping_marks (item_id, household_id, bought) values ('m:1', $1, true)", [hh]);
    await asUser(db, PAPA, "update public.shopping_items set in_trip = true where id = 'm:1'");
    expect(await rows(PAPA, 'select in_trip from public.shopping_items')).toEqual([{ in_trip: true }]);
    await expect(asUser(db, PAPA, "update public.shopping_items set qty = 2000 where id = 'm:1'")).rejects.toThrow(/already_bought/);
  });

  it('puts open hand-typed and run-out lines in the trip when the column arrives', async () => {
    // The family's database just before this migration, with lines of every kind.
    const root = resolve(__dirname, '../../..');
    const dir = join(root, 'supabase/migrations');
    const files = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
    const last = files.indexOf('20261025000200_trip_list.sql');
    const old = new Pg();
    await old.exec(readFileSync(join(root, 'supabase/tests/bootstrap.sql'), 'utf8'));
    for (const f of files.slice(0, last)) await old.exec(readFileSync(join(dir, f), 'utf8'));
    db = old;
    await addUser(db, PAPA);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    for (const [id, source] of [['u:open', 'manual'], ['h:open', 'home'], ['u:bought', 'manual'], ['u:home', 'manual'], ['u:gone', 'manual']]) await line(PAPA, id, source);
    await asUser(db, PAPA, "insert into public.shopping_marks (item_id, household_id, bought) values ('u:bought', $1, true)", [hh]);
    await asUser(db, PAPA, "insert into public.shopping_marks (item_id, household_id, bought, at_home) values ('u:home', $1, false, true)", [hh]);
    await asUser(db, PAPA, "update public.shopping_items set deleted_at = now() where id = 'u:gone'");
    await db.exec(readFileSync(join(dir, files[last]), 'utf8'));
    expect(await rows(PAPA, 'select id, in_trip from public.shopping_items order by id')).toEqual([
      { id: 'h:open', in_trip: true }, { id: 'u:bought', in_trip: false }, { id: 'u:gone', in_trip: false }, { id: 'u:home', in_trip: false }, { id: 'u:open', in_trip: true },
    ]);
  });
});
