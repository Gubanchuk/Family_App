import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(root, 'supabase/tests/bootstrap.sql'), 'utf8'));
  const dir = join(root, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}

export async function asUser(db: PGlite, userId: string | null, sql: string, params: unknown[] = []) {
  const role = userId ? 'authenticated' : 'anon';
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

export async function addUser(db: PGlite, id: string, email = `${id.slice(0, 4)}@test.local`) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}
