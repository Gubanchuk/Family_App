import type { Ingredient } from '../../data/db';
import raw from '../../../../content/shop-units.json';
import { rub } from './build';

// How a product is bought in a shop (content/shop-units.json): loose by weight or volume, in packs, or counted.
// A line keeps its amount in the dictionary's unit (г, мл, шт), like a menu line; a product of the family's own
// is kept in г (bought by the kilo), мл (by the litre), шт or уп.
export type Sell = { sell: 'weight'; step: number } | { sell: 'pack'; size: number; pack: string } | { sell: 'piece'; step: number };
export type LineUnit = 'г' | 'мл' | 'шт' | 'уп';

export const SHOP_UNITS = (raw as unknown as { items: Record<string, Sell> }).items;

// A product without a row in the file (a family's own, or a dictionary item added later) gets a plain default.
const FALLBACK: Record<LineUnit, Sell> = {
  г: { sell: 'weight', step: 100 },
  мл: { sell: 'weight', step: 500 },
  шт: { sell: 'piece', step: 1 },
  уп: { sell: 'piece', step: 1 },
};

export function sellOf(item: string | null, unit: LineUnit): Sell {
  return (item ? SHOP_UNITS[item] : undefined) ?? FALLBACK[unit];
}

// One press of «+»: a pack, a piece (in grams for a product counted from its weight) or the weight step.
export function stepOf(sell: Sell, unit: LineUnit, pieceWeight: number | null = null): number {
  if (sell.sell === 'pack') return sell.size;
  if (sell.sell === 'piece') return unit === 'г' || unit === 'мл' ? (pieceWeight ?? 100) * sell.step : sell.step;
  return sell.step;
}

// The next amount on the step's grid; «−» never goes below one step (a line is removed in its sheet).
export function nextQty(qty: number | null, step: number, dir: 1 | -1): number {
  const q = qty ?? 0;
  const at = q / step;
  if (dir > 0) return Math.round((Math.floor(at + 1e-9) + 1) * step * 1000) / 1000;
  return Math.max(step, Math.round((Math.ceil(at - 1e-9) - 1) * step * 1000) / 1000);
}

const FORMS: Record<string, [string, string, string]> = {
  пачка: ['пачка', 'пачки', 'пачек'],
  пакет: ['пакет', 'пакета', 'пакетов'],
  пакетик: ['пакетик', 'пакетика', 'пакетиков'],
  бутылка: ['бутылка', 'бутылки', 'бутылок'],
  банка: ['банка', 'банки', 'банок'],
  упаковка: ['упаковка', 'упаковки', 'упаковок'],
  батон: ['батон', 'батона', 'батонов'],
  буханка: ['буханка', 'буханки', 'буханок'],
  пучок: ['пучок', 'пучка', 'пучков'],
  лоток: ['лоток', 'лотка', 'лотков'],
  коробка: ['коробка', 'коробки', 'коробок'],
  тюбик: ['тюбик', 'тюбика', 'тюбиков'],
  стакан: ['стакан', 'стакана', 'стаканов'],
  брикет: ['брикет', 'брикета', 'брикетов'],
  головка: ['головка', 'головки', 'головок'],
  сетка: ['сетка', 'сетки', 'сеток'],
  флакон: ['флакон', 'флакона', 'флаконов'],
  ведёрко: ['ведёрко', 'ведёрка', 'ведёрок'],
  кочан: ['кочан', 'кочана', 'кочанов'],
  булка: ['булка', 'булки', 'булок'],
  лаваш: ['лаваш', 'лаваша', 'лавашей'],
  багет: ['багет', 'багета', 'багетов'],
  десяток: ['десяток', 'десятка', 'десятков'],
  штука: ['штука', 'штуки', 'штук'],
  палка: ['палка', 'палки', 'палок'],
  баночка: ['баночка', 'баночки', 'баночек'],
  плитка: ['плитка', 'плитки', 'плиток'],
};

export function plural(noun: string, n: number): string {
  const f = FORMS[noun];
  if (!f) return noun;
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b === 1) return f[0];
  if (b >= 2 && b <= 4) return f[1];
  return f[2];
}
export const hasForms = (noun: string) => noun in FORMS;

const num = (n: number, digits = 2) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits });
const whole = (qty: number, step: number) => step > 0 && Math.abs(qty / step - Math.round(qty / step)) < 1e-6 && Math.round(qty / step) > 0;

// «300 г», «1,5 кг», «500 мл», «1,5 л».
export function measure(qty: number, unit: 'г' | 'мл'): string {
  if (qty >= 1000) return `${num(qty / 1000)} ${unit === 'мл' ? 'л' : 'кг'}`;
  return `${num(qty, 0)} ${unit}`;
}

// What a line says about its amount: «2 пачки · 400 г», «3 шт», «1,5 кг», «10 шт», «2 уп.».
export function formatAmount(qty: number | null, unit: string | null, sell?: Sell, pieceWeight: number | null = null): string {
  if (qty === null || qty === undefined || !unit) return '';
  if (unit === 'шт') return `${num(qty, 1)} шт`;
  if (unit === 'уп') return `${num(qty, 1)} уп.`;
  if (unit !== 'г' && unit !== 'мл') return `${num(qty)} ${unit}`;
  if (sell?.sell === 'pack' && whole(qty, sell.size)) {
    const n = Math.round(qty / sell.size);
    return `${n} ${plural(sell.pack, n)} · ${measure(qty, unit)}`;
  }
  if (sell?.sell === 'piece' && pieceWeight && whole(qty, pieceWeight)) return `${Math.round(qty / pieceWeight)} шт`;
  return measure(qty, unit);
}

// The price shown next to a product in search: per kilo, litre, pack or piece.
export function unitPriceLabel(pricePerUnit: number | null, unit: LineUnit, sell: Sell, pieceWeight: number | null = null): string {
  if (pricePerUnit === null || !(pricePerUnit > 0)) return '';
  if (sell.sell === 'pack' && (unit === 'г' || unit === 'мл' || unit === 'шт')) return `≈ ${rub(pricePerUnit * sell.size)}/${sell.pack}`;
  if (unit === 'г' || unit === 'мл') {
    if (sell.sell === 'piece' && pieceWeight) return `≈ ${rub(pricePerUnit * pieceWeight)}/шт`;
    return `≈ ${rub(pricePerUnit * 1000)}/${unit === 'мл' ? 'л' : 'кг'}`;
  }
  return `≈ ${rub(pricePerUnit)}/${unit === 'уп' ? 'уп.' : 'шт'}`;
}

// Kept to the kopeck: the price per unit of a family's own product is read back from it, and whole rubles
// would skew a cheap product bought in small amounts. Shown rounded.
export const lineEstimate = (qty: number | null, pricePerUnit: number | null): number | null =>
  qty === null || pricePerUnit === null || !(pricePerUnit >= 0) ? null : Math.round(qty * pricePerUnit * 100) / 100;

// What the number in the stepper means when typed by hand: kilos and litres for loose goods, packs, pieces.
export function inputUnit(sell: Sell, unit: LineUnit, pieceWeight: number | null = null): { label: string; factor: number; decimals: boolean } {
  if (sell.sell === 'pack' && unit !== 'уп') return { label: plural(sell.pack, 5), factor: sell.size, decimals: false };
  if (unit === 'г' || unit === 'мл') {
    if (sell.sell === 'piece' && pieceWeight) return { label: 'шт', factor: pieceWeight, decimals: false };
    return { label: unit === 'мл' ? 'л' : 'кг', factor: 1000, decimals: true };
  }
  return { label: unit === 'уп' ? 'уп.' : 'шт', factor: 1, decimals: false };
}

// «12,5» / «1.5» typed in the stepper → the line's amount; null for anything that is not a positive number.
export function parseTyped(text: string, factor: number): number | null {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * factor * 1000) / 1000 : null;
}

// A family's own product: the unit picked in the form and what its price is given per.
export const OWN_UNITS: Array<{ label: string; unit: LineUnit; factor: number; per: string }> = [
  { label: 'кг', unit: 'г', factor: 1000, per: '1 кг' },
  { label: 'шт', unit: 'шт', factor: 1, per: '1 шт' },
  { label: 'л', unit: 'мл', factor: 1000, per: '1 л' },
  { label: 'упаковка', unit: 'уп', factor: 1, per: '1 упаковку' },
];

export const dictUnit = (v: Ingredient | undefined): LineUnit => (v?.unit === 'мл' ? 'мл' : v?.unit === 'шт' ? 'шт' : 'г');
