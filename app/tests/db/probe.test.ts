// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { asUser, createDb } from './harness';

describe('probe_payload', { timeout: 60_000 }, () => {
  it('serves a payload larger than the 16 KB cut to anonymous visitors', async () => {
    const db = await createDb();
    const r = await asUser(db, null, 'select length(body) as n from public.probe_payload where id = 1');
    expect(Number((r.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(65536);
  });
});
