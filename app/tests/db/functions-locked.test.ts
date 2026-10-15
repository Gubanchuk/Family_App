// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const MAMA = '00000000-0000-0000-0000-0000000000b1';
let db: PGlite;

describe('functions without a login', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = await createDb();
    await addUser(db, MAMA);
  });

  it('lets a visitor only look up an invite', async () => {
    await expect(asUser(db, null, "select public.invite_info('nope')")).rejects.toThrow(/invite_not_found/);
    await expect(asUser(db, null, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, 'select public.my_household_ids()')).rejects.toThrow(/permission denied/);
    // The connection check reads its table without a login.
    expect((await asUser(db, null, 'select id from public.probe_payload')).rows).toHaveLength(1);
  });

  it('keeps every function working for a signed-in member', async () => {
    const { rows } = await asUser(db, MAMA, "select public.create_household('Губанчуки', 'Оля', '#E0457B', 'mother') as id");
    expect(rows).toHaveLength(1);
  });
});
