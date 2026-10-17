// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000c1';
const MAMA = '00000000-0000-0000-0000-0000000000c2';
const SON = '00000000-0000-0000-0000-0000000000c3';
const STRANGER = '00000000-0000-0000-0000-0000000000c4';
let db: PGlite;
let hh: string;
const id: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;

describe('shopping schema', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const u of [PAPA, MAMA, SON, STRANGER]) await addUser(db, u);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id"))[0].id;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Мама', '#E0457B')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Сын', '#1FA463')", [await invite('child')]);
    for (const [k, u] of [['papa', PAPA], ['mama', MAMA], ['son', SON]]) id[k] = (await rows<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [u]))[0].id;
    await asUser(db, PAPA, "insert into public.shopping_items (id, household_id, source, item, title, qty, unit, qty_text, dept, est_price) values ('m:x:картофель', $1, 'menu', 'картофель', 'Картофель', 3000, 'г', '3 кг', 'Овощи и фрукты', 105)", [hh]);
  });

  it('shares a purchase mark with the whole family and nobody else', async () => {
    await asUser(db, SON, "insert into public.shopping_marks (item_id, household_id, bought, by_member) values ('m:x:картофель', $1, true, $2)", [hh, id.son]);
    expect(await rows(MAMA, 'select bought from public.shopping_marks')).toEqual([{ bought: true }]);
    expect(await rows(STRANGER, 'select * from public.shopping_marks')).toEqual([]);
    expect(await rows(STRANGER, 'select * from public.shopping_items')).toEqual([]);
  });

  it('lets a child add an urgent item by hand', async () => {
    await asUser(db, SON, "insert into public.shopping_items (id, household_id, source, title, qty_text, dept, urgent, added_by) values ('u:1', $1, 'manual', 'Бананы', '1 кг', 'Овощи и фрукты', true, $2)", [hh, id.son]);
    expect(await rows(PAPA, "select title, urgent from public.shopping_items where id = 'u:1'")).toEqual([{ title: 'Бананы', urgent: true }]);
  });

  it('refuses a mark that points at another family', async () => {
    const other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Кто-то', '#000000') as id"))[0].id;
    await expect(asUser(db, STRANGER, "insert into public.shopping_marks (item_id, household_id, bought) values ('m:x:картофель', $1, true)", [other])).rejects.toThrow();
  });

  it('lets a member offer a dish only as themselves', async () => {
    const ins = (from: string, who: string) => asUser(db, who, "insert into public.dish_offers (household_id, from_member, to_member, dish_id, on_date, meal, how) values ($1, $2, $3, 'mn-plov', '2026-10-14', 'dinner', 'over') returning id", [hh, from, id.papa]);
    await expect(ins(id.mama, SON)).rejects.toThrow(/not_yours/);
    const offer = (await ins(id.son, SON)).rows[0] as { id: string };
    await expect(asUser(db, SON, "update public.dish_offers set status = 'taken', taken_by = $2 where id = $1", [offer.id, id.papa])).rejects.toThrow(/not_yours/);
    await asUser(db, PAPA, "update public.dish_offers set status = 'taken', taken_by = $2 where id = $1", [offer.id, id.papa]);
    expect(await rows(SON, 'select status from public.dish_offers')).toEqual([{ status: 'taken' }]);
  });

  it('lets the recipient take an offer through an upsert', async () => {
    const offer = (await rows<Record<string, unknown>>(MAMA, "insert into public.dish_offers (household_id, from_member, to_member, dish_id, on_date, meal, how) values ($1, $2, $3, 'mn-plov', '2026-10-14', 'dinner', 'instead') returning *", [hh, id.mama, id.papa]))[0];
    await asUser(db, PAPA, `insert into public.dish_offers (id, household_id, from_member, to_member, dish_id, on_date, meal, how, status, taken_by)
      values ($1, $2, $3, $4, 'mn-plov', '2026-10-14', 'dinner', 'instead', 'taken', $4)
      on conflict (id) do update set status = excluded.status, taken_by = excluded.taken_by`, [offer.id, hh, id.mama, id.papa]);
    expect(await rows(MAMA, 'select status from public.dish_offers')).toEqual([{ status: 'taken' }]);
  });

  it('lets only parents edit what the family does not eat', async () => {
    await expect(asUser(db, SON, "insert into public.not_eat (household_id, kind, ref) values ($1, 'item', 'грибы')", [hh])).rejects.toThrow();
    await asUser(db, MAMA, "insert into public.not_eat (household_id, kind, ref) values ($1, 'item', 'грибы')", [hh]);
    expect(await rows(SON, 'select ref from public.not_eat')).toEqual([{ ref: 'грибы' }]);
  });

  it('records a shop trip only as yourself', async () => {
    await expect(asUser(db, SON, 'insert into public.shop_trips (household_id, member_id) values ($1, $2)', [hh, id.papa])).rejects.toThrow();
    await asUser(db, SON, 'insert into public.shop_trips (household_id, member_id) values ($1, $2)', [hh, id.son]);
    expect(await rows(PAPA, 'select member_id from public.shop_trips')).toEqual([{ member_id: id.son }]);
  });

  it('keeps push subscriptions private to their owner and the log to the server', async () => {
    await asUser(db, SON, "insert into public.push_subscriptions (endpoint, household_id, member_id, p256dh, auth) values ('https://push.example/1', $1, $2, 'k', 'a')", [hh, id.son]);
    expect(await rows(PAPA, 'select * from public.push_subscriptions')).toEqual([]);
    expect(await rows(SON, 'select endpoint from public.push_subscriptions')).toEqual([{ endpoint: 'https://push.example/1' }]);
    await expect(asUser(db, PAPA, 'select * from public.push_log')).rejects.toThrow();
  });

  it('keeps a bought menu line as it was bought', async () => {
    await asUser(db, MAMA, "insert into public.shopping_marks (item_id, household_id, bought, by_member) values ('m:x:картофель', $1, true, $2)", [hh, id.mama]);
    await expect(asUser(db, PAPA, "update public.shopping_items set qty = 6000, qty_text = '6 кг' where id = 'm:x:картофель'")).rejects.toThrow(/already_bought/);
    await expect(asUser(db, PAPA, "update public.shopping_items set deleted_at = now() where id = 'm:x:картофель'")).rejects.toThrow(/already_bought/);
    expect(await rows(PAPA, "select qty_text, deleted_at from public.shopping_items where id = 'm:x:картофель'")).toEqual([{ qty_text: '3 кг', deleted_at: null }]);
  });

  it('still recounts a menu line that nobody has bought', async () => {
    await asUser(db, PAPA, "update public.shopping_items set qty = 6000, qty_text = '6 кг' where id = 'm:x:картофель'");
    expect(await rows(PAPA, "select qty_text from public.shopping_items where id = 'm:x:картофель'")).toEqual([{ qty_text: '6 кг' }]);
  });

  it('logs a push once per version of an event', async () => {
    await db.query("insert into public.push_log (kind, ref_id, version) values ('weeks', '11111111-1111-4111-8111-111111111111', 'quick:a')");
    await db.query("insert into public.push_log (kind, ref_id, version) values ('weeks', '11111111-1111-4111-8111-111111111111', 'autumn:b')");
    await expect(db.query("insert into public.push_log (kind, ref_id, version) values ('weeks', '11111111-1111-4111-8111-111111111111', 'quick:a')")).rejects.toThrow();
  });

  it('keeps the day a line was bought through a later price, and clears it when the mark is taken off', async () => {
    const mark = (bought: boolean, price: number | null) => asUser(db, SON,
      "insert into public.shopping_marks (item_id, household_id, bought, by_member, price_real) values ('m:x:картофель', $1, $2, $3, $4) on conflict (item_id) do update set bought = excluded.bought, price_real = excluded.price_real",
      [hh, bought, id.son, price]);
    const day = async () => (await rows<{ t: string | null }>(PAPA, 'select bought_at::text as t from public.shopping_marks'))[0].t;
    await mark(true, null);
    const first = await day();
    expect(first).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    await mark(true, 189);
    expect(await day()).toBe(first);
    await mark(false, 189);
    expect(await day()).toBeNull();
  });
});
