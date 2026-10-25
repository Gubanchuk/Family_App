import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { stockKey } from './stock';

// Lines for one product («Молоко 2 л» from Mum and «Молоко 1,8 л» from the menu) show as one row. They stay
// separate lines underneath, each with its own author and mark; only lines in the same state (both still to
// buy, or both bought) join, so a half-bought product is not hidden in «Куплено».
export type Same = { key: string; lines: ShoppingItem[] };

const closed = (m: ShoppingMark | undefined) => !!(m?.bought || m?.at_home);

export function joinSame(items: ShoppingItem[], marks: Map<string, ShoppingMark>): Same[] {
  const out: Same[] = [];
  const at = new Map<string, Same>();
  for (const i of items) {
    const key = `${stockKey(i)}|${closed(marks.get(i.id)) ? 'c' : 'o'}`;
    const s = at.get(key);
    if (s) s.lines.push(i);
    else { const n = { key, lines: [i] }; at.set(key, n); out.push(n); }
  }
  return out;
}

// What a joined row says under its name: each part's amount and where it came from.
export const partsText = (s: Same, origin: (l: ShoppingItem) => string) =>
  s.lines.map((l) => [l.qty_text, origin(l)].filter(Boolean).join(' · ')).join(' + ');

// The price of the joined row: what was paid where known, else the estimate; null when no part has a price.
export function samePrice(s: Same, marks: Map<string, ShoppingMark>): number | null {
  let sum = 0;
  let any = false;
  for (const l of s.lines) {
    const p = marks.get(l.id)?.price_real ?? l.est_price;
    if (p !== null && p !== undefined) { sum += p; any = true; }
  }
  return any ? Math.round(sum) : null;
}
