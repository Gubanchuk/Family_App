// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const U = '00000000-0000-0000-0000-0000000000d1';
let db: PGlite;

const one = async <T>(sql: string) => (await asUser(db, U, sql)).rows[0] as T;

describe('seed content', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = await createDb();
    await addUser(db, U);
  });

  it('has the whole recipe base readable by any signed-in person', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.recipes where household_id is null')).n)).toBe(368);
  });
  it('keeps every recipe ingredient in the vocabulary', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.recipe_ingredients ri left join public.ingredients i using (item) where i.item is null')).n)).toBe(0);
  });
  it('has six full week templates', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.week_templates')).n)).toBe(6);
    expect(Number((await one<{ n: number }>('select count(*) as n from public.template_slots')).n)).toBe(6 * 7 * 4);
  });
  it('points every template slot to a real dish or a simple snack', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.template_slots where dish_id is null and simple is null')).n)).toBe(0);
  });
  it('has prices for most groceries', async () => {
    expect(Number((await one<{ n: number }>('select count(*) as n from public.prices')).n)).toBeGreaterThanOrEqual(140);
  });
  it('hides the base from anonymous visitors', async () => {
    expect((await asUser(db, null, 'select id from public.recipes limit 1')).rows).toEqual([]);
  });
});
