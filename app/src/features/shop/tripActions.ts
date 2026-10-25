import { features, writeLocal } from '../../data/sync';
import type { LocalDb, ShopTrip, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Product } from './catalog';
import { capitalize } from './menuList';
import { stockKey } from './stock';
import { activeTrips } from './tripCart';
import { formatAmount, lineEstimate, sellOf, stepOf, type LineUnit, type Sell } from './units';

// «Поход»: the family's list for the next trip to the shop is the lines marked in_trip. The mark travels only
// once the server has the column (feature tripList); until then nothing here writes it.

// «1 товар», «3 товара», «12 товаров».
export const goods = (n: number) => { const a = n % 100; const b = n % 10; return a > 10 && a < 20 ? 'товаров' : b === 1 ? 'товар' : b >= 2 && b <= 4 ? 'товара' : 'товаров'; };

export const tripListOn = async (db: LocalDb) => (await features(db)).has('tripList');

// Someone is in the shop right now: whatever is added goes straight into the trip.
export async function shoppingNow(db: LocalDb, householdId: string, now = new Date()): Promise<boolean> {
  return activeTrips(await db.shop_trips.where('household_id').equals(householdId).toArray(), now).length > 0;
}

// The price of one gram, millilitre, piece or pack a line was priced at, for lines whose product has no price of its own.
export const linePrice = (l: ShoppingItem): number | null => (l.est_price !== null && l.qty ? l.est_price / l.qty : null);

const closedMark = (m: ShoppingMark | undefined) => !!(m?.bought || m?.at_home);

// The line as this phone has it now: a sheet or a list may hold an older copy, and writing that back would undo
// another phone's change or bring back a removed line. null when it is gone.
async function current(db: LocalDb, line: ShoppingItem): Promise<ShoppingItem | null> {
  const row = await db.shopping_items.get(line.id);
  return row && !row.deleted_at ? row : null;
}

export type NewLine = { product?: Product | null; title: string; qty: number; unit: LineUnit; pricePerUnit: number | null; dept: string; inTrip: boolean; urgent?: boolean; id?: string };

// Adds a product to the list (and to the trip). The same product already open in the trip in the same unit
// gets the amount added instead of a second line.
export async function addProductLine(db: LocalDb, me: Member, a: NewLine): Promise<{ id: string; merged: boolean }> {
  const has = await tripListOn(db);
  const inTrip = has && (a.inTrip || (await shoppingNow(db, me.household_id)));
  const key = a.product?.key ?? stockKey({ item: null, title: a.title });
  if (inTrip) {
    const open = (await db.shopping_items.where('household_id').equals(me.household_id).toArray())
      .filter((i) => !i.deleted_at && i.in_trip && i.qty !== null && i.unit === a.unit && stockKey(i) === key);
    const marks = await db.shopping_marks.bulkGet(open.map((i) => i.id));
    const target = open.find((_, k) => !closedMark(marks[k]));
    if (target) {
      await setLineQty(db, target, (target.qty ?? 0) + a.qty, a.pricePerUnit ?? linePrice(target), a.product?.sell, a.product?.pieceWeight ?? null);
      return { id: target.id, merged: true };
    }
  }
  const sell = a.product?.sell ?? sellOf(null, a.unit);
  const id = a.id ?? `u:${crypto.randomUUID()}`;
  await writeLocal(db, 'shopping_items', [{
    id, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual', item: a.product?.item ?? null,
    title: capitalize(a.title.trim()), qty: a.qty, unit: a.unit, qty_text: formatAmount(a.qty, a.unit, sell, a.product?.pieceWeight ?? null),
    dept: a.dept, urgent: !!a.urgent, est_price: lineEstimate(a.qty, a.pricePerUnit), added_by: me.id, deleted_at: null,
    ...(has ? { in_trip: inTrip } : {}),
  }]);
  return { id, merged: false };
}

// A new amount for a line: its text and estimate follow. A line keeps its own price per unit unless one is given.
export async function setLineQty(db: LocalDb, stale: ShoppingItem, qty: number, pricePerUnit?: number | null, sell?: Sell, pieceWeight: number | null = null) {
  const line = await current(db, stale);
  if (!line) return;
  const unit = (line.unit ?? 'шт') as LineUnit;
  const price = pricePerUnit === undefined ? linePrice(line) : pricePerUnit;
  await writeLocal(db, 'shopping_items', [{
    ...line, qty, qty_text: formatAmount(qty, unit, sell ?? sellOf(line.item, unit), pieceWeight), est_price: lineEstimate(qty, price),
  }]);
}

// A line's sheet saved before buying: a new amount (its estimate follows the price per unit) and, if typed,
// the price for the whole line. One write, so neither change overwrites the other.
export async function updateLine(db: LocalDb, stale: ShoppingItem, change: { qty?: number; est?: number | null }, product?: Product) {
  const line = await current(db, stale);
  if (!line) return;
  const unit = (line.unit ?? 'шт') as LineUnit;
  const next = { ...line };
  if (change.qty !== undefined && change.qty > 0) {
    const price = product?.price ?? linePrice(line);
    Object.assign(next, { qty: change.qty, qty_text: formatAmount(change.qty, unit, product?.sell ?? sellOf(line.item, unit), product?.pieceWeight ?? null), est_price: lineEstimate(change.qty, price) });
  }
  if (change.est !== undefined && change.est !== null) next.est_price = Math.round(change.est * 100) / 100;
  if (next.qty !== line.qty || next.est_price !== line.est_price) await writeLocal(db, 'shopping_items', [next]);
}

export async function setInTrip(db: LocalDb, stale: ShoppingItem[], on: boolean) {
  if (!(await tripListOn(db))) return;
  const lines = (await db.shopping_items.bulkGet(stale.map((l) => l.id))).filter((l): l is ShoppingItem => !!l && !l.deleted_at);
  const changed = lines.filter((l) => !!l.in_trip !== on);
  if (changed.length) await writeLocal(db, 'shopping_items', changed.map((l) => ({ ...l, in_trip: on })));
}

// Lines taken from the list into the trip. A dictionary product's amount is rounded up to what the shop sells
// (whole packs, the weight step), and its estimate follows: «1237 г картофеля» becomes «1,5 кг».
export async function pullToTrip(db: LocalDb, stale: ShoppingItem[], catalog: Product[]) {
  if (!(await tripListOn(db))) return;
  const lines = (await db.shopping_items.bulkGet(stale.map((l) => l.id))).filter((l): l is ShoppingItem => !!l && !l.deleted_at);
  const out: ShoppingItem[] = [];
  for (const l of lines) {
    if (l.in_trip) continue;
    const p = l.item ? catalog.find((x) => x.item === l.item) : undefined;
    if (!p || l.qty === null || l.unit !== p.unit) { out.push({ ...l, in_trip: true }); continue; }
    const step = stepOf(p.sell, p.unit, p.pieceWeight);
    const qty = Math.max(step, Math.ceil(l.qty / step - 1e-9) * step);
    const price = p.price ?? linePrice(l);
    out.push({ ...l, in_trip: true, qty, qty_text: formatAmount(qty, p.unit, p.sell, p.pieceWeight), est_price: lineEstimate(qty, price) });
  }
  if (out.length) await writeLocal(db, 'shopping_items', out);
}

// The trip's lines: before the shop, the open ones; in the shop, also those closed since it began, so a ticked
// line stays in view at the bottom of its department.
export function tripLines(items: ShoppingItem[], marks: Map<string, ShoppingMark>, trip?: ShopTrip | null): ShoppingItem[] {
  return items.filter((i) => {
    if (i.deleted_at || !i.in_trip) return false;
    const m = marks.get(i.id);
    if (!closedMark(m)) return true;
    return !!trip && (m!.bought_at ?? m!.updated_at) >= trip.started_at;
  });
}

export type TripTotals = { count: number; total: number; inCart: { count: number; sum: number }; left: { count: number; sum: number }; unpriced: number };

// In the cart: bought lines at what was paid, or the estimate. Left: open lines at the estimate; a line kept
// «at home» is neither. Lines without any price are counted, not summed.
export function tripTotals(lines: ShoppingItem[], marks: Map<string, ShoppingMark>): TripTotals {
  const t: TripTotals = { count: 0, total: 0, inCart: { count: 0, sum: 0 }, left: { count: 0, sum: 0 }, unpriced: 0 };
  for (const l of lines) {
    const m = marks.get(l.id);
    if (m?.at_home) continue;
    t.count += 1;
    if (m?.bought) {
      t.inCart.count += 1;
      t.inCart.sum += m.price_real ?? l.est_price ?? 0;
    } else {
      t.left.count += 1;
      if (l.est_price === null) t.unpriced += 1; else t.left.sum += l.est_price;
    }
  }
  t.inCart.sum = Math.round(t.inCart.sum);
  t.left.sum = Math.round(t.left.sum);
  t.total = t.inCart.sum + t.left.sum;
  return t;
}

// What the toast says when the shopper ends the trip.
export function endSummary(lines: ShoppingItem[], marks: Map<string, ShoppingMark>): { count: number; sum: number; left: string[] } {
  const t = tripTotals(lines, marks);
  return { count: t.inCart.count, sum: t.inCart.sum, left: lines.filter((l) => !closedMark(marks.get(l.id))).map((l) => l.title) };
}
