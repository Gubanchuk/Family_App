// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000d1';
const MAMA = '00000000-0000-0000-0000-0000000000d2';
const SON = '00000000-0000-0000-0000-0000000000d3';
const STRANGER = '00000000-0000-0000-0000-0000000000d4';
const P = '00000000-0000-0000-0000-00000000e001';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};
const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];

describe('money', { timeout: 60_000 }, () => {
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

  it('keeps payments, marks and entries to the parents of the family', async () => {
    await asUser(db, MAMA, "insert into public.payments (id, household_id, title, amount, day, kind) values ($1, $2, 'Интернет', 650, 16, 'monthly')", [P, hh]);
    await asUser(db, PAPA, "insert into public.payment_marks (payment_id, month, household_id, paid, amount, paid_by, paid_on) values ($1, '2026-10', $2, true, 650, $3, '2026-10-15') on conflict (payment_id, month) do update set paid = excluded.paid", [P, hh, m['Андрей']]);
    await asUser(db, PAPA, "insert into public.money_entries (household_id, kind, amount, category, member_id, on_date) values ($1, 'expense', 1200, 'Продукты', $2, '2026-10-15')", [hh, m['Андрей']]);
    expect((await rows(MAMA, 'select * from public.payments')).length).toBe(1);
    expect((await rows(MAMA, 'select * from public.payment_marks')).length).toBe(1);
    expect((await rows(MAMA, 'select * from public.money_entries')).length).toBe(1);
    for (const u of [SON, STRANGER]) {
      expect(await rows(u, 'select * from public.payments')).toEqual([]);
      expect(await rows(u, 'select * from public.payment_marks')).toEqual([]);
      expect(await rows(u, 'select * from public.money_entries')).toEqual([]);
    }
    await expect(asUser(db, SON, "insert into public.money_entries (household_id, kind, amount, on_date) values ($1, 'expense', 1, '2026-10-15')", [hh])).rejects.toThrow();
    await expect(asUser(db, SON, "insert into public.payments (household_id, title, amount, day, kind) values ($1, 'x', 1, 1, 'monthly')", [hh])).rejects.toThrow();
  });

  it('checks an installment has its count and first month', async () => {
    await expect(asUser(db, MAMA, "insert into public.payments (household_id, title, amount, day, kind) values ($1, 'Телефон', 5300, 25, 'installment')", [hh])).rejects.toThrow();
    await asUser(db, MAMA, "insert into public.payments (household_id, title, amount, day, kind, total, first_month) values ($1, 'Телефон', 5300, 25, 'installment', 12, '2026-03')", [hh]);
  });

  it('turns payment pushes on by default', async () => {
    expect(await rows(PAPA, "select notify->>'payments' as p from public.member_settings where member_id = $1", [m['Оля']])).toEqual([{ p: 'true' }]);
  });

  it('logs a payment reminder once per payment, month and kind, so a repeated cron call sends nothing new', async () => {
    const log = (version: string) => db.query("insert into public.push_log (kind, ref_id, version) values ('payments_due', $1, $2)", [P, version]);
    await log('2026-10:soon');
    await expect(log('2026-10:soon')).rejects.toThrow();
    await log('2026-10:today');
  });
});

