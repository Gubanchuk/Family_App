// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000e1';
const MAMA = '00000000-0000-0000-0000-0000000000e2';
const SON = '00000000-0000-0000-0000-0000000000e3';
const STRANGER = '00000000-0000-0000-0000-0000000000e4';
const TRIP = '00000000-0000-0000-0000-00000000e001';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const milk = (u: string, state: string) => asUser(db, u,
  `insert into public.home_stock (household_id, key, item, title, dept, state, by_member) values ($1, 'молоко', 'молоко', 'Молоко', 'Молочное и яйца', $2, $3)
   on conflict (household_id, key) do update set state = excluded.state, by_member = excluded.by_member`, [hh, state, m[u === MAMA ? 'Оля' : u === SON ? 'Тёма' : 'Андрей']]);

describe('home stock, at-home marks and trip carts', { timeout: 60_000 }, () => {
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

  it('lets the whole family read and change what is at home, and nobody else', async () => {
    await milk(MAMA, 'have');
    await milk(SON, 'out');
    expect(await rows(PAPA, 'select key, state from public.home_stock')).toEqual([{ key: 'молоко', state: 'out' }]);
    expect(await rows(STRANGER, 'select key from public.home_stock')).toEqual([]);
    await expect(asUser(db, STRANGER,
      "insert into public.home_stock (household_id, key, title, dept, state) values ($1, 't:хлеб', 'Хлеб', 'Хлеб', 'have')", [hh])).rejects.toThrow();
  });

  it('keeps a line bought or at home, never both', async () => {
    await asUser(db, MAMA, "insert into public.shopping_items (id, household_id, source, title, dept) values ('u:1', $1, 'manual', 'Молоко', 'Молочное и яйца')", [hh]);
    await asUser(db, MAMA, "insert into public.shopping_marks (item_id, household_id, bought, at_home) values ('u:1', $1, false, true)", [hh]);
    await expect(asUser(db, MAMA, "update public.shopping_marks set bought = true where item_id = 'u:1'")).rejects.toThrow();
  });

  it('takes a line that ran out at home', async () => {
    await asUser(db, SON, "insert into public.shopping_items (id, household_id, source, item, title, dept) values ('h:2026-10-12:0:молоко', $1, 'home', 'молоко', 'Молоко', 'Молочное и яйца')", [hh]);
    expect(await rows(PAPA, 'select source from public.shopping_items')).toEqual([{ source: 'home' }]);
  });

  it('lets only the shopper change the trip', async () => {
    await asUser(db, PAPA, `insert into public.shop_trips (id, household_id, member_id, label, items) values ($1, $2, $3, 'завтрак на завтра', '[{"id":"m:w:молоко","hint":"на завтрак: 500 мл"}]')`, [TRIP, hh, m['Андрей']]);
    await asUser(db, PAPA, 'update public.shop_trips set ended_at = now() where id = $1', [TRIP]);
    await asUser(db, MAMA, "update public.shop_trips set label = 'чужое' where id = $1", [TRIP]);
    expect(await rows(MAMA, 'select label, ended_at is not null as ended from public.shop_trips')).toEqual([{ label: 'завтрак на завтра', ended: true }]);
  });
});
