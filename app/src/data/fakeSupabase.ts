// Test double for the few supabase-js calls the sync engine makes.
type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

export function fakeSupabase(store: Store, keyFields: Record<string, string[]>) {
  const state = { offline: false, rejects: new Map<string, string>(), clock: 1, requests: new Map<string, number>() };
  const key = (t: string, r: Row) => keyFields[t].map((k) => String(r[k])).join('|');
  const stamp = () => new Date(Date.UTC(2026, 9, 14, 0, 0, state.clock++)).toISOString();
  const failNet = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };

  function from(table: string) {
    store[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    const order: string[] = [];
    let range: [number, number] | null = null;
    const exec = () => {
      if (state.offline) return failNet;
      let rows = store[table].filter((r) => filters.every((f) => f(r)));
      // Like Postgres, rows that tie on the order keys come back in no fixed order: flip ties on every other request.
      const n = state.requests.get(table) ?? 0;
      state.requests.set(table, n + 1);
      const flip = n % 2 === 1;
      if (order.length) {
        rows = rows.map((r, i) => ({ r, i })).sort((a, b) => {
          for (const k of order) { const c = String(a.r[k]).localeCompare(String(b.r[k]), 'en', { numeric: true }); if (c) return c; }
          return flip ? b.i - a.i : a.i - b.i;
        }).map((x) => x.r);
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q,
      gt: (c: string, v: string) => { filters.push((r) => String(r[c]) > v); return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      order: (c: string) => { order.push(c); return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      maybeSingle: () => Promise.resolve(((r) => (r.error ? r : { data: r.data?.[0] ?? null, error: null }))(exec())),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      upsert: (rows: Row | Row[]) => {
        if (state.offline) return Promise.resolve(failNet);
        const reject = state.rejects.get(table);
        if (reject) return Promise.resolve({ data: null, error: { message: reject, code: 'P0001' } });
        for (const r of Array.isArray(rows) ? rows : [rows]) {
          const k = key(table, r);
          const i = store[table].findIndex((x) => key(table, x) === k);
          const next = { ...(i >= 0 ? store[table][i] : {}), ...r, updated_at: stamp() };
          if (i >= 0) store[table][i] = next; else store[table].push(next);
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  }

  return {
    client: { from } as unknown,
    setOffline(v: boolean) { state.offline = v; },
    reject(table: string, message: string) { state.rejects.set(table, message); },
    serverRow(table: string, r: Row) { store[table] ??= []; store[table].push({ ...r, updated_at: stamp() }); },
  };
}
