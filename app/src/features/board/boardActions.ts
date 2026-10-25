import { writeLocal } from '../../data/sync';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Goal, GoalStep, Need, Request, Wish, Deposit } from './types';

const now = () => new Date().toISOString();

// Columns of later migrations go out only when given or when the stored row already has them:
// a column the server lacks would make it refuse the whole row.
type Later = { photo_path?: string | null; visible_to?: string[] | null; dept?: string | null };
function later(given: Later, prev: object | undefined, keys: Array<keyof Later>) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (given[k] !== undefined) out[k] = given[k];
    else if (prev && k in prev) out[k] = (prev as Record<string, unknown>)[k];
  }
  return out;
}

export async function saveWish(db: LocalDb, me: Member, w: { id?: string; owner_id: string; title: string; price: number | null } & Later, prev?: Wish) {
  await writeLocal(db, 'wishes', [{
    id: w.id ?? crypto.randomUUID(), household_id: me.household_id, owner_id: w.owner_id, title: w.title.trim(), price: w.price,
    saved: prev?.saved ?? 0, done_at: prev?.done_at ?? null, ...later(w, prev, ['photo_path', 'visible_to']), created_by: prev?.created_by ?? me.id, deleted_at: null,
  }]);
}
// The piggy bank stays within what the server's integer column holds.
const MAX_SAVED = 2_000_000_000;
export const addToWish = (db: LocalDb, w: Wish, sum: number) => writeLocal(db, 'wishes', [{ ...w, saved: Math.min(MAX_SAVED, Math.max(0, w.saved + Math.round(sum))) }]);
export const wishDone = (db: LocalDb, w: Wish) => writeLocal(db, 'wishes', [{ ...w, done_at: now() }]);
export const removeWish = (db: LocalDb, w: Wish) => writeLocal(db, 'wishes', [{ ...w, deleted_at: now() }]);
export const toggleMetoo = (db: LocalDb, w: Wish, me: Member, on: boolean) =>
  writeLocal(db, 'wish_metoo', [{ wish_id: w.id, member_id: me.id, household_id: w.household_id, deleted_at: on ? null : now() }]);
export const setGift = (db: LocalDb, w: Wish, me: Member, on: boolean) =>
  writeLocal(db, 'wish_gifts', [{ wish_id: w.id, giver_id: me.id, household_id: w.household_id, deleted_at: on ? null : now() }]);

export async function saveNeed(db: LocalDb, me: Member, n: { id?: string; for_id: string | null; title: string; note: string; due_on: string | null; price: number | null } & Later, prev?: Need) {
  await writeLocal(db, 'needs', [{
    id: n.id ?? crypto.randomUUID(), household_id: me.household_id, for_id: n.for_id, title: n.title.trim(), note: n.note.trim(), due_on: n.due_on, price: n.price,
    ...later(n, prev, ['dept', 'visible_to']), created_by: prev?.created_by ?? me.id, deleted_at: null,
  }]);
}
export const removeNeed = (db: LocalDb, n: Need) => writeLocal(db, 'needs', [{ ...n, deleted_at: now() }]);

export async function saveGoal(db: LocalDb, me: Member, g: { id?: string; owner_id: string | null; title: string; target: number; steps: GoalStep[] } & Later, prev?: Goal) {
  await writeLocal(db, 'goals', [{
    id: g.id ?? crypto.randomUUID(), household_id: me.household_id, owner_id: g.owner_id, title: g.title.trim(), target: Math.round(g.target),
    saved: prev?.saved ?? 0, steps: g.steps, ...later(g, prev, ['photo_path']), created_by: prev?.created_by ?? me.id, deleted_at: null,
  }]);
}
export const addToGoal = (db: LocalDb, g: Goal, sum: number) => writeLocal(db, 'goals', [{ ...g, saved: Math.min(MAX_SAVED, Math.max(0, g.saved + Math.round(sum))) }]);
export const toggleStep = (db: LocalDb, g: Goal, stepId: string) => writeLocal(db, 'goals', [{ ...g, steps: g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)) }]);
export const removeGoal = (db: LocalDb, g: Goal) => writeLocal(db, 'goals', [{ ...g, deleted_at: now() }]);

export async function askFor(db: LocalDb, me: Member, r: { to_id: string; title: string; due_on: string | null; urgent: boolean }) {
  await writeLocal(db, 'requests', [{ id: crypto.randomUUID(), household_id: me.household_id, from_id: me.id, to_id: r.to_id, title: r.title.trim(), due_on: r.due_on, urgent: r.urgent, status: 'open', done_at: null, deleted_at: null }]);
}
// Taking a tick back leaves the request taken when the family answers requests, waiting otherwise.
export const setRequestDone = (db: LocalDb, r: Request, done: boolean, answers = false) =>
  writeLocal(db, 'requests', [{ ...r, status: done ? 'done' : answers ? 'accepted' : 'open', done_at: done ? now() : null }]);
// The recipient's answer: «Хорошо» takes the request, «Не могу» declines it, «Передумал» takes the answer
// back and the request waits again; any of them can change later.
export const answerRequest = (db: LocalDb, r: Request, status: 'accepted' | 'declined' | 'open') => writeLocal(db, 'requests', [{ ...r, status, done_at: null }]);
export const cancelRequest = (db: LocalDb, r: Request) => writeLocal(db, 'requests', [{ ...r, status: 'cancelled' }]);

// A deposit is its own row, so two phones putting money in at once both count. Until the server has
// the deposits table, money goes into the old saved column as before.
export async function putIn(db: LocalDb, me: Member, target: { wish: Wish } | { goal: Goal }, sum: number, ready: boolean) {
  const amount = Math.round(sum);
  if (!ready) return 'wish' in target ? addToWish(db, target.wish, amount) : addToGoal(db, target.goal, amount);
  await writeLocal(db, 'deposits', [{
    id: crypto.randomUUID(), household_id: me.household_id, member_id: me.id, amount, deleted_at: null,
    wish_id: 'wish' in target ? target.wish.id : null, goal_id: 'goal' in target ? target.goal.id : null,
  }]);
}
export const takeBack = (db: LocalDb, d: Deposit) => writeLocal(db, 'deposits', [{ ...d, deleted_at: new Date().toISOString() }]);
// The author may take a deposit back within a day (the server allows no more).
export const canTakeBack = (d: Deposit, me: Member, now = Date.now()) => d.member_id === me.id && !d.deleted_at && (!d.created_at || now - Date.parse(d.created_at) < 23 * 3600_000);


// A wish and a goal for the same thing become one piggy bank. Deposits never change on the server, so the other
// item's whole sum (its old saved part and its deposits) joins the kept item's saved part, and the other item
// is removed; its deposits stay with it. Returns the moved sum and a way back, or null when either is gone.
type BankRef = { kind: 'wish' | 'goal'; id: string };
export async function joinBanks(db: LocalDb, keep: BankRef, drop: BankRef): Promise<{ moved: number; undo: () => Promise<void> } | null> {
  const row = (r: BankRef) => (r.kind === 'wish' ? db.wishes.get(r.id) : db.goals.get(r.id));
  const [kept, dropped] = await Promise.all([row(keep), row(drop)]);
  if (!kept || !dropped || kept.deleted_at || dropped.deleted_at) return null;
  const deposits = (await db.deposits.where('household_id').equals(dropped.household_id).toArray())
    .filter((d) => !d.deleted_at && (drop.kind === 'wish' ? d.wish_id : d.goal_id) === drop.id);
  const moved = dropped.saved + deposits.reduce((s, d) => s + d.amount, 0);
  const put = async (r: BankRef, x: Wish | Goal) => (r.kind === 'wish' ? writeLocal(db, 'wishes', [x as Wish]) : writeLocal(db, 'goals', [x as Goal]));
  // A wish without a price takes the goal's target: the goal knew how much is needed.
  const price = keep.kind === 'wish' && drop.kind === 'goal' && !(kept as Wish).price ? { price: (dropped as Goal).target } : {};
  await put(keep, { ...kept, ...price, saved: Math.min(MAX_SAVED, kept.saved + moved) });
  await put(drop, { ...dropped, deleted_at: now() });
  return {
    moved,
    undo: async () => {
      const k = await row(keep);
      if (k) await put(keep, { ...k, ...('price' in price ? { price: (kept as Wish).price } : {}), saved: Math.max(0, k.saved - moved) });
      const d = await row(drop);
      if (d) await put(drop, { ...d, deleted_at: null });
    },
  };
}
