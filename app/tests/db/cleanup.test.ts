// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addUser, asUser, createDb } from './harness';

const MAMA = '00000000-0000-0000-0000-0000000000d1';
const BOT_A = '00000000-0000-0000-0000-0000000000d2';
const BOT_B = '00000000-0000-0000-0000-0000000000d3';
const BOT_C = '00000000-0000-0000-0000-0000000000d4';
const script = readFileSync(join(resolve(__dirname, '../..'), 'e2e/cleanup.sql'), 'utf8');

describe('e2e cleanup script', { timeout: 60_000 }, () => {
  it('removes test accounts and their own families, and leaves a real family alone', async () => {
    const db = await createDb();
    await addUser(db, MAMA, 'mama@gmail.com');
    await addUser(db, BOT_A, 'e2e-x-1@example.com');
    await addUser(db, BOT_B, 'e2e-x-2@example.com');
    await addUser(db, BOT_C, 'e2e-x-3@example.com');
    const make = async (u: string, name: string) => (await asUser(db, u, 'select public.create_household($1, $2, \'#2F6FDB\') as id', [name, name])).rows[0] as { id: string };
    const real = await make(MAMA, 'Настоящая');
    const fake = await make(BOT_A, 'Тестовая');
    const code = (await asUser(db, BOT_A, "select public.create_invite($1, 'child') as c", [fake.id])).rows[0] as { c: string };
    await asUser(db, BOT_B, "select public.accept_invite($1, 'Сын', '#1FA463')", [code.c]);
    const realCode = (await asUser(db, MAMA, "select public.create_invite($1, 'child') as c", [real.id])).rows[0] as { c: string };
    await asUser(db, BOT_C, "select public.accept_invite($1, 'Гость', '#1FA463')", [realCode.c]);

    await db.exec(script);

    expect((await db.query('select name from public.households order by name')).rows).toEqual([{ name: 'Настоящая' }]);
    expect((await db.query('select email from auth.users')).rows).toEqual([{ email: 'mama@gmail.com' }]);
    expect((await db.query('select name, user_id from public.members order by name')).rows).toEqual([{ name: 'Настоящая', user_id: MAMA }]);
  });
});
