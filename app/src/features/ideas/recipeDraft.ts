import type { Recipe, RecipeIngredient } from '../../data/db';

export type Category = 'breakfast' | 'soup' | 'main' | 'side' | 'salad' | 'snack' | 'dessert';
export type DraftRow = { item: string; qty: string; toTaste: boolean; note: string };
export type Draft = {
  id?: string; name: string; about: string; category: Category | null; time: string; servings: string;
  dima: 'ok' | 'adapt' | 'skip'; dimaNote: string; rows: DraftRow[]; steps: string[]; source: string;
  // The stored photo; a new one travels apart from the draft, as a file.
  photo?: string | null;
};

export const CATEGORY_NAME: Record<Category, string> = {
  breakfast: 'Завтрак', soup: 'Суп', main: 'Второе', side: 'Гарнир', salad: 'Салат', snack: 'Перекус', dessert: 'Десерт',
};
// Which meals a dish of each kind can be put on, as in the base.
export const MEALS_FOR: Record<Category, string[]> = {
  breakfast: ['breakfast'], soup: ['lunch'], main: ['dinner', 'lunch'], side: ['dinner', 'lunch'], salad: ['lunch', 'dinner'], snack: ['snack'], dessert: ['snack'],
};

const num = (s: string) => { const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const rowOk = (r: DraftRow) => !!r.item && (r.toTaste || num(r.qty) > 0);

export const emptyDraft = (): Draft => ({ name: '', about: '', category: null, time: '', servings: '', dima: 'ok', dimaNote: '', rows: [], steps: [''], source: '' });

export function draftFrom(r: Recipe, rows: RecipeIngredient[]): Draft {
  return {
    id: r.id, name: r.name, about: r.about, category: r.category as Category, time: String(r.time_total), servings: String(r.servings),
    dima: r.dima_level, dimaNote: r.dima_note, steps: r.steps.length ? r.steps : [''], source: r.source_url ?? '', photo: r.photo_path ?? null,
    rows: [...rows].sort((a, b) => a.pos - b.pos).map((x) => ({ item: x.item, qty: x.qty === null ? '' : String(x.qty), toTaste: x.to_taste || x.qty === null, note: x.note })),
  };
}

export const rowReady = rowOk;

// What still keeps «Сохранить» off, in the order the form asks for it.
export function missingOf(d: Draft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('название');
  if (!d.category) out.push('что это');
  if (!(Number.isInteger(num(d.servings)) && num(d.servings) >= 1)) out.push('порции');
  if (!d.rows.length) out.push('продукт');
  for (const r of d.rows) if (r.item && !rowOk(r)) out.push(`количество: ${r.item}`);
  if (!d.steps.some((s) => s.trim())) out.push('шаг');
  return out;
}

export const canSave = (d: Draft): boolean => missingOf(d).length === 0;

const siteOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };

// The rows the server stores: the family's recipe under an own-<uuid> id, and its products in order.
export function toRows(d: Draft) {
  const minutes = Math.max(1, Math.round(num(d.time)) || 30);
  const link = d.source.trim();
  const recipe: Record<string, unknown> = {
    id: d.id ?? `own-${crypto.randomUUID()}`, name: d.name.trim(), about: d.about.trim(), category: d.category,
    meals: d.category ? MEALS_FOR[d.category] : [], time_active: minutes, time_total: minutes, servings: Math.round(num(d.servings)),
    keeps_days: d.category === 'soup' ? 2 : 1, protein: 'other', tags: [], season: ['any'], collections: ['ours'],
    dima_level: d.dima, dima_note: d.dima === 'ok' ? '' : d.dimaNote.trim(), steps: d.steps.map((s) => s.trim()).filter(Boolean),
    source_url: link || null, source_site: link ? siteOf(link) : null,
  };
  const ingredients = d.rows.map((r, pos) => ({ pos, item: r.item, qty: r.toTaste ? null : num(r.qty), to_taste: r.toTaste, note: r.note.trim(), optional: false }));
  return { recipe, ingredients };
}
