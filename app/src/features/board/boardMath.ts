import type { Kin } from '../family/kin';
import type { Goal } from './types';

export const progress = (saved: number, target: number | null) => (target && target > 0 ? Math.min(1, Math.max(0, saved / target)) : 0);
export const nextStep = (g: Goal) => { const s = g.steps.find((x) => !x.done); return s ? s.t.charAt(0).toLowerCase() + s.t.slice(1) : null; };
export const stepsDone = (g: Goal): [number, number] => [g.steps.filter((s) => s.done).length, g.steps.length];
export const memberName = (members: Array<{ id: string; name: string }>, id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? 'Кто-то';

const FROM: Partial<Record<Kin, string>> = { mother: 'от мамы', father: 'от папы', grandmother: 'от бабушки', grandfather: 'от дедушки' };
// «Подарок от мамы»; without a known kin the name stays in the nominative after a colon.
export const giftLine = (giver: { name: string; kin?: Kin | null } | undefined) =>
  giver?.kin && FROM[giver.kin] ? `Подарок ${FROM[giver.kin]}` : `Подарок: ${giver?.name ?? 'кто-то'}`;

// A sum typed by hand, in whole rubles. Anything over ten million is a slip of the finger; refusing it
// here matters, because the server would refuse it on every sync and hold back the phone's other changes.
export const MAX_RUB = 10_000_000;
export function parseRub(s: string): number | null {
  const n = Math.round(Number(s.replace(/\s/g, '').replace(',', '.')));
  return Number.isFinite(n) && n > 0 && n <= MAX_RUB ? n : null;
}
// An optional sum is fine when empty or valid.
export const rubOk = (s: string) => !s.trim() || parseRub(s) !== null;

// Deposits per wish or goal id; the piggy bank is the old saved column plus these.
export function bankOf(deposits: Array<{ wish_id: string | null; goal_id: string | null; amount: number; deleted_at: string | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of deposits) {
    const id = d.wish_id ?? d.goal_id;
    if (!id || d.deleted_at) continue;
    out.set(id, (out.get(id) ?? 0) + d.amount);
  }
  return out;
}
export const savedIn = (bank: Map<string, number>, x: { id: string; saved: number }) => x.saved + (bank.get(x.id) ?? 0);

// A wish and a goal for the same thing («Велосипед» and «Новый велосипед») keep two piggy banks with different
// sums. The cards say so, and the forms point at the one that already exists.
export type Twin = { id: string; title: string; owner_id: string | null; saved: number; total: number | null };
const FILLER = new Set(['новый', 'новая', 'новое', 'новые', 'свой', 'своя', 'свое', 'свои', 'себе', 'хочу', 'купить', 'подарок']);
// Word starts stand in for word forms: «велосипед», «велосипеда», «велосипедик».
const stems = (title: string) => new Set(title.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/)
  .filter((w) => w.length >= 4 && !FILLER.has(w)).map((w) => w.slice(0, 5)));
export function twinOf(title: string, owner: string | null, others: Twin[]): Twin | null {
  const mine = stems(title);
  if (!mine.size) return null;
  return others.find((o) => o.owner_id === owner && [...stems(o.title)].some((s) => mine.has(s))) ?? null;
}

