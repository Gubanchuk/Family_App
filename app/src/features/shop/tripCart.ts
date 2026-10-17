import type { DishOffer, ShopTrip, ShoppingItem, ShoppingMark, TripLine, WeekSlot } from '../../data/db';
import { MEAL_FOR } from '../ideas/offerActions';
import { addDaysIso, MEAL_LABEL, soupOn, type Meal } from '../menu/week';
import { buildMenuList, formatQty, type BuildInput, type SlotIn } from './build';

// A cart for one trip to the shop: the week's list lines that the chosen meals, dishes or lines need.

// A trip lasts this long unless the shopper ends it, as the «… в магазине» banner always did.
export const TRIP_MS = 3 * 3600 * 1000;

// day counts on from this week's Monday: 0–6 this week, 7–13 next week.
export type Pick = { kind: 'meal'; day: number; meal: Meal } | { kind: 'dish'; day: number; dish_id: string };
type Skip = { item: string; why: 'bought' | 'home' | 'pantry' | 'absent' };

const ON_DAY = ['на понедельник', 'на вторник', 'на среду', 'на четверг', 'на пятницу', 'на субботу', 'на воскресенье'];

const live = (o: DishOffer, date: string, meal: Meal) => o.on_date === date && o.meal === meal && !o.deleted_at && o.status === 'taken';

// What a meal of the menu is cooked from: its dish with side and salad, or a dish taken «instead» of it,
// plus dishes taken «поверх меню» for that meal. A soup from a pot started on an earlier day needs nothing.
export function dishesOf(pick: Pick, slots: WeekSlot[], offers: DishOffer[], weekStart: string): string[] {
  if (pick.kind === 'dish') return [pick.dish_id];
  const date = addDaysIso(weekStart, pick.day);
  const over = offers.filter((o) => live(o, date, pick.meal) && o.how === 'over').map((o) => o.dish_id);
  const instead = offers.find((o) => live(o, date, pick.meal) && o.how === 'instead');
  if (instead) return [instead.dish_id, ...over];
  const s = slots.find((x) => x.day === pick.day && x.meal === pick.meal);
  // Soup pots run within one week: read the pick's own week.
  const off = pick.day >= 7 ? 7 : 0;
  const week = slots.filter((x) => x.day >= off && x.day < off + 7).map((x) => ({ ...x, day: x.day - off }));
  const pot = pick.meal === 'lunch' ? soupOn(week, pick.day - off) : null;
  const cooked = pot && pot.nth > 1 && pot.dish_id === s?.dish_id ? null : s?.dish_id ?? null;
  return [cooked, s?.side_id ?? null, s?.salad_id ?? null, ...over].filter((x): x is string => !!x);
}

// weekIds: the list weeks of days 0–6 and 7–13; a menu line is taken only for picks of its own week.
export function cartFromPicks(inp: {
  picks: Pick[]; slots: WeekSlot[]; offers: DishOffer[]; weekStart: string; build: Omit<BuildInput, 'slots'>;
  lines: ShoppingItem[]; marks: Map<string, ShoppingMark>; dishName: (id: string) => string; weekIds?: [string | null, string | null];
}): { lines: TripLine[]; skipped: Skip[] } {
  // Each dish of each day once: a meal and the same dish of that day picked again are one cooking.
  const seen = new Set<string>();
  const slotIns: SlotIn[] = [];
  for (const p of inp.picks) {
    const meal: Meal = p.kind === 'meal' ? p.meal : 'dinner';
    for (const id of dishesOf(p, inp.slots, inp.offers, inp.weekStart)) {
      if (seen.has(`${p.day}:${id}`)) continue;
      seen.add(`${p.day}:${id}`);
      slotIns.push({ day: p.day, meal, dish_id: id, side_id: null, salad_id: null, simple: null });
    }
    // A plain snack (fruit, kefir) has no dish but has products.
    const s = p.kind === 'meal' ? inp.slots.find((x) => x.day === p.day && x.meal === p.meal) : undefined;
    if (s?.simple && !s.dish_id) slotIns.push({ day: p.day, meal, dish_id: null, side_id: null, salad_id: null, simple: s.simple });
  }
  // Each dish counted on its own (a soup as its whole pot, the rest by family portions), then added up per week.
  const sum = new Map<string, { item: string; qty: number | null; unit: string; week: 0 | 1 }>();
  for (const x of slotIns) {
    const week = x.day >= 7 ? 1 : 0;
    for (const l of buildMenuList({ ...inp.build, slots: [{ ...x, day: x.day % 7 }] })) {
      const prev = sum.get(`${week}:${l.item}`);
      const qty = !prev ? l.qty : prev.qty === null || l.qty === null ? prev.qty ?? l.qty : prev.qty + l.qty;
      sum.set(`${week}:${l.item}`, { item: l.item, qty, unit: l.unit, week });
    }
  }
  const need = [...sum.values()];
  const one = inp.picks.length === 1 ? inp.picks[0] : null;
  const label = !one ? 'на выбранное' : one.kind === 'meal' ? MEAL_FOR[one.meal] : `на «${inp.dishName(one.dish_id)}»`;

  const lines: TripLine[] = [];
  const skipped: Skip[] = [];
  const pantry = new Set<string>();
  for (const x of slotIns) {
    for (const r of x.dish_id ? inp.build.ingredientsOf.get(x.dish_id) ?? [] : x.simple?.items ?? []) {
      if (inp.build.vocab.get(r.item)?.pantry) pantry.add(r.item);
    }
  }
  for (const item of pantry) skipped.push({ item, why: 'pantry' });
  for (const n of need) {
    const weekId = inp.weekIds?.[n.week];
    const mine = inp.lines.filter((l) => l.item === n.item && !l.deleted_at && (!inp.weekIds || l.source !== 'menu' || l.week_id === weekId));
    const open = mine.filter((l) => { const m = inp.marks.get(l.id); return !m?.bought && !m?.at_home; });
    if (open.length) {
      const hint = n.qty === null ? null : `${label}: ${formatQty(n.qty, n.unit)}`;
      for (const l of open) if (!lines.some((x) => x.id === l.id)) lines.push({ id: l.id, hint });
    } else if (mine.some((l) => inp.marks.get(l.id)?.bought)) skipped.push({ item: n.item, why: 'bought' });
    else if (mine.length) skipped.push({ item: n.item, why: 'home' });
    else skipped.push({ item: n.item, why: 'absent' });
  }
  // A product needed in both weeks is named once for each reason.
  return { lines, skipped: skipped.filter((s, k) => skipped.findIndex((x) => x.item === s.item && x.why === s.why) === k) };
}

// «завтрак на завтра», «обед на сегодня», «ужин на четверг, плов».
export function pickLabel(picks: Pick[], today: number, dishName: (id: string) => string): string {
  const when = (day: number) => (day === today ? 'на сегодня' : day === today + 1 ? 'на завтра' : ON_DAY[day % 7]);
  const text = picks.map((p) => (p.kind === 'meal' ? `${MEAL_LABEL[p.meal].toLowerCase()} ${when(p.day)}` : dishName(p.dish_id).toLowerCase())).join(', ');
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

// Who is in the shop now: trips not ended and younger than TRIP_MS, the latest one per person, newest first.
export function activeTrips(trips: ShopTrip[], now: Date): ShopTrip[] {
  const latest = new Map<string, ShopTrip>();
  for (const t of trips) {
    if (t.ended_at || now.getTime() - new Date(t.started_at).getTime() >= TRIP_MS) continue;
    const prev = latest.get(t.member_id);
    if (!prev || t.started_at > prev.started_at) latest.set(t.member_id, t);
  }
  return [...latest.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

// The cart's lines that still exist, then lines added by hand while the trip was on: someone else's by the
// server's time, the shopper's own also by the phone's while not synced yet. Others' lines name who added them.
export function cartRows(trip: ShopTrip, items: ShoppingItem[], _marks: Map<string, ShoppingMark>): Array<{ item: ShoppingItem; hint: string | null; addedBy: string | null }> {
  const byId = new Map(items.filter((i) => !i.deleted_at).map((i) => [i.id, i]));
  const out: Array<{ item: ShoppingItem; hint: string | null; addedBy: string | null }> = [];
  for (const l of trip.items ?? []) {
    const item = byId.get(l.id);
    if (item) out.push({ item, hint: l.hint, addedBy: null });
  }
  const taken = new Set(out.map((r) => r.item.id));
  for (const i of byId.values()) {
    const at = i.created_at ?? (i.added_by === trip.member_id ? i.updated_at : undefined);
    if (taken.has(i.id) || (i.source !== 'manual' && i.source !== 'home') || !at || at < trip.started_at) continue;
    out.push({ item: i, hint: null, addedBy: i.added_by === trip.member_id ? null : i.added_by });
  }
  return out;
}
