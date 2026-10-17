import type { Ingredient } from '../../data/db';
import type { PageRecipe } from '../../../../supabase/functions/_shared/recipePage';
import type { Draft, DraftRow } from './recipeDraft';

// Matching the lines of a recipe page to the app's vocabulary. Pure, so the content tools use it too.
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const FRACTIONS: Record<string, string> = { '½': '0.5', '¼': '0.25', '¾': '0.75', '⅓': '0.33', '⅔': '0.67' };
// Units a recipe line may use, and what one of them is in the vocabulary's unit.
const UNITS: Array<[RegExp, string, number]> = [
  [/^кг|^килограмм/, 'г', 1000], [/^г(р|рамм\w*)?\.?$|^г\b|^гр\b|^грамм/, 'г', 1],
  [/^мл|^миллилитр/, 'мл', 1], [/^л(\.|$|\b)|^литр/, 'мл', 1000], [/^шт|^штук/, 'шт', 1],
];
// Spoons and glasses by the standard kitchen measure: 15 ml, 5 ml, 250 ml. In grams an average of
// common products (flour, sugar, cereal, sour cream); the original measure stays in the note to check.
const MEASURES: Array<[RegExp, number, number]> = [
  [/^(ст\.?\s*л|стол\w*\.?\s*л|столов)/, 15, 20], [/^(ч\.?\s*л|чайн\w*\.?\s*л|чайн)/, 5, 7], [/^стакан/, 250, 200],
];

// A product of the vocabulary whose every word starts a word of the line, in any order («сливочное масло»
// is «масло сливочное»); the longest name wins («лук репчатый» over «лук»).
function findItem(line: string, vocab: Ingredient[]): Ingredient | null {
  const l = ` ${norm(line)}`;
  let best: Ingredient | null = null;
  for (const v of vocab) {
    // A word is matched by its stem when it is long enough: «яйца» finds «яйцо», «творог» finds «творога».
    const stems = norm(v.item).split(' ').map((w) => (w.length > 4 ? w.slice(0, -1) : w.length === 4 ? w.slice(0, 3) : w));
    const all = stems.every((st) => new RegExp(`[^а-яa-z]${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l));
    if (all && (!best || v.item.length > best.item.length)) best = v;
  }
  return best;
}

// One line of a recipe page → a row of the editor, or null when no product of the vocabulary is named.
// An amount in units the vocabulary cannot take («2 ст. л.», «1 банка») stays in the note to fill in by hand.
export function matchLine(line: string, vocab: Ingredient[]): DraftRow | null {
  const item = findItem(line, vocab);
  if (!item) return null;
  const l = norm(line).replace(/[½¼¾⅓⅔]/g, (c) => FRACTIONS[c]);
  if (/по вкусу|для подачи|по желанию/.test(l) && !/\d/.test(l)) return { item: item.item, qty: '', toTaste: true, note: '' };
  // Every number with the word after it; a percentage («творог 9%») is never the amount, and a number
  // with a known unit beats a bare one.
  const found = [...l.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(%|[а-я]+\.?(?:\s*[а-я]\.)?)?/g)].filter((x) => x[2] !== '%');
  const m = found.find((x) => x[2] && UNITS.some(([re]) => re.test(x[2].trim()))) ?? found[0];
  if (!m) return { item: item.item, qty: '', toTaste: false, note: '' };
  const n = Number(m[1].replace(',', '.'));
  const unitWord = (m[2] ?? '').trim();
  const unit = unitWord ? UNITS.find(([re]) => re.test(unitWord)) : undefined;
  const asIs = !unitWord || norm(item.item).startsWith(unitWord.replace(/\.$/, '').slice(0, 3));
  let qty: number | null = null;
  const amount = line.slice(line.search(/\d|[½¼¾]/)).replace(/\s+/g, ' ').trim();
  if (unit && unit[1] === item.unit) qty = n * unit[2];
  else if ((asIs || !unit) && item.unit === 'шт' && (!unitWord || asIs)) qty = n;
  if (qty !== null && qty > 0) return { item: item.item, qty: String(Math.round(qty * 100) / 100), toTaste: false, note: '' };
  const measure = MEASURES.find(([re]) => re.test(unitWord));
  if (measure && item.unit !== 'шт') return { item: item.item, qty: String(Math.round(n * (item.unit === 'мл' ? measure[1] : measure[2]))), toTaste: false, note: amount.slice(0, 40) };
  return { item: item.item, qty: '', toTaste: false, note: amount.slice(0, 40) };
}

// The editor's draft filled from a page; lines without a product of the vocabulary are named for the person.
export function fromPage(r: PageRecipe, vocab: Ingredient[], url: string): { patch: Partial<Draft>; unmatched: string[] } {
  const rows: DraftRow[] = [];
  const unmatched: string[] = [];
  for (const line of r.ingredients) {
    const row = matchLine(line, vocab);
    if (!row) unmatched.push(line);
    else if (!rows.some((x) => x.item === row.item)) rows.push(row);
  }
  return {
    patch: {
      name: r.name, servings: r.servings ? String(r.servings) : '', time: r.minutes ? String(Math.min(999, r.minutes)) : '',
      steps: r.steps.length ? r.steps : [''], rows, source: url,
    },
    unmatched,
  };
}
