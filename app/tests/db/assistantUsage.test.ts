// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const MAMA = '00000000-0000-0000-0000-0000000000c1';
let db: PGlite;
let hh: string;
let me: string;

describe('assistant_usage', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = await createDb();
    await addUser(db, MAMA);
    hh = ((await asUser(db, MAMA, "select public.create_household('Губанчуки', 'Оля', '#E0457B', 'mother') as id")).rows[0] as { id: string }).id;
    me = ((await asUser(db, MAMA, 'select id from public.members')).rows[0] as { id: string }).id;
  });

  it('keeps one row per call and sums a family day for the function', async () => {
    // The test runs as the database owner, standing in for the function's service role key.
    await db.query(
      "insert into public.assistant_usage (household_id, member_id, at, cost_usd, input_tokens, output_tokens) values ($1, $2, now() - interval '2 days', 3, 10, 5), ($1, $2, now(), 0.25, 1200, 300), ($1, $2, now(), 0.5, 900, 100)",
      [hh, me],
    );
    const { rows } = await db.query("select public.assistant_spent($1, now() - interval '1 hour') as spent", [hh]);
    expect(Number((rows[0] as { spent: string }).spent)).toBe(0.75);
    const none = await db.query("select public.assistant_spent(gen_random_uuid(), now() - interval '1 hour') as spent");
    expect(Number((none.rows[0] as { spent: string }).spent)).toBe(0);
  });

  it('lets a member neither read nor write it, nor ask for the sum', async () => {
    await expect(asUser(db, MAMA, 'select * from public.assistant_usage')).rejects.toThrow(/permission denied/);
    await expect(asUser(db, MAMA, 'insert into public.assistant_usage (household_id, member_id, cost_usd) values ($1, $2, 0)', [hh, me])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, MAMA, "select public.assistant_spent($1, now() - interval '1 day')", [hh])).rejects.toThrow(/permission denied for function/);
    await expect(asUser(db, null, 'select * from public.assistant_usage')).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, "select public.assistant_spent($1, now() - interval '1 day')", [hh])).rejects.toThrow(/permission denied for function/);
  });
});
