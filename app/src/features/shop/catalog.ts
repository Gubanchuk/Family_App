import type { Ingredient, ShoppingItem, ShoppingMark } from '../../data/db';
import { dictUnit, sellOf, type LineUnit, type Sell } from './units';
import { stockKey } from './stock';

// What can be put in a trip: the products of the dictionary and the family's own, remembered from the lines
// they were bought on (no table of their own: the last line with an amount says the unit, price and department).
export type Product = {
  key: string; title: string; item: string | null; unit: LineUnit; dept: string;
  price: number | null; sell: Sell; pieceWeight: number | null; custom: boolean; uses: number;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const UNITS: LineUnit[] = ['г', 'мл', 'шт', 'уп'];

export function buildCatalog(a: { vocab: Map<string, Ingredient>; prices: Map<string, number>; items: ShoppingItem[]; marks: Map<string, ShoppingMark> }): Product[] {
  const uses = new Map<string, number>();
  for (const i of a.items) if (!i.deleted_at && a.marks.get(i.id)?.bought) uses.set(stockKey(i), (uses.get(stockKey(i)) ?? 0) + 1);
  const out: Product[] = [];
  for (const v of a.vocab.values()) {
    const unit = dictUnit(v);
    out.push({
      key: v.item, title: capital(v.item), item: v.item, unit, dept: v.dept, price: a.prices.get(v.item) ?? null,
      sell: sellOf(v.item, unit), pieceWeight: v.piece_weight, custom: false, uses: uses.get(v.item) ?? 0,
    });
  }
  // The family's own products: the newest line of each name; one with an amount wins over an older text-only one.
  const own = new Map<string, ShoppingItem>();
  const newer = (x: ShoppingItem, y: ShoppingItem) => (x.created_at ?? x.updated_at) > (y.created_at ?? y.updated_at);
  for (const i of a.items) {
    if (i.deleted_at || i.item || i.source === 'menu') continue;
    const key = stockKey(i);
    if (a.vocab.has(norm(i.title))) continue;
    const prev = own.get(key);
    const amount = (x: ShoppingItem) => x.qty !== null && UNITS.includes(x.unit as LineUnit);
    if (!prev || (amount(i) && !amount(prev)) || (amount(i) === amount(prev) && newer(i, prev))) own.set(key, i);
  }
  for (const [key, i] of own) {
    const unit = UNITS.includes(i.unit as LineUnit) && i.qty !== null ? (i.unit as LineUnit) : 'шт';
    const paid = a.marks.get(i.id)?.price_real ?? i.est_price;
    const price = i.qty && i.qty > 0 && paid !== null && paid !== undefined ? paid / i.qty : null;
    out.push({ key, title: i.title, item: null, unit, dept: i.dept, price, sell: sellOf(null, unit), pieceWeight: null, custom: true, uses: uses.get(key) ?? 0 });
  }
  return out;
}

// «помидор» finds «помидоры», «яблоко» finds «яблоки»: a word without its last letter, as guessIngredient does.
const stem = (w: string) => (w.length > 4 ? w.slice(0, -1) : w);

export function searchCatalog(catalog: Product[], query: string, limit = 8): Product[] {
  const q = norm(query);
  if (!q) return [];
  const qs = stem(q.split(' ')[0]);
  const score = (p: Product) => {
    const t = norm(p.title);
    if (t === q) return 5;
    if (t.startsWith(q)) return 4;
    const words = t.split(/[\s,()-]+/);
    if (words.some((w) => w.startsWith(q))) return 3;
    if (qs.length >= 3 && words.some((w) => w.startsWith(qs) || stem(w) === qs)) return 2;
    return t.includes(q) ? 1 : 0;
  };
  return catalog
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || y.p.uses - x.p.uses || x.p.title.localeCompare(y.p.title, 'ru'))
    .slice(0, limit)
    .map((x) => x.p);
}

// What the family buys most, for the empty search.
export const frequent = (catalog: Product[], n = 8) =>
  catalog.filter((p) => p.uses > 0).sort((x, y) => y.uses - x.uses || x.title.localeCompare(y.title, 'ru')).slice(0, n);

export const productOfLine = (line: ShoppingItem, catalog: Product[]) => catalog.find((p) => p.key === stockKey(line));
