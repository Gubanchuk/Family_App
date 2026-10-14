import type { Overlay } from './types';

export type Pt = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export function moved<T extends Overlay>(o: T, dx: number, dy: number, frame: { w: number; h: number }): T {
  return { ...o, x: clamp(o.x + dx / frame.w, 0, 1), y: clamp(o.y + dy / frame.h, 0, 1) };
}

// a0/b0: the two fingers when the pinch began, a1/b1: now; o is the item as it was at the start.
export function pinched<T extends Overlay>(o: T, a0: Pt, b0: Pt, a1: Pt, b1: Pt): T {
  const k = dist(a1, b1) / Math.max(1, dist(a0, b0));
  return { ...o, scale: clamp(o.scale * k, 0.04, 1.5), rotation: o.rotation + angle(a1, b1) - angle(a0, b0) };
}

export const overTrash = (p: Pt, frame: { w: number; h: number }) => p.y > frame.h - 96 && Math.abs(p.x - frame.w / 2) < 64;
