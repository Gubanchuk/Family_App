// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addUser, asUser, createDb } from '../db/harness';
import { createLocalDb } from '../../src/data/db';
import { pushOutbox } from '../../src/data/sync';
import type { Member } from '../../src/features/family/useFamily';
import { putIn, saveWish, takeBack } from '../../src/features/board/boardActions';
import { pgClient } from './pgClient';

const SON = '00000000-0000-0000-0000-0000000000f7';

describe('piggy bank deposits from the app reach the real schema', { timeout: 120_000 }, () => {
  it('puts money in and takes it back through the outbox', async () => {
    const pg = await createDb();
    await addUser(pg, SON);
    const one = async <T>(sql: string, p: unknown[] = []) => (await asUser(pg, SON, sql, p)).rows[0] as T;
    const hh = (await one<{ id: string }>("select public.create_household('Семья', 'Тёма', '#1FA463') as id")).id;
    const sonId = (await one<{ id: string }>('select id from public.members where user_id = $1', [SON])).id;
    const son: Member = { id: sonId, household_id: hh, user_id: SON, name: 'Тёма', color: '#1FA463', role: 'parent', is_owner: true, portion: 1 };
    const phone = createLocalDb(`c-${Math.random()}`);

    await saveWish(phone, son, { owner_id: sonId, title: 'Велосипед', price: 25000 });
    const wish = (await phone.wishes.toArray())[0];
    await putIn(phone, son, { wish }, 1500, true);
    expect((await pushOutbox(phone, pgClient(pg, SON) as never)).rejected).toEqual([]);
    expect(await one<{ amount: number }>('select amount from public.deposits')).toEqual({ amount: 1500 });

    // A pull brings the row back as PostgREST sends it (timestamps as text), then the author takes it back.
    const pulled = await one<{ row: Record<string, unknown> }>('select to_jsonb(d) as row from public.deposits d');
    await phone.deposits.put(pulled.row as never);
    await takeBack(phone, (await phone.deposits.toArray())[0]);
    const r = await pushOutbox(phone, pgClient(pg, SON) as never);
    expect(r.rejected).toEqual([]);
    expect(r.stopped).toBeNull();
    expect((await one<{ deleted_at: string | null }>('select deleted_at from public.deposits')).deleted_at).not.toBeNull();
  });
});
