// A stand-in for supabase-js that runs requests on PGlite the way PostgREST would:
// upserts list only the payload's columns and read them through json_populate_record,
// so type errors in what the app queues show up exactly as on the real server.
import type { PGlite } from '@electric-sql/pglite';
import { asUser } from '../db/harness';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code: string } | null };

export function pgClient(db: PGlite, userId: string) {
  const run = async (sql: string, params: unknown[]): Promise<Result> => {
    try { return { data: (await asUser(db, userId, sql, params)).rows, error: null }; } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: String((e as { code?: string }).code ?? '') } };
    }
  };
  const quote = (c: string) => `"${c}"`;
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const exec = () => {
        const where = filters.length ? ` where ${filters.map(([c], i) => `${quote(c)} = $${i + 1}`).join(' and ')}` : '';
        return run(`select * from public.${table}${where}`, filters.map(([, v]) => v));
      };
      const q = {
        upsert: (row: Row, opts: { onConflict: string }) => {
          const cols = Object.keys(row);
          const keys = opts.onConflict.split(',');
          const set = cols.filter((c) => !keys.includes(c)).map((c) => `${quote(c)} = excluded.${quote(c)}`);
          const action = set.length ? `update set ${set.join(', ')}` : 'nothing';
          const sql = `insert into public.${table} (${cols.map(quote).join(', ')}) select ${cols.map(quote).join(', ')} from json_populate_record(null::public.${table}, $1::json) on conflict (${keys.join(', ')}) do ${action}`;
          return run(sql, [JSON.stringify(row)]);
        },
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        maybeSingle: async () => {
          const r = await exec();
          return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
        },
        then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => exec().then(res, rej),
      };
      return q;
    },
    rpc: (name: string, args: { p_week: unknown; p_slots: unknown }) =>
      run(`select public.${name}($1::jsonb, $2::jsonb)`, [JSON.stringify(args.p_week), JSON.stringify(args.p_slots)]),
  };
}
