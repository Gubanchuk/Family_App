import type { SupabaseClient } from '@supabase/supabase-js';
import { KEY_FIELDS, slotKey, type LocalDb, type OutboxOp, type SyncTable } from './db';

type Row = Record<string, unknown>;
type Client = Pick<SupabaseClient, 'from' | 'rpc'> & { auth?: Pick<SupabaseClient['auth'], 'getSession'> };
type ServerError = { message: string; code?: string };
const PAGE = 1000;
const TABLES: SyncTable[] = ['week_templates', 'template_slots', 'weeks', 'week_slots', 'votes', 'dish_offers', 'shopping_items', 'shopping_marks', 'shop_trips', 'not_eat',
  'wishes', 'wish_metoo', 'wish_gifts', 'needs', 'goals', 'requests', 'payments', 'payment_marks', 'money_entries', 'deposits', 'budgets'];

// Only the family's own rules refuse a change: our triggers (P0001), row level security (42501),
// constraints (23xxx). Everything else — no network, an expired token, a 5xx page, a sleeping
// database, and also a malformed value or a schema the app does not match yet — keeps the change
// queued: an app bug must never turn into deleted family data.
// 22xxx is bad data (an empty date, a number out of range): a retry can never succeed either.
const isRefusal = (e: ServerError) => /^(P0001|42501|2[23]\w{3})$/.test(e.code ?? '');

// A table the app knows but the server does not have yet (its migration is not applied):
// PostgREST answers PGRST205, Postgres 42P01. Sync passes it by instead of calling the server lost.
const isMissingTable = (e: ServerError) => e.code === 'PGRST205' || e.code === '42P01';

export const missingTables = async (db: LocalDb) => ((await db.meta.get('missing_tables'))?.value as string[] | undefined) ?? [];

// The server owns updated_at (a trigger stamps it); the phone's copy never travels.
const forServer = (row: Row) => { const { updated_at: _u, ...rest } = row; return rest; };

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
      await db.outbox.add({ table, row: forServer(row), created_at: now, tries: 0 });
    }
  });
}

// A week travels with all its meals in one server call, so nobody ever sees half a week.
export async function writeWeekLocal(db: LocalDb, week: Row, slots: Row[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.weeks, db.week_slots, db.votes, db.outbox], async () => {
    const prev = await db.weeks.get(String(week.id));
    if (prev && week.status === 'proposed' && (prev.template_id !== week.template_id || prev.proposed_by !== week.proposed_by)) {
      await db.votes.where('week_id').equals(String(week.id)).delete();
    }
    await db.weeks.put({ ...week, updated_at: now } as never);
    await db.week_slots.bulkPut(slots.map((s) => ({ ...s, updated_at: now })) as never);
    await db.outbox.add({ table: 'weeks', rpc: 'save_week', row: { p_week: forServer(week), p_slots: slots.map(forServer) }, created_at: now, tries: 0 });
  });
}

export const pendingCount = (db: LocalDb) => db.outbox.count();

const REJECT_TEXT: Record<string, string> = {
  not_a_parent: 'Менять утверждённую неделю могут только родители. Вернули как было.',
  wrong_household: 'Это изменение относится к другой семье. Вернули как было.',
  week_incomplete: 'Неделя ещё не дошла целиком. Подождите минуту и попробуйте снова.',
  weeks_household_id_starts_on_key: 'На эту неделю уже есть предложение. Посмотрите его в Меню.',
};

// The list keeps a bought line on its own; the parent who edited the menu needs no explanation.
const QUIET = ['already_bought'];

export function rejectionText(message: string): string {
  if (QUIET.some((k) => message.includes(k))) return '';
  const key = Object.keys(REJECT_TEXT).find((k) => message.includes(k));
  return key ? REJECT_TEXT[key] : 'Сервер не принял изменение. Вернули как было.';
}

const weekOf = (op: OutboxOp): string | null => {
  if (op.rpc === 'save_week') return String((op.row.p_week as Row).id);
  if (op.table === 'weeks') return String(op.row.id);
  return null;
};

async function restoreRow(db: LocalDb, client: Client, table: SyncTable, row: Row): Promise<boolean> {
  let q = client.from(table).select('*') as unknown as { eq: (c: string, v: unknown) => typeof q; maybeSingle: () => Promise<{ data: Row | null; error: unknown }> };
  for (const f of KEY_FIELDS[table]) q = q.eq(f, row[f]);
  const { data, error } = await q.maybeSingle();
  if (error) return false;
  if (data) await tableOf(db, table).put(data);
  else await tableOf(db, table).delete(keyArray(table, row) as never);
  return true;
}

async function restoreWeek(db: LocalDb, client: Client, id: string): Promise<boolean> {
  const list = (t: string) => client.from(t).select('*').eq('week_id', id) as unknown as Promise<{ data: Row[] | null; error: unknown }>;
  const [w, s, v] = await Promise.all([
    client.from('weeks').select('*').eq('id', id).maybeSingle() as unknown as Promise<{ data: Row | null; error: unknown }>,
    list('week_slots'), list('votes'),
  ]);
  if (w.error || s.error || v.error) return false;
  await db.transaction('rw', [db.weeks, db.week_slots, db.votes], async () => {
    await db.week_slots.where('week_id').equals(id).delete();
    await db.votes.where('week_id').equals(id).delete();
    if (!w.data) { await db.weeks.delete(id); return; }
    await db.weeks.put(w.data as never);
    await db.week_slots.bulkPut((s.data ?? []) as never);
    await db.votes.bulkPut((v.data ?? []) as never);
  });
  return true;
}

// Later queued writes to the same row, or to a refused week's meals and votes, would be refused too.
async function dropRelated(db: LocalDb, op: OutboxOp) {
  const week = weekOf(op);
  const key = op.rpc ? null : slotKey(op.table, op.row);
  for (const later of await db.outbox.toArray()) {
    const sameRow = key !== null && !later.rpc && later.table === op.table && slotKey(later.table, later.row) === key;
    const sameWeek = week !== null && (weekOf(later) === week || later.row.week_id === week);
    if (sameRow || sameWeek) await db.outbox.delete(later.seq!);
  }
}

export async function pushOutbox(db: LocalDb, client: Client) {
  const rejected: string[] = [];
  let pushed = 0;
  for (const op of await db.outbox.orderBy('seq').toArray()) {
    if (!(await db.outbox.get(op.seq!))) continue;
    const { error } = op.rpc
      ? await client.rpc(op.rpc, op.row)
      : await client.from(op.table).upsert(op.row, { onConflict: KEY_FIELDS[op.table].join(',') });
    if (!error) { await db.outbox.delete(op.seq!); pushed += 1; continue; }
    // A table the server does not have yet: this change waits for the migration, the rest go on.
    if (isMissingTable(error)) continue;
    const week = weekOf(op);
    // A refusal is only final once the phone holds the server's version again; otherwise retry later.
    const restored = isRefusal(error) && (week ? await restoreWeek(db, client, week) : await restoreRow(db, client, op.table, op.row));
    if (!restored) {
      await db.outbox.update(op.seq!, { tries: op.tries + 1 });
      return { pushed, stopped: 'network' as const, rejected };
    }
    await db.outbox.delete(op.seq!);
    await dropRelated(db, op);
    rejected.push(error.message);
  }
  return { pushed, stopped: null, rejected };
}

async function pendingKeys(db: LocalDb, table: SyncTable): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const op of await db.outbox.toArray()) {
    if (op.rpc === 'save_week') {
      const w = op.row.p_week as Row;
      if (table === 'weeks') keys.add(String(w.id));
      if (table === 'week_slots') for (const s of op.row.p_slots as Row[]) keys.add(slotKey('week_slots', { ...s, week_id: w.id }));
    } else if (op.table === table) keys.add(slotKey(table, op.row));
  }
  return keys;
}

export async function pullTable(db: LocalDb, client: Client, table: SyncTable): Promise<number | 'missing'> {
  const cursorKey = `cursor:${table}`;
  let cursor = ((await db.meta.get(cursorKey))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  const pending = await pendingKeys(db, table);
  let total = 0;
  for (;;) {
    const { data, error } = await (client.from(table).select('*').gt('updated_at', cursor).order('updated_at').range(0, PAGE - 1) as unknown as Promise<{ data: Row[] | null; error: ServerError | null }>);
    if (error) {
      if (isMissingTable(error)) return 'missing';
      throw new Error(error.message);
    }
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
  // Without a live session requests go out as an anonymous visitor and every change would look refused.
  if (client.auth && !(await client.auth.getSession()).data.session) return { pushed: 0, pulled: 0, offline: true, rejected: [] as string[] };
  const push = await pushOutbox(db, client);
  if (push.stopped === 'network') return { pushed: push.pushed, pulled: 0, offline: true, rejected: push.rejected };
  let pulled = 0;
  const missing: string[] = [];
  try {
    for (const t of TABLES) {
      const n = await pullTable(db, client, t);
      if (n === 'missing') missing.push(t); else pulled += n;
    }
  } catch {
    // Reading never refuses a change; any failure here means the server is out of reach for now.
    return { pushed: push.pushed, pulled, offline: true, rejected: push.rejected };
  }
  await db.meta.put({ key: 'missing_tables', value: missing });
  await db.meta.put({ key: 'synced_at', value: new Date().toISOString() });
  return { pushed: push.pushed, pulled, offline: false, rejected: push.rejected };
}
