import type { Ingredient, SimpleSnack } from '../../data/db';
import { MEALS, type Meal } from '../menu/week';

export type SlotIn = { day: number; meal: Meal; dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null };
export type ListLine = { item: string; qty: number | null; unit: string; dept: string; est: number | null };
export type BuildInput = {
  slots: SlotIn[];
  servings: Map<string, number>;
  ingredientsOf: Map<string, Array<{ item: string; qty: number | null }>>;
  vocab: Map<string, Ingredient>;
  prices: Map<string, number>;
  portions: number;
  // Soups are cooked as a whole pot; without this every lunch counts as a soup (true for menu weeks).
  isSoup?: (id: string) => boolean;
};

export const DEPT_ORDER = ['Овощи и фрукты', 'Хлеб', 'Молочное и яйца', 'Мясо и птица', 'Рыба', 'Заморозка', 'Бакалея', 'Консервы и соусы', 'Специи', 'Одежда и обувь', 'Для дома', 'Другое'];
export const deptRank = (d: string) => { const i = DEPT_ORDER.indexOf(d); return i < 0 ? DEPT_ORDER.length : i; };

// Mirrors content/tools/week_cost.py so the list and the template prices agree.
export function buildMenuList(inp: BuildInput): ListLine[] {
  const qty = new Map<string, number | null>();
  const add = (rows: Array<{ item: string; qty: number | null }>, factor: number) => {
    for (const r of rows) {
      if (inp.vocab.get(r.item)?.pantry) continue;
      if (r.qty === null || r.qty === undefined) { if (!qty.has(r.item)) qty.set(r.item, null); continue; }
      qty.set(r.item, (qty.get(r.item) ?? 0) + Number(r.qty) * factor);
    }
  };
  const soup = (id: string, meal: Meal) => (inp.isSoup ? inp.isSoup(id) : meal === 'lunch');
  const dish = (id: string | null) => {
    const serv = id ? inp.servings.get(id) : undefined;
    if (id && serv) add(inp.ingredientsOf.get(id) ?? [], inp.portions / serv);
  };
  const slots = [...inp.slots].sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  // A pot of soup is cooked once for consecutive days: the whole recipe, not per portion.
  let prevSoup: string | null = null;
  for (let day = 0; day < 7; day += 1) {
    const pot = slots.find((s) => s.day === day && s.dish_id && soup(s.dish_id, s.meal))?.dish_id ?? null;
    if (pot && pot !== prevSoup) add(inp.ingredientsOf.get(pot) ?? [], 1);
    prevSoup = pot;
  }
  for (const s of slots) {
    if (!(s.dish_id && soup(s.dish_id, s.meal))) dish(s.dish_id);
    dish(s.side_id);
    dish(s.salad_id);
    if (s.simple) add(s.simple.items, inp.portions);
  }
  const out: ListLine[] = [];
  for (const [item, q] of qty) {
    const v = inp.vocab.get(item);
    const price = inp.prices.get(item);
    out.push({ item, qty: q, unit: v?.unit ?? 'г', dept: v?.dept ?? 'Другое', est: q !== null && price !== undefined ? q * price : null });
  }
  return out.sort((a, b) => deptRank(a.dept) - deptRank(b.dept) || a.item.localeCompare(b.item, 'ru'));
}

const dec = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export function formatQty(qty: number | null, unit: string): string {
  if (qty === null) return 'по вкусу';
  if (unit === 'шт') return `${Math.max(1, Math.ceil(qty - 0.05))} шт`;
  const step = Math.max(50, Math.ceil(qty / 50) * 50);
  if (step >= 1000) return `${dec(Math.ceil(qty / 100) / 10)} ${unit === 'мл' ? 'л' : 'кг'}`;
  return `${step} ${unit}`;
}

// The sign never wraps away from the number.
export const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')}\u00A0₽`;

export function listTotals(rows: Array<{ est: number | null; real: number | null; bought: boolean }>) {
  let bought = 0; let left = 0; let unpriced = 0; let doneCount = 0;
  for (const r of rows) {
    if (r.bought) { doneCount += 1; bought += r.real ?? r.est ?? 0; } else if (r.est === null) unpriced += 1; else left += r.est;
  }
  return { count: rows.length, doneCount, bought: Math.round(bought), left: Math.round(left), unpriced };
}
