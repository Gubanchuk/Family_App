import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalDb } from './db';

type Client = Pick<SupabaseClient, 'from'>;
type Row = Record<string, unknown>;
const PAGE = 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
// Order by the full primary key: offset paging over a non-unique order can skip or repeat rows.
const TABLES = [
  { name: 'ingredients', order: ['item'] },
  { name: 'prices', order: ['item'] },
  { name: 'recipes', order: ['id'] },
  { name: 'recipe_ingredients', order: ['recipe_id', 'pos'] },
  { name: 'recipe_sides', order: ['recipe_id', 'side_id'] },
] as const;

async function fetchAll(client: Client, table: string, order: readonly string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*');
    for (const k of order) q = q.order(k);
    const { data, error } = await (q.range(from, from + PAGE - 1) as unknown as Promise<{ data: Row[] | null; error: { message: string } | null }>);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

// The newest recipe change on the server. One row, so it is cheap to ask on every sync:
// a content update reaches the phones on their next sync instead of within a week.
async function serverVersion(client: Client): Promise<string | null> {
  try {
    const { data, error } = await (client.from('recipes').select('updated_at').order('updated_at', { ascending: false }).range(0, 0) as unknown as Promise<{ data: Row[] | null; error: unknown }>);
    return error || !data?.length ? null : String(data[0].updated_at);
  } catch { return null; }
}

const newest = (rows: Row[]) => rows.reduce((max, r) => (String(r.updated_at) > max ? String(r.updated_at) : max), '');

export async function loadContent(db: LocalDb, client: Client, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const at = (await db.meta.get('content_loaded_at'))?.value as string | undefined;
  if (!opts.force && at && now.getTime() - new Date(at).getTime() < WEEK_MS) {
    const version = (await db.meta.get('content_version'))?.value as string | undefined;
    const server = await serverVersion(client);
    if (server === null || server === version) return { loaded: false, counts: {} };
  }
  let fetched: Record<string, Row[]>;
  try {
    fetched = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t.name, await fetchAll(client, t.name, t.order)] as const)));
  } catch {
    // Offline or blocked: keep the copy the phone already has.
    return { loaded: false, counts: {} };
  }
  // An empty base means the answer was wrong (for example read without a session), not that recipes vanished.
  if (!fetched.recipes.length || !fetched.ingredients.length) return { loaded: false, counts: {} };
  await db.transaction('rw', [...TABLES.map((t) => db.table(t.name)), db.meta], async () => {
    for (const t of TABLES) {
      await db.table(t.name).clear();
      await db.table(t.name).bulkPut(fetched[t.name]);
    }
    await db.meta.put({ key: 'content_loaded_at', value: now.toISOString() });
    await db.meta.put({ key: 'content_version', value: newest(fetched.recipes) });
  });
  return { loaded: true, counts: Object.fromEntries(TABLES.map((t) => [t.name, fetched[t.name].length])) };
}
