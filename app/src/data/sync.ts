import type { SupabaseClient } from '@supabase/supabase-js';
import { KEY_FIELDS, slotKey, type LocalDb, type SyncTable } from './db';

type Row = Record<string, unknown>;
type Client = Pick<SupabaseClient, 'from'>;
const PAGE = 1000;
const TABLES: SyncTable[] = ['week_templates', 'template_slots', 'weeks', 'week_slots', 'votes'];

const isNetwork = (message: string) => /fetch|network|timeout|load failed/i.test(message);
const tableOf = (db: LocalDb, t: SyncTable) => db.table(t);
const keyArray = (t: SyncTable, row: Row) => {
  const k = KEY_FIELDS[t].map((f) => row[f]);
  return k.length === 1 ? k[0] : k;
};

export async function writeLocal(db: LocalDb, table: SyncTable, rows: Row[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [tableOf(db, table), db.outbox], async () => {
    for (const row of rows) {
      await tableOf(db, table).put({ ...row, updated_at: now });
      await db.outbox.add({ table, row, created_at: now, tries: 0 });
    }
  });
}

export const pendingCount = (db: LocalDb) => db.outbox.count();

const REJECT_TEXT: Record<string, string> = {
  not_a_parent: 'Менять утверждённую неделю могут только родители. Вернули как было.',
  wrong_household: 'Это изменение относится к другой семье. Вернули как было.',
};

export function rejectionText(message: string): string {
  const key = Object.keys(REJECT_TEXT).find((k) => message.includes(k));
  return key ? REJECT_TEXT[key] : 'Сервер не принял изменение. Вернули как было.';
}

async function restoreFromServer(db: LocalDb, client: Client, table: SyncTable, row: Row) {
  let q = client.from(table).select('*') as unknown as { eq: (c: string, v: unknown) => typeof q; maybeSingle: () => Promise<{ data: Row | null; error: unknown }> };
  for (const f of KEY_FIELDS[table]) q = q.eq(f, row[f]);
  const { data, error } = await q.maybeSingle();
  if (error) return;
  if (data) await tableOf(db, table).put(data);
  else await tableOf(db, table).delete(keyArray(table, row) as never);
}

export async function pushOutbox(db: LocalDb, client: Client) {
  const rejected: string[] = [];
  let pushed = 0;
  for (const op of await db.outbox.orderBy('seq').toArray()) {
    const { error } = await client.from(op.table).upsert(op.row, { onConflict: KEY_FIELDS[op.table].join(',') });
    if (error && isNetwork(error.message)) {
      await db.outbox.update(op.seq!, { tries: op.tries + 1 });
      return { pushed, stopped: 'network' as const, rejected };
    }
    await db.outbox.delete(op.seq!);
    if (error) {
      rejected.push(error.message);
      // A later queued write for the same row would be refused for the same reason.
      const key = slotKey(op.table, op.row);
      for (const later of await db.outbox.where('table').equals(op.table).toArray()) {
        if (slotKey(later.table, later.row) === key) await db.outbox.delete(later.seq!);
      }
      await restoreFromServer(db, client, op.table, op.row);
    } else pushed += 1;
  }
  return { pushed, stopped: null, rejected };
}

export async function pullTable(db: LocalDb, client: Client, table: SyncTable): Promise<number> {
  const cursorKey = `cursor:${table}`;
  let cursor = ((await db.meta.get(cursorKey))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  const pending = new Set((await db.outbox.where('table').equals(table).toArray()).map((o) => slotKey(table, o.row)));
  let total = 0;
  for (;;) {
    const { data, error } = await (client.from(table).select('*').gt('updated_at', cursor).order('updated_at').range(0, PAGE - 1) as unknown as Promise<{ data: Row[] | null; error: { message: string } | null }>);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const fresh = rows.filter((r) => !pending.has(slotKey(table, r)));
    if (fresh.length) await tableOf(db, table).bulkPut(fresh);
    total += rows.length;
    if (rows.length) cursor = String(rows[rows.length - 1].updated_at);
    await db.meta.put({ key: cursorKey, value: cursor });
    if (rows.length < PAGE) return total;
  }
}

export async function syncNow(db: LocalDb, client: Client) {
  const push = await pushOutbox(db, client);
  if (push.stopped === 'network') return { pushed: push.pushed, pulled: 0, offline: true, rejected: push.rejected };
  let pulled = 0;
  try {
    for (const t of TABLES) pulled += await pullTable(db, client, t);
  } catch (e) {
    if (isNetwork((e as Error).message)) return { pushed: push.pushed, pulled, offline: true, rejected: push.rejected };
    throw e;
  }
  await db.meta.put({ key: 'synced_at', value: new Date().toISOString() });
  return { pushed: push.pushed, pulled, offline: false, rejected: push.rejected };
}
