import type { Goal } from './types';

export const progress = (saved: number, target: number | null) => (target && target > 0 ? Math.min(1, Math.max(0, saved / target)) : 0);
export const nextStep = (g: Goal) => { const s = g.steps.find((x) => !x.done); return s ? s.t.charAt(0).toLowerCase() + s.t.slice(1) : null; };
export const stepsDone = (g: Goal): [number, number] => [g.steps.filter((s) => s.done).length, g.steps.length];
export const memberName = (members: Array<{ id: string; name: string }>, id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
