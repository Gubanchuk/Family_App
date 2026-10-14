import type { LocalDb } from '../../data/db';

// Signing out wipes this phone's copy of the family, so the next account never sends someone else's changes.
export async function signOutHere(a: { db: LocalDb; signOut: () => Promise<unknown>; force: boolean }): Promise<{ done: boolean; pending: number }> {
  const pending = await a.db.outbox.count();
  if (pending && !a.force) return { done: false, pending };
  await a.signOut();
  await Promise.all(a.db.tables.map((t) => t.clear()));
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('fa.members.')) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
  return { done: true, pending };
}
