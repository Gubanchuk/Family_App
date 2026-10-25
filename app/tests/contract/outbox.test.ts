// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from '../db/harness';
import { createLocalDb, type LocalDb } from '../../src/data/db';
import { pushOutbox, writeLocal } from '../../src/data/sync';
import type { Member } from '../../src/features/family/useFamily';
import { replaceMeal } from '../../src/features/menu/actions';
import { approveWeek, setWeekFromTemplate, voteWeek } from '../../src/features/menu/weekActions';
import { saveWeekAsTemplate } from '../../src/features/menu/saveTemplate';
import { addManualItem, goShopping, setBought } from '../../src/features/shop/shopActions';
import { cancelOffer, createOffer, leaveOffer, takeOffer } from '../../src/features/ideas/offerActions';
import { pgClient } from './pgClient';

const PAPA = '00000000-0000-0000-0000-0000000000f1';
const SON = '00000000-0000-0000-0000-0000000000f2';
const CONTENT = ['recipes', 'recipe_ingredients', 'recipe_sides', 'ingredients', 'prices', 'week_templates', 'template_slots'];

async function phone(pg: PGlite, user: string): Promise<LocalDb> {
  const local = createLocalDb(`c-${Math.random()}`);
  for (const t of CONTENT) await local.table(t).bulkPut((await asUser(pg, user, `select * from public.${t}`)).rows as never[]);
  await local.meta.put({ key: 'family_portions', value: 2 });
  return local;
}

describe('every change the app queues is accepted by the real schema', { timeout: 180_000 }, () => {
  it('weeks, meals, the list, marks, manual items, trips, not-eat, templates, offers and votes', async () => {
    const pg = await createDb();
    for (const u of [PAPA, SON]) await addUser(pg, u);
    const one = async <T>(u: string, sql: string, p: unknown[] = []) => (await asUser(pg, u, sql, p)).rows[0] as T;
    const hh = (await one<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB') as id")).id;
    const papaId = (await one<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA])).id;
    const code = (await one<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh])).c;
    const sonId = (await one<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463') as id", [code])).id;
    const papa: Member = { id: papaId, household_id: hh, user_id: PAPA, name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };
    const son: Member = { id: sonId, household_id: hh, user_id: SON, name: 'Сын', color: '#1FA463', role: 'child', is_owner: false, portion: 1 };
    const count = async (sql: string) => Number((await one<{ n: number }>(PAPA, sql)).n);

    const p = await phone(pg, PAPA);
    const week = await setWeekFromTemplate(p, { household: hh, startsOn: '2026-10-12', template: 'autumn', status: 'approved', by: papaId });
    await replaceMeal(p, week, 1, 'dinner', { recipe: (await p.recipes.get('mn-plov'))!, sides: [] });
    const first = (await p.shopping_items.toArray()).find((i) => !i.deleted_at)!;
    await setBought(p, first, papa, true);
    await addManualItem(p, papa, { title: 'Молоко', qtyText: '2 л', urgent: true, vocab: new Map((await p.ingredients.toArray()).map((v) => [v.item, v])) });
    await goShopping(p, papa, new Date(2026, 9, 13, 18));
    await writeLocal(p, 'not_eat', [{ household_id: hh, kind: 'item', ref: 'грибы', deleted_at: null }]);
    await saveWeekAsTemplate(p, week, await p.week_slots.where('week_id').equals(week.id).toArray(), 'Наша осень');
    const r1 = await pushOutbox(p, pgClient(pg, PAPA) as never);
    expect(r1.rejected).toEqual([]);
    expect(r1.stopped).toBeNull();
    expect(await count(`select count(*) as n from public.shopping_items where week_id = '${week.id}' and deleted_at is null`)).toBeGreaterThan(10);
    expect(await count('select count(*) as n from public.shopping_marks where bought')).toBe(1);
    expect(await count("select count(*) as n from public.shopping_items where source = 'manual'")).toBe(1);
    expect(await count('select count(*) as n from public.shop_trips')).toBe(1);
    expect(await count('select count(*) as n from public.template_slots t join public.week_templates w on w.id = t.template_id where w.household_id is not null')).toBe(28);

    const s = await phone(pg, SON);
    const next = await setWeekFromTemplate(s, { household: hh, startsOn: '2026-10-19', template: 'quick', status: 'proposed', by: sonId });
    await voteWeek(s, next, son, 'yes');
    const offer = await createOffer(s, { me: son, to: papaId, dish: 'mn-plov', date: '2026-10-13', meal: 'dinner', how: 'over' });
    const r2 = await pushOutbox(s, pgClient(pg, SON) as never);
    expect(r2.rejected).toEqual([]);

    // PostgREST hands dates to phones as text; PGlite gives a Date.
    await p.weeks.put({ ...(await asUser(pg, PAPA, 'select * from public.weeks where id = $1', [next.id])).rows[0] as object, starts_on: '2026-10-19' } as never);
    await p.week_slots.bulkPut((await asUser(pg, PAPA, 'select * from public.week_slots where week_id = $1', [next.id])).rows as never[]);
    await approveWeek(p, (await p.weeks.get(next.id))!, papa);
    await takeOffer(p, { ...offer }, papa);
    const r3 = await pushOutbox(p, pgClient(pg, PAPA) as never);
    expect(r3.rejected).toEqual([]);
    expect(await count("select count(*) as n from public.dish_offers where status = 'taken'")).toBe(1);
    expect(await count("select count(*) as n from public.shopping_items where source = 'offer'")).toBeGreaterThan(0);
    expect(await count("select count(*) as n from public.weeks where status = 'approved'")).toBe(2);

    // Backing out, its undo and taking an offer back are plain updates the schema accepts.
    const undo = await leaveOffer(p, (await p.dish_offers.get(offer.id))!);
    expect((await pushOutbox(p, pgClient(pg, PAPA) as never)).rejected).toEqual([]);
    expect(await count("select count(*) as n from public.dish_offers where status = 'open' and taken_by is null")).toBe(1);
    expect(await count("select count(*) as n from public.shopping_items where source = 'offer' and deleted_at is null")).toBe(0);
    await undo();
    expect((await pushOutbox(p, pgClient(pg, PAPA) as never)).rejected).toEqual([]);
    expect(await count("select count(*) as n from public.shopping_items where source = 'offer' and deleted_at is null")).toBeGreaterThan(0);
    await cancelOffer(p, (await p.dish_offers.get(offer.id))!);
    expect((await pushOutbox(p, pgClient(pg, PAPA) as never)).rejected).toEqual([]);
    expect(await count('select count(*) as n from public.dish_offers where deleted_at is not null')).toBe(1);
  });
});
