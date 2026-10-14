// Test double for the few supabase-js calls the sync engine makes.
type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

export function fakeSupabase(store: Store, keyFields: Record<string, string[]>) {
  type Err = { message: string; code: string };
  const state = { offline: false, rejects: new Map<string, Err>(), writeFails: new Map<string, Err>(), readFails: new Set<string>(), hangs: new Set<string>(), clock: 1, requests: new Map<string, number>() };
  const key = (t: string, r: Row) => keyFields[t].map((k) => String(r[k])).join('|');
  const stamp = () => new Date(Date.UTC(2026, 9, 14, 0, 0, state.clock++)).toISOString();
  const failNet = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };

  function from(table: string) {
    store[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    const order: Array<{ k: string; asc: boolean }> = [];
    let range: [number, number] | null = null;
    const exec = () => {
      if (state.offline) return failNet;
      if (state.readFails.delete(table)) return { data: null, error: { message: 'upstream connect error', code: '' } };
      let rows = store[table].filter((r) => filters.every((f) => f(r)));
      // Like Postgres, rows that tie on the order keys come back in no fixed order: flip ties on every other request.
      const n = state.requests.get(table) ?? 0;
      state.requests.set(table, n + 1);
      const flip = n % 2 === 1;
      if (order.length) {
        rows = rows.map((r, i) => ({ r, i })).sort((a, b) => {
          for (const { k, asc } of order) { const c = String(a.r[k]).localeCompare(String(b.r[k]), 'en', { numeric: true }); if (c) return asc ? c : -c; }
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
      order: (c: string, o?: { ascending?: boolean }) => { order.push({ k: c, asc: o?.ascending !== false }); return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      maybeSingle: () => Promise.resolve(((r) => (r.error ? r : { data: r.data?.[0] ?? null, error: null }))(exec())),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => (state.hangs.has(table) ? new Promise(() => {}) : Promise.resolve(exec())).then(res, rej),
      upsert: (rows: Row | Row[]) => {
        const fail = writeFail(table);
        if (fail) return Promise.resolve(fail);
        put(table, Array.isArray(rows) ? rows : [rows]);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  }

  function writeFail(name: string) {
    if (state.offline) return failNet;
    const once = state.writeFails.get(name);
    if (once) { state.writeFails.delete(name); return { data: null, error: once }; }
    const reject = state.rejects.get(name);
    return reject ? { data: null, error: reject } : null;
  }

  function put(table: string, rows: Row[]) {
    store[table] ??= [];
    for (const r of rows) {
      const k = key(table, r);
      const i = store[table].findIndex((x) => key(table, x) === k);
      const next = { ...(i >= 0 ? store[table][i] : {}), ...r, updated_at: stamp() };
      if (i >= 0) store[table][i] = next; else store[table].push(next);
    }
  }

  // save_week: the week and its meals in one transaction, with the one-week-per-Monday rule.
  function rpc(name: string, args: { p_week: Row; p_slots: Row[] }) {
    const fail = writeFail(`rpc:${name}`);
    if (fail) return Promise.resolve(fail);
    const w = args.p_week;
    const clash = (store.weeks ?? []).find((x) => x.id !== w.id && x.household_id === w.household_id && x.starts_on === w.starts_on);
    if (clash) return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "weeks_household_id_starts_on_key"', code: '23505' } });
    put('weeks', [w]);
    put('week_slots', args.p_slots.map((sl) => ({ ...sl, week_id: w.id, household_id: w.household_id })));
    return Promise.resolve({ data: null, error: null });
  }

  return {
    client: { from, rpc } as unknown,
    setOffline(v: boolean) { state.offline = v; },
    reject(table: string, message: string, code = 'P0001') { state.rejects.set(table, { message, code }); },
    failWrite(table: string, error: Err) { state.writeFails.set(table, error); },
    failRead(table: string) { state.readFails.add(table); },
    hang(table: string) { state.hangs.add(table); },
    serverRow(table: string, r: Row) { store[table] ??= []; store[table].push({ ...r, updated_at: stamp() }); },
  };
}
