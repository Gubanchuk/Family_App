export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Завтрак', lunch: 'Обед', snack: 'Полдник', dinner: 'Ужин' };
export const MEAL_TIME: Record<Meal, string> = { breakfast: '08:00', lunch: '13:00', snack: '16:30', dinner: '19:00' };
export type SlotLike = { day: number; meal: Meal; dish_id: string | null };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const dayOfWeek = (d: Date) => (d.getDay() + 6) % 7;

export function mondayOf(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - dayOfWeek(m));
  return iso(m);
}

export function addDaysIso(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function weekLabel(start: string): string {
  const a = parse(start);
  const b = parse(addDaysIso(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export function soupBatches(slots: SlotLike[]): Array<{ dish_id: string; from: number; to: number }> {
  const byDay = new Map<number, string | null>();
  slots.filter((s) => s.meal === 'lunch').forEach((s) => byDay.set(s.day, s.dish_id));
  const out: Array<{ dish_id: string; from: number; to: number }> = [];
  for (let d = 0; d < 7; d += 1) {
    const id = byDay.get(d) ?? null;
    const last = out[out.length - 1];
    if (!id) continue;
    if (last && last.dish_id === id && last.to === d - 1) last.to = d;
    else out.push({ dish_id: id, from: d, to: d });
  }
  return out;
}

export function soupOn(slots: SlotLike[], day: number) {
  const b = soupBatches(slots).find((x) => day >= x.from && day <= x.to);
  return b ? { dish_id: b.dish_id, nth: day - b.from + 1, of: b.to - b.from + 1 } : null;
}

export function fitsMeal(r: { category: string; meals: string[] }, meal: Meal): boolean {
  if (meal === 'lunch') return r.category === 'soup';
  if (meal === 'dinner') return r.category === 'main';
  if (meal === 'snack') return ['snack', 'dessert', 'drink'].includes(r.category) || r.meals.includes('snack');
  return r.category === 'breakfast' || r.meals.includes('breakfast');
}

export const products = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'продукт' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'продукта' : 'продуктов');
