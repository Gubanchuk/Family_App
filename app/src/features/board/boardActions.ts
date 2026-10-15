import { writeLocal } from '../../data/sync';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Goal, GoalStep, Need, Request, Wish } from './types';

const now = () => new Date().toISOString();

export async function saveWish(db: LocalDb, me: Member, w: { id?: string; owner_id: string; title: string; price: number | null }, prev?: Wish) {
  await writeLocal(db, 'wishes', [{
    id: w.id ?? crypto.randomUUID(), household_id: me.household_id, owner_id: w.owner_id, title: w.title.trim(), price: w.price,
    saved: prev?.saved ?? 0, done_at: prev?.done_at ?? null, created_by: prev?.created_by ?? me.id, deleted_at: null,
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

export async function saveNeed(db: LocalDb, me: Member, n: { id?: string; for_id: string | null; title: string; note: string; due_on: string | null; price: number | null }, prev?: Need) {
  await writeLocal(db, 'needs', [{
    id: n.id ?? crypto.randomUUID(), household_id: me.household_id, for_id: n.for_id, title: n.title.trim(), note: n.note.trim(), due_on: n.due_on, price: n.price,
    created_by: prev?.created_by ?? me.id, deleted_at: null,
  }]);
}
export const removeNeed = (db: LocalDb, n: Need) => writeLocal(db, 'needs', [{ ...n, deleted_at: now() }]);

export async function saveGoal(db: LocalDb, me: Member, g: { id?: string; owner_id: string | null; title: string; target: number; steps: GoalStep[] }, prev?: Goal) {
  await writeLocal(db, 'goals', [{
    id: g.id ?? crypto.randomUUID(), household_id: me.household_id, owner_id: g.owner_id, title: g.title.trim(), target: Math.round(g.target),
    saved: prev?.saved ?? 0, steps: g.steps, created_by: prev?.created_by ?? me.id, deleted_at: null,
  }]);
}
export const addToGoal = (db: LocalDb, g: Goal, sum: number) => writeLocal(db, 'goals', [{ ...g, saved: Math.min(MAX_SAVED, Math.max(0, g.saved + Math.round(sum))) }]);
export const toggleStep = (db: LocalDb, g: Goal, stepId: string) => writeLocal(db, 'goals', [{ ...g, steps: g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)) }]);
export const removeGoal = (db: LocalDb, g: Goal) => writeLocal(db, 'goals', [{ ...g, deleted_at: now() }]);

export async function askFor(db: LocalDb, me: Member, r: { to_id: string; title: string; due_on: string | null; urgent: boolean }) {
  await writeLocal(db, 'requests', [{ id: crypto.randomUUID(), household_id: me.household_id, from_id: me.id, to_id: r.to_id, title: r.title.trim(), due_on: r.due_on, urgent: r.urgent, status: 'open', done_at: null, deleted_at: null }]);
}
export const setRequestDone = (db: LocalDb, r: Request, done: boolean) => writeLocal(db, 'requests', [{ ...r, status: done ? 'done' : 'open', done_at: done ? now() : null }]);
export const cancelRequest = (db: LocalDb, r: Request) => writeLocal(db, 'requests', [{ ...r, status: 'cancelled' }]);
