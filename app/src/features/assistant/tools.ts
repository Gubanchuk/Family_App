import { features, writeLocal } from '../../data/sync';
import type { HomeStock, Ingredient, LocalDb, Recipe, RecipeIngredient, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { KIN_WORD } from '../family/kin';
import { addDaysIso, dayOfWeek, fitsMeal, MEAL_LABEL, MEALS, mondayOf, type Meal } from '../menu/week';
import { canEditWeek, changeMeal, NO_MEAL } from '../menu/actions';
import { setWeekFromTemplate } from '../menu/weekActions';
import { deleteRecipe, saveRecipe } from '../ideas/recipeApi';
import { missingOf, type Category, type Draft, type DraftRow } from '../ideas/recipeDraft';
import { findItem } from '../ideas/recipeMatch';
import { formatQty } from '../shop/build';
import { capitalize } from '../shop/menuList';
import { guessDept, guessIngredient, removeItem } from '../shop/shopActions';
import { buildCatalog, type Product } from '../shop/catalog';
import { addProductLine, pullToTrip, tripListOn } from '../shop/tripActions';
import { formatAmount, stepOf, type LineUnit } from '../shop/units';
import { removeStock, runOut, setStock, stockKey } from '../shop/stock';
import { askFor } from '../board/boardActions';
import { MAX_RUB } from '../board/boardMath';
import { whenText as dueWhen } from '../board/requestText';
import { createOffer, MEAL_FOR } from '../ideas/offerActions';
import { blockedBy } from '../ideas/search';
import { saveEntry } from '../money/moneyActions';
import { dayTitle } from '../money/month';
import { CATEGORIES } from '../money/types';
import { TOOLS } from '../../../../supabase/functions/_shared/assistant';
import { rubs } from './snapshot';

// The assistant's tools, run on the phone with the family's own data. Every input comes from the model and is
// checked here: a wrong one becomes an error the model can read and fix, never a write.

export type ToolCtx = { db: LocalDb; me: Member; members: Member[]; today: Date };
export type ToolRun = { result: string; summary: string; undo?: () => Promise<void>; error?: boolean };
type Done = { result: string; undo?: () => Promise<void> };
type Plan = { summary: string; error?: string; run?: () => Promise<Done> };

const TITLE: Record<string, string> = {
  find_recipes: 'Ищу рецепты', get_recipe: 'Открываю рецепт', add_to_shopping: 'Добавляю в поход', set_home_stock: 'Отмечаю дома',
  ask_family: 'Попросить на Доске', offer_dish: 'Предложить блюдо', add_expense: 'Внести расход',
  set_meal: 'Меняю меню', save_recipe: 'Сохраняю рецепт',
};
const fail = (summary: string, error: string): Plan => ({ summary, error });

// ---- input checks ----
const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const str = (x: unknown, max = 200) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (x: unknown): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const given = (x: unknown) => x !== undefined && x !== null && x !== '';
function isoDate(x: unknown): string | null {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const [y, m, d] = x.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? x : null;
}
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const dec = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
function dayWord(iso: string, today: string) {
  if (iso === today) return 'сегодня';
  if (iso === addDaysIso(today, 1)) return 'завтра';
  if (iso === addDaysIso(today, -1)) return 'вчера';
  return dayTitle(iso);
}
const listed = (names: string[]) => (names.length > 6 ? `${names.slice(0, 5).join(', ')} и ещё ${names.length - 5}` : names.join(', '));

// ---- Russian matching: case, ё and word endings ----
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'иях', 'ях', 'ах', 'ов', 'ев', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ья', 'ье', 'ьи', 'ью', 'ия', 'ию', 'ии', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];
export function stem(word: string): string {
  const w = norm(word);
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  return w;
}
const words = (s: string) => norm(s).split(/[^a-zа-я0-9]+/).filter(Boolean);
const STOP = new Set(['и', 'или', 'с', 'со', 'из', 'на', 'в', 'во', 'для', 'без', 'по', 'к', 'ко', 'а', 'но', 'что', 'чтобы', 'как', 'же', 'бы', 'то', 'нибудь', 'блюдо', 'блюда', 'рецепт', 'рецепты', 'рецепта', 'можно', 'приготовить', 'сделать', 'еда', 'минут', 'минуты', 'мин']);
const queryStems = (s: string) => words(s).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
// Words people use for what the base names otherwise.
const SYNONYMS: Record<string, string[]> = {
  картошк: ['картофел'], картошечк: ['картофел'], картоф: ['картофел'], пюр: ['картофел'], помидор: ['томат'], томат: ['помидор'],
  курятин: ['куриц', 'курин'], кур: ['куриц', 'курин'], макарошк: ['макарон'], паст: ['макарон', 'спагетт'],
  дешев: ['бюджетн'], недорог: ['бюджетн'], сладк: ['десерт'], сладост: ['десерт'], перекус: ['полдник'], малыш: ['детск'], ребенк: ['детск'], дет: ['детск'],
};
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1; return i; };
function strength(q: string, t: string): number {
  if (q === t) return 1;
  if (q.length >= 3 && t.startsWith(q)) return 0.9;
  const cp = commonPrefix(q, t);
  return cp >= 4 && cp >= Math.min(q.length, t.length) - 1 ? 0.6 : 0;
}
const best = (qs: string[], tokens: string[]) => Math.max(0, ...qs.flatMap((q) => tokens.map((t) => strength(q, t))));
const variants = (q: string) => [q, ...(SYNONYMS[q] ?? [])];

const KIND: Record<string, string> = { breakfast: 'завтрак', soup: 'суп первое', main: 'второе горячее основное', side: 'гарнир', salad: 'салат', snack: 'перекус полдник', dessert: 'десерт сладкое выпечка', drink: 'напиток' };
const KIND_WORD: Record<string, string> = { breakfast: 'завтрак', soup: 'суп', main: 'второе', side: 'гарнир', salad: 'салат', snack: 'перекус', dessert: 'десерт', drink: 'напиток' };
const PROTEIN: Record<string, string> = { poultry: 'птица курица индейка', 'red-meat': 'мясо говядина свинина', fish: 'рыба', egg: 'яйца', cottage: 'творог', dairy: 'молочное', legume: 'бобовые фасоль чечевица нут горох' };
const MEAL_WORD: Record<Meal, string> = { breakfast: 'завтрак', lunch: 'обед', snack: 'полдник перекус', dinner: 'ужин' };
const MEAL_SHORT: Record<Meal, string> = { breakfast: 'завтрак', lunch: 'обед', snack: 'полдник', dinner: 'ужин' };
const DIMA = (r: Recipe) => (r.dima_level === 'ok' ? 'можно' : `${r.dima_level === 'adapt' ? 'с поправкой' : 'нельзя'}${r.dima_note ? `: ${r.dima_note}` : ''}`);
const inMeal = (r: Recipe, m: Meal) => fitsMeal(r, m) || r.meals.includes(m);

type Book = { recipes: Recipe[]; rowsOf: Map<string, RecipeIngredient[]>; vocab: Map<string, Ingredient> };
async function bookOf(db: LocalDb): Promise<Book> {
  const [recipes, rows, vocab] = await Promise.all([db.recipes.filter((r) => !r.deleted_at).toArray(), db.recipe_ingredients.toArray(), db.ingredients.toArray()]);
  const rowsOf = new Map<string, RecipeIngredient[]>();
  for (const r of rows) rowsOf.set(r.recipe_id, [...(rowsOf.get(r.recipe_id) ?? []), r]);
  for (const list of rowsOf.values()) list.sort((a, b) => a.pos - b.pos);
  return { recipes, rowsOf, vocab: new Map(vocab.map((v) => [v.item, v])) };
}
const vocabOf = async (db: LocalDb) => new Map((await db.ingredients.toArray()).map((v) => [v.item, v]));

async function planFindRecipes(input: unknown, { db, me }: ToolCtx): Promise<Plan> {
  const o = obj(input);
  const query = str(o.query, 200);
  const products = (Array.isArray(o.products) ? o.products : []).map((p) => str(p, 60)).filter(Boolean).slice(0, 10);
  const meal = MEALS.includes(o.meal as Meal) ? (o.meal as Meal) : null;
  const maxMin = num(o.max_minutes);
  const limit = Math.min(10, Math.max(1, Math.round(num(o.limit) ?? 10)));
  const summary = query ? `Ищу рецепты: ${query}` : products.length ? `Ищу рецепты: ${products.join(', ')}` : TITLE.find_recipes;
  return {
    summary,
    run: async () => {
      const [book, notEat, stockRows] = await Promise.all([bookOf(db), db.not_eat.where('household_id').equals(me.household_id).toArray(), db.home_stock.where('household_id').equals(me.household_id).toArray()]);
      const stock = stockRows.filter((s) => !s.deleted_at);
      const haveKeys = new Set(stock.filter((s) => s.state === 'have').map((s) => s.key));
      const atHome = (item: string) => haveKeys.has(item) || haveKeys.has(`t:${norm(item)}`);
      const qs = queryStems(query);
      const ps = products.map(queryStems).filter((p) => p.length);
      const browsing = !qs.length && !ps.length;
      const scored = book.recipes.flatMap((r) => {
        const rows = book.rowsOf.get(r.id) ?? [];
        if (blockedBy(r, rows.map((x) => x.item), notEat)) return [];
        if (o.for_dima === true && r.dima_level === 'skip') return [];
        if (meal && !inMeal(r, meal)) return [];
        if (maxMin !== null && r.time_total > maxMin) return [];
        // Base sides come with their main dish; they show when asked for by name or product.
        if (browsing && r.category === 'side' && !r.household_id) return [];
        const main = rows.filter((x) => !book.vocab.get(x.item)?.pantry);
        const ingTokens = main.map((x) => words(x.item).map(stem));
        const fields: Array<[number, string[]]> = [
          [3, words(r.name).map(stem)],
          [2, [...r.tags.flatMap(words), ...words(KIND[r.category] ?? ''), ...words(PROTEIN[r.protein] ?? ''), ...MEALS.filter((m) => inMeal(r, m)).flatMap((m) => words(MEAL_WORD[m]))].map(stem)],
          [2, ingTokens.flat()],
          [1, words(r.about).map(stem)],
        ];
        let score = 0; let hits = 0; let strong = 0;
        for (const q of qs) {
          const s = Math.max(...fields.map(([w, t]) => w * best(variants(q), t)));
          const top = Math.max(...fields.map(([, t]) => best(variants(q), t)));
          if (s > 0) { hits += 1; score += s; }
          if (top >= 0.9) strong += 1;
        }
        // A product is in the recipe when one of its ingredients carries every word of it.
        const pHits = ps.filter((p) => ingTokens.some((t) => p.every((q) => best(variants(q), t) > 0))).length;
        if ((qs.length && !hits) || (ps.length && !pHits)) return [];
        const home = main.filter((x) => atHome(x.item)).length;
        const all = pHits === ps.length;
        // 0: every word found as itself; 1: every word found, some only by a near form; 2: only some found.
        const tier = all && strong === qs.length ? 0 : all && hits === qs.length ? 1 : 2;
        return [{ r, main, tier, hits: hits + pHits, score, home }];
      });
      const top = Math.min(2, ...scored.map((x) => x.tier));
      const pool = scored.filter((x) => x.tier === top);
      const fromHome = o.from_home === true;
      // From home: something at home first, then the fewest products left to buy.
      const missing = (x: { main: unknown[]; home: number }) => x.main.length - x.home;
      pool.sort((a, b) => b.hits - a.hits
        || (fromHome ? Number(b.home > 0) - Number(a.home > 0) || missing(a) - missing(b) || b.home - a.home : 0)
        || b.score - a.score || a.r.time_total - b.r.time_total || a.r.name.localeCompare(b.r.name, 'ru'));
      const recipes = pool.slice(0, limit).map(({ r, main, home }) => ({
        id: r.id, name: r.name, minutes: r.time_total, kind: KIND_WORD[r.category] ?? r.category,
        meals: MEALS.filter((m) => inMeal(r, m)).map((m) => MEAL_SHORT[m]), tags: r.tags, dima: DIMA(r),
        products: main.slice(0, 8).map((x) => x.item),
        ...(stock.length ? { at_home: `${home} из ${main.length}` } : {}),
        ...(r.household_id ? { own: true } : {}),
      }));
      const note = !recipes.length ? 'Ничего не нашлось.' : top === 2 && !browsing ? 'Точных совпадений нет, это ближайшие.' : undefined;
      return { result: JSON.stringify(note ? { recipes, note } : { recipes }) };
    },
  };
}

const portionsWord = (n: number) => (!Number.isInteger(n) ? 'порции' : n % 10 === 1 && n % 100 !== 11 ? 'порция' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'порции' : 'порций');

async function planGetRecipe(input: unknown, { db, me }: ToolCtx): Promise<Plan> {
  const id = str(obj(input).id, 100);
  if (!id) return fail(TITLE.get_recipe, 'Нужен id рецепта из find_recipes.');
  const r = await db.recipes.get(id);
  if (!r || r.deleted_at) return fail(TITLE.get_recipe, `Рецепта с id «${id}» нет в базе. Найди его через find_recipes.`);
  return {
    summary: `Открываю рецепт: ${r.name}`,
    run: async () => {
      const [rows, vocab, portionsMeta, notEat] = await Promise.all([
        db.recipe_ingredients.where('recipe_id').equals(r.id).sortBy('pos'), vocabOf(db), db.meta.get('family_portions'),
        db.not_eat.where('household_id').equals(me.household_id).toArray(),
      ]);
      const portions = Number(portionsMeta?.value ?? 3.5) || 3.5;
      // As the list counts it: a soup is cooked as a whole pot, other dishes for the family's portions.
      const pot = r.category === 'soup';
      const factor = pot || !(r.servings > 0) ? 1 : portions / r.servings;
      const products = rows.map((x) => {
        const v = vocab.get(x.item);
        const q = v?.pantry ? 'есть дома' : x.qty === null ? 'по вкусу' : formatQty(Number(x.qty) * factor, v?.unit ?? 'г');
        return `${capitalize(x.item)}${x.note ? `, ${x.note}` : ''}${x.optional ? ' (по желанию)' : ''} — ${q}`;
      });
      const blocked = blockedBy(r, rows.map((x) => x.item), notEat);
      return {
        result: JSON.stringify({
          id: r.id, name: r.name, about: r.about, minutes: r.time_total, active_minutes: r.time_active,
          portions: pot ? `кастрюля на ${r.servings} ${portionsWord(r.servings)}` : `на семью, ${dec(portions)} ${portionsWord(portions)}`,
          dima: DIMA(r), keeps_days: r.keeps_days, products, steps: r.steps,
          ...(r.source_site ? { source: r.source_site } : {}),
          ...(blocked ? { not_eat: `в списке «не едим»: ${blocked}` } : {}),
        }),
      };
    },
  };
}

// Lines the family still has to buy: menu lines of the approved weeks, and every hand-added, home or offered one.
async function openLines(db: LocalDb, h: string, today: Date): Promise<ShoppingItem[]> {
  const start = mondayOf(today);
  const weeks = new Set((await db.weeks.where('household_id').equals(h).toArray())
    .filter((w) => !w.deleted_at && w.status === 'approved' && (w.starts_on === start || w.starts_on === addDaysIso(start, 7))).map((w) => w.id));
  const items = (await db.shopping_items.where('household_id').equals(h).toArray()).filter((i) => !i.deleted_at);
  const marks = await db.shopping_marks.bulkGet(items.map((i) => i.id));
  return items.filter((i, k) => !(marks[k]?.bought || marks[k]?.at_home) && (i.source !== 'menu' || (!!i.week_id && weeks.has(i.week_id))));
}

// Takes back lines this action added; a line bought or kept «at home» since stays, the money was spent.
async function removeOwnLines(db: LocalDb, ids: string[]) {
  for (const id of ids) {
    const [line, mark] = await Promise.all([db.shopping_items.get(id), db.shopping_marks.get(id)]);
    if (line && !line.deleted_at && !(mark?.bought || mark?.at_home)) await removeItem(db, line);
  }
}

const UNITS = ['г', 'кг', 'мл', 'л', 'шт', 'уп'];

// A model's «2 кг», «1 л», «3 шт» in the product's own unit; nothing sensible — one step of what the shop sells.
function amountFor(p: Product | null, amount: number | null, unit: string | null): { qty: number; unit: LineUnit } {
  if (!p) {
    const own: LineUnit = unit === 'кг' || unit === 'г' ? 'г' : unit === 'л' || unit === 'мл' ? 'мл' : unit === 'уп' ? 'уп' : 'шт';
    const factor = unit === 'кг' || unit === 'л' ? 1000 : 1;
    return { qty: amount !== null ? Math.round(amount * factor * 1000) / 1000 : own === 'г' ? 500 : own === 'мл' ? 1000 : 1, unit: own };
  }
  const step = stepOf(p.sell, p.unit, p.pieceWeight);
  let qty: number | null = null;
  if (amount !== null) {
    if (p.unit === 'г' && (unit === 'кг' || unit === 'г')) qty = unit === 'кг' ? amount * 1000 : amount;
    else if (p.unit === 'мл' && (unit === 'л' || unit === 'мл')) qty = unit === 'л' ? amount * 1000 : amount;
    else if (unit === 'шт' && p.unit === 'шт') qty = amount;
    else if (unit === 'шт' && p.pieceWeight) qty = amount * p.pieceWeight;
    else if (unit === 'уп' && p.sell.sell === 'pack') qty = amount * p.sell.size;
    else if (!unit && p.unit === 'шт') qty = amount;
  }
  // An amount someone asked for goes to the nearest thing the shop sells («1 л молока» is one 900 ml pack).
  const q = qty !== null && qty > 0 ? Math.max(step, Math.round(qty / step) * step) : step;
  return { qty: Math.round(q * 1000) / 1000, unit: p.unit };
}

async function planAddToShopping(input: unknown, { db, me, today }: ToolCtx): Promise<Plan> {
  const raw = obj(input).items;
  if (!Array.isArray(raw) || !raw.length) return fail(TITLE.add_to_shopping, 'Нужен непустой список товаров items.');
  const seen = new Set<string>();
  const wanted = raw.slice(0, 30).flatMap((x) => {
    const o = obj(x);
    const name = str(o.name, 80);
    if (!name || seen.has(norm(name))) return [];
    seen.add(norm(name));
    const amount = num(o.amount);
    const unit = typeof o.unit === 'string' && UNITS.includes(o.unit) ? o.unit : null;
    return [{ name, amount: amount !== null && amount > 0 && amount <= 100_000 ? amount : null, unit, urgent: o.urgent === true }];
  });
  if (!wanted.length) return fail(TITLE.add_to_shopping, 'У каждого товара нужно название (name).');
  const vocab = await vocabOf(db);
  const prices = new Map((await db.prices.toArray()).map((x) => [x.item, Number(x.price_per_unit)]));
  const items = (await db.shopping_items.where('household_id').equals(me.household_id).toArray()).filter((i) => !i.deleted_at);
  const marks = new Map((await db.shopping_marks.bulkGet(items.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
  const catalog = buildCatalog({ vocab, prices, items, marks });
  const trip = await tripListOn(db);
  const open = await openLines(db, me.household_id, today);
  // The product a name means: the dictionary's own or the family's, by exact name, then by the dictionary's guess.
  const productOf = (name: string): Product | null => {
    const g = guessIngredient(name, vocab);
    return catalog.find((p) => norm(p.title) === norm(name)) ?? (g?.exact ? catalog.find((p) => p.item === g.item) ?? null : null);
  };
  const plan = wanted.map((w) => {
    const product = productOf(w.name);
    const key = product?.key ?? stockKey({ item: null, title: w.name });
    const line = open.find((l) => stockKey(l) === key || norm(l.title) === norm(w.name));
    return { ...w, product, line, ...amountFor(product, w.amount, w.unit) };
  });
  // Already in the trip: left as it is. In the list but not the trip: taken into the trip. New: added.
  const inTrip = plan.filter((x) => x.line && (!trip || x.line.in_trip));
  const pull = plan.filter((x) => x.line && trip && !x.line.in_trip);
  const fresh = plan.filter((x) => !x.line);
  const where = trip ? 'в поход' : 'в список';
  const parts = [
    fresh.length ? `${where === 'в поход' ? 'В поход' : 'В список'}: ${listed(fresh.map((x) => `${lowerFirst(x.product?.title ?? x.name)} ${formatAmount(x.qty, x.unit, x.product?.sell, x.product?.pieceWeight ?? null)}`))}` : '',
    pull.length ? `Из списка в поход: ${listed(pull.map((x) => lowerFirst(x.line!.title)))}` : '',
    inTrip.length ? `Уже ${trip ? 'в походе' : 'в списке'}: ${listed(inTrip.map((x) => lowerFirst(x.line!.title)))}` : '',
  ].filter(Boolean);
  return {
    summary: parts.join('. '),
    run: async () => {
      const ids: string[] = [];
      for (const x of fresh) {
        const id = `u:${crypto.randomUUID()}`;
        await addProductLine(db, me, {
          product: x.product, title: x.product?.title ?? capitalize(x.name), qty: x.qty, unit: x.unit, pricePerUnit: x.product?.price ?? null,
          dept: x.product?.dept ?? guessDept(x.name, vocab), inTrip: true, urgent: x.urgent, id,
        });
        ids.push(id);
      }
      const pulled = pull.map((x) => x.line!);
      // The amounts before the pull rounded them to packs, for the undo.
      const before = new Map(pulled.map((l) => [l.id, { qty: l.qty, qty_text: l.qty_text, est_price: l.est_price }]));
      if (pulled.length) await pullToTrip(db, pulled, catalog);
      return {
        result: JSON.stringify({ added: fresh.map((x) => x.product?.title ?? capitalize(x.name)), taken_from_list: pulled.map((l) => l.title), already: inTrip.map((x) => x.line!.title) }),
        ...(ids.length || pulled.length ? { undo: async () => {
          await removeOwnLines(db, ids);
          const rows = (await db.shopping_items.bulkGet(pulled.map((l) => l.id))).filter((l): l is ShoppingItem => !!l && !l.deleted_at);
          const bought = await db.shopping_marks.bulkGet(rows.map((l) => l.id));
          const back = rows.filter((_, k) => !bought[k]?.bought).map((l) => ({ ...l, ...before.get(l.id), in_trip: false }));
          if (back.length) await writeLocal(db, 'shopping_items', back);
        } } : {}),
      };
    },
  };
}

// A product named by the model: the dictionary's own, one already at home under that name, or a new one.
function resolveProduct(name: string, vocab: Map<string, Ingredient>, stock: HomeStock[]): { item: string | null; title: string; dept: string } {
  const n = norm(name);
  const v = [...vocab.values()].find((x) => norm(x.item) === n);
  if (v) return { item: v.item, title: capitalize(v.item), dept: v.dept };
  const s = stock.find((x) => norm(x.title) === n || x.key === `t:${n}`);
  if (s) return { item: s.item, title: s.title, dept: s.dept };
  return { item: null, title: capitalize(name.trim()), dept: guessDept(name, vocab) };
}

type StockChange = { key: string; state: 'have' | 'out'; before?: HomeStock; added: string[]; reopened: ShoppingMark[] };

async function planHomeStock(input: unknown, { db, me, today }: ToolCtx): Promise<Plan> {
  const raw = obj(input).items;
  const items = (Array.isArray(raw) ? raw : []).slice(0, 30).flatMap((x) => {
    const o = obj(x);
    const name = str(o.name, 80);
    return name && (o.state === 'have' || o.state === 'out') ? [{ name, state: o.state as 'have' | 'out' }] : [];
  });
  if (!items.length) return fail(TITLE.set_home_stock, 'Нужен список items: у каждого name и state (have или out).');
  const summary = `Отмечаю дома: ${listed(items.map((i) => `${lowerFirst(i.name)} — ${i.state === 'have' ? 'есть' : 'закончилось'}`))}`;
  if (!(await features(db)).has('homeCart')) return fail(summary, 'Раздел «Дома» на этом телефоне ещё не включён: отметить не получится.');
  const h = me.household_id;
  return {
    summary,
    run: async () => {
      const vocab = await vocabOf(db);
      const changes: StockChange[] = [];
      const done: string[] = [];
      for (const it of items) {
        const stock = await db.home_stock.where('household_id').equals(h).toArray();
        const a = resolveProduct(it.name, vocab, stock.filter((s) => !s.deleted_at));
        const key = stockKey(a);
        const before = await db.home_stock.get([h, key]);
        if (it.state === 'have') {
          await setStock(db, me, a, 'have');
          changes.push({ key, state: 'have', before, added: [], reopened: [] });
          done.push(`${a.title}: есть`);
          continue;
        }
        const lines = (await db.shopping_items.where('household_id').equals(h).toArray()).filter((i) => !i.deleted_at);
        const marks = new Map((await db.shopping_marks.bulkGet(lines.map((i) => i.id))).filter((m): m is ShoppingMark => !!m).map((m) => [m.item_id, m]));
        const liveIds = new Set(lines.map((i) => i.id));
        const s: HomeStock = before ?? { household_id: h, key, ...a, state: 'have', by_member: me.id, updated_at: '', deleted_at: null };
        const r = await runOut(db, me, s, { items: lines, marks, weekStart: mondayOf(today) });
        const after = (await db.shopping_items.where('household_id').equals(h).toArray()).filter((i) => !i.deleted_at && stockKey(i) === key);
        const reopened = [...marks.values()].filter((m) => m.at_home && after.some((i) => i.id === m.item_id));
        changes.push({ key, state: 'out', before, added: after.filter((i) => !liveIds.has(i.id)).map((i) => i.id), reopened: r === 'reopened' ? reopened : [] });
        done.push(`${a.title}: закончилось, ${r === 'already' ? 'уже было в покупках' : 'теперь в покупках'}`);
      }
      return { result: JSON.stringify({ done }), undo: () => undoStock(db, me, changes) };
    },
  };
}

// Back to how it was, but only where nobody changed the product or its line since.
async function undoStock(db: LocalDb, me: Member, changes: StockChange[]) {
  for (const c of [...changes].reverse()) {
    const cur = await db.home_stock.get([me.household_id, c.key]);
    if (cur && !cur.deleted_at && cur.state === c.state && cur.by_member === me.id) {
      if (c.before) await writeLocal(db, 'home_stock', [c.before]);
      else await removeStock(db, cur);
    }
    await removeOwnLines(db, c.added);
    for (const m of c.reopened) {
      const now = await db.shopping_marks.get(m.item_id);
      if (now && !now.at_home && !now.bought) await writeLocal(db, 'shopping_marks', [m]);
    }
  }
}

// A family member by name, by who they are («мама») or by a case form of either («Маме»).
export function findMember(name: string, members: Member[]): Member | null {
  const n = norm(name);
  if (!n) return null;
  const exact = members.find((m) => norm(m.name) === n) ?? members.find((m) => m.kin && KIN_WORD[m.kin] === n);
  if (exact) return exact;
  const s = stem(n);
  const near = members.filter((m) => stem(m.name) === s || (m.kin && stem(KIN_WORD[m.kin]) === s));
  return near.length === 1 ? near[0] : null;
}

async function planAskFamily(input: unknown, { me, members, db, today }: ToolCtx): Promise<Plan> {
  const o = obj(input);
  const to = str(o.to, 60);
  const text = str(o.text, 400);
  const todayIso = isoOf(today);
  const askable = members.filter((m) => m.id !== me.id && m.user_id).map((m) => m.name);
  const can = askable.length ? `Попросить можно: ${askable.join(', ')}.` : 'Попросить в приложении пока некого.';
  const head = `${TITLE.ask_family}: ${to || 'кому?'}`;
  if (!to) return fail(head, `Нужно имя: кого попросить. ${can}`);
  if (!text) return fail(head, 'Нужен текст просьбы.');
  const m = findMember(to, members);
  if (!m) return fail(head, `В семье нет «${to}». ${can}`);
  if (m.id === me.id) return fail(head, `Себя попросить нельзя. ${can}`);
  if (!m.user_id) return fail(head, `${m.name}: нет своего входа в приложение, просьба не дойдёт. ${can}`);
  const due = given(o.due) ? isoDate(o.due) : null;
  if (given(o.due) && !due) return fail(head, 'Срок — дата в формате YYYY-MM-DD.');
  if (due && due < todayIso) return fail(head, 'Этот срок уже прошёл.');
  const title = text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text;
  const urgent = o.urgent === true;
  return {
    summary: `${TITLE.ask_family}: ${m.name} — «${title}»${due ? ` · ${dueWhen(due, todayIso)}` : ''}${urgent ? ' · срочно' : ''}`,
    run: async () => {
      await askFor(db, me, { to_id: m.id, title, due_on: due, urgent });
      return { result: `Просьба на Доске. ${m.name} получит уведомление.` };
    },
  };
}

async function planOfferDish(input: unknown, { db, me, members, today }: ToolCtx): Promise<Plan> {
  const o = obj(input);
  const id = str(o.recipe_id, 100);
  const todayIso = isoOf(today);
  const r = id ? await db.recipes.get(id) : undefined;
  if (!r || r.deleted_at) return fail(TITLE.offer_dish, `Рецепта с id «${id}» нет в базе. Найди его через find_recipes.`);
  const head = `${TITLE.offer_dish}: ${r.name}`;
  const date = isoDate(o.date);
  if (!date) return fail(head, 'Дата — в формате YYYY-MM-DD.');
  if (date < todayIso) return fail(head, 'Этот день уже прошёл.');
  if (!MEALS.includes(o.meal as Meal)) return fail(head, 'meal: breakfast, lunch, snack или dinner.');
  if (o.how !== 'over' && o.how !== 'instead') return fail(head, 'how: over (поверх меню) или instead (вместо блюда меню).');
  const meal = o.meal as Meal;
  const how = o.how;
  let cookMyself = o.cook_myself === true;
  let to: Member | null = null;
  const toName = str(o.to, 60);
  if (!cookMyself && toName) {
    to = findMember(toName, members);
    const askable = members.filter((m) => m.id !== me.id && m.user_id).map((m) => m.name).join(', ');
    if (!to) return fail(head, `В семье нет «${toName}». Попросить можно: ${askable}.`);
    if (to.id === me.id) { cookMyself = true; to = null; }
    else if (!to.user_id) return fail(head, `${to.name}: нет своего входа в приложение. Попросить можно: ${askable}.`);
  }
  const who = cookMyself ? 'готовлю сам' : to ? `просим: ${to.name}` : 'кто угодно из семьи';
  return {
    summary: `${head} — ${dayWord(date, todayIso)} ${MEAL_FOR[meal]}, ${how === 'over' ? 'поверх меню' : 'вместо блюда меню'} · ${who}`,
    run: async () => {
      await createOffer(db, { me, to: to?.id ?? null, dish: r.id, date, meal, how, cookMyself });
      return { result: cookMyself ? 'Записано: готовит сам спрашивающий, продукты блюда добавлены в покупки.' : `Блюдо предложено${to ? `, ${to.name} получит уведомление` : ' семье'}.` };
    },
  };
}

// A dish from the base on a meal of this or next week, or the meal cleared, as «Заменить» and «Убрать» in
// the menu do: the list is rebuilt, a dish taken «instead» of that meal goes, and undo puts it all back.
async function planSetMeal(input: unknown, { db, me, today }: ToolCtx): Promise<Plan> {
  const o = obj(input);
  const todayIso = isoOf(today);
  const date = isoDate(o.date);
  if (!date) return fail(TITLE.set_meal, 'Дата — в формате YYYY-MM-DD.');
  if (!MEALS.includes(o.meal as Meal)) return fail(TITLE.set_meal, 'meal: breakfast, lunch, snack или dinner.');
  const meal = o.meal as Meal;
  const what = `${MEAL_LABEL[meal].toLowerCase()} ${dayWord(date, todayIso)}`;
  const id = str(o.recipe_id, 100);
  const r = id ? await db.recipes.get(id) : undefined;
  if (id && (!r || r.deleted_at)) return fail(`${TITLE.set_meal}: ${what}`, `Рецепта с id «${id}» нет в базе. Найди его через find_recipes или сохрани через save_recipe.`);
  const head = r ? `В меню на ${what}: ${r.name}` : `Убрать из меню: ${what}`;
  if (date < todayIso) return fail(head, 'Этот день уже прошёл.');
  const [y, m, d] = date.split('-').map(Number);
  const weekStart = mondayOf(new Date(y, m - 1, d));
  const start = mondayOf(today);
  if (weekStart !== start && weekStart !== addDaysIso(start, 7)) return fail(head, 'Менять можно только меню этой и следующей недели.');
  const week = await db.weeks.where('[household_id+starts_on]').equals([me.household_id, weekStart]).filter((w) => !w.deleted_at).first();
  if (week && !canEditWeek(me, week)) return fail(head, 'Утверждённое меню меняют только родители. Предложи блюдо через offer_dish (how: instead).');
  if (!week && me.role !== 'parent') return fail(head, 'Меню на эту неделю ещё не составлено. Предложи блюдо через offer_dish.');
  const day = dayOfWeek(new Date(y, m - 1, d));
  const slot = week ? await db.week_slots.get([week.id, day, meal]) : undefined;
  const swap = (await db.dish_offers.where('household_id').equals(me.household_id).toArray())
    .find((x) => !x.deleted_at && x.on_date === date && x.meal === meal && x.how === 'instead' && x.status === 'taken');
  const nowId = swap?.dish_id ?? slot?.dish_id;
  const now = nowId ? (await db.recipes.get(nowId))?.name ?? 'блюдо' : slot?.simple?.simple;
  const summary = `${head}${now ? ` (было: ${lowerFirst(now)})` : ''}`;
  if (!r && !now) return fail(head, 'Этот приём пищи и так пустой.');
  if (r && r.id === nowId) return fail(head, 'Это блюдо там уже стоит.');
  if (r) {
    const notEat = await db.not_eat.where('household_id').equals(me.household_id).toArray();
    const blocked = blockedBy(r, (await db.recipe_ingredients.where('recipe_id').equals(r.id).toArray()).map((x) => x.item), notEat);
    if (blocked) return fail(head, `Не поставлено: «${blocked}» в списке «не едим».`);
  }
  return {
    summary,
    run: async () => {
      // No menu for that week yet: a parent gets an empty one, as «Только нужные дни» makes.
      const w = week ?? await setWeekFromTemplate(db, { household: me.household_id, startsOn: weekStart, template: null, status: 'approved', by: me.id });
      const sides = r && meal === 'dinner' ? (await db.recipe_sides.where('recipe_id').equals(r.id).toArray()).map((x) => x.side_id) : [];
      const undo = await changeMeal(db, w, day, meal, r ? { recipe: r, sides } : { fromSlot: NO_MEAL }, swap);
      const list = w.status === 'approved' ? ' Покупки пересчитаны.' : '';
      return { result: r ? `В меню: ${what} — ${r.name}.${list}` : `${capitalize(what)} убран из меню.${list}`, undo };
    },
  };
}

const CATS: Category[] = ['breakfast', 'soup', 'main', 'side', 'salad', 'snack', 'dessert'];
const SPOON: Record<string, [number, number]> = { 'ст. л.': [15, 20], 'ч. л.': [5, 7], стакан: [250, 200] };

// A product of the recipe in the dictionary's words: the same name, every word of a dictionary name, or the
// one dictionary product starting with the same word. Several such products — the model has to say which.
function recipeProduct(name: string, vocab: Ingredient[]): { item?: Ingredient; choices?: string[] } {
  const n = norm(name);
  const same = vocab.find((v) => norm(v.item) === n);
  if (same) return { item: same };
  const all = findItem(name, vocab);
  if (all) return { item: all };
  const head = stem(n.split(' ')[0]);
  const near = vocab.filter((v) => stem(norm(v.item).split(' ')[0]) === head);
  return near.length === 1 ? { item: near[0] } : near.length ? { choices: near.map((v) => v.item) } : {};
}

// The amount in the product's own unit. A spoon or a glass is turned into grams or millilitres by the common
// kitchen measure and kept in the note to check, as the recipe editor does; anything else unclear — to taste.
function recipeQty(v: Ingredient, amount: number | null, unit: string | null): { qty: number | null; note: string } {
  if (amount === null || unit === 'по вкусу') return { qty: null, note: '' };
  const u = unit ?? v.unit;
  const said = `${dec(amount)} ${u}`;
  const spoon = SPOON[u];
  let q: number | null = null;
  if (v.unit === 'г') q = u === 'г' ? amount : u === 'кг' ? amount * 1000 : u === 'шт' && v.piece_weight ? amount * v.piece_weight : spoon ? amount * spoon[1] : null;
  else if (v.unit === 'мл') q = u === 'мл' ? amount : u === 'л' ? amount * 1000 : spoon ? amount * spoon[0] : null;
  else if (v.unit === 'шт') q = u === 'шт' ? amount : (u === 'г' || u === 'кг') && v.piece_weight ? (u === 'кг' ? amount * 1000 : amount) / v.piece_weight : null;
  return q !== null && q > 0 ? { qty: Math.round(q * 100) / 100, note: spoon ? said : '' } : { qty: null, note: said };
}

// A new recipe in «Наши рецепты», saved like the recipe editor saves one. Products outside the dictionary
// cannot be rows (the list buys by the dictionary), so they go into the description as text.
async function planSaveRecipe(input: unknown, { db, me }: ToolCtx): Promise<Plan> {
  const o = obj(input);
  const name = str(o.name, 80);
  if (!name) return fail(TITLE.save_recipe, 'Нужно название блюда (name).');
  const head = `${TITLE.save_recipe}: ${name}`;
  const category = CATS.find((c) => c === o.category);
  if (!category) return fail(head, `category: ${CATS.join(', ')}.`);
  const minutes = num(o.minutes);
  const servings = num(o.servings);
  if (minutes === null || minutes < 1 || minutes > 600) return fail(head, 'minutes — сколько минут готовить, от 1 до 600.');
  if (servings === null || !Number.isInteger(servings) || servings < 1 || servings > 20) return fail(head, 'servings — целое число порций от 1 до 20.');
  const steps = (Array.isArray(o.steps) ? o.steps : []).map((x) => str(x, 400)).filter(Boolean).slice(0, 20);
  if (!steps.length) return fail(head, 'Нужны шаги приготовления (steps).');
  const dima = o.dima === 'adapt' || o.dima === 'skip' ? o.dima : 'ok';
  const own = (await db.recipes.where('household_id').equals(me.household_id).toArray()).find((r) => !r.deleted_at && norm(r.name) === norm(name));
  if (own) return fail(head, `Такой рецепт у семьи уже есть, id «${own.id}». Используй его.`);
  const vocab = [...(await vocabOf(db)).values()];
  const rows: DraftRow[] = [];
  const missing: string[] = [];
  const unclear: string[] = [];
  for (const x of (Array.isArray(o.products) ? o.products : []).slice(0, 40)) {
    const p = obj(x);
    const pname = str(p.name, 80);
    if (!pname) continue;
    const amount = num(p.amount);
    const unit = typeof p.unit === 'string' ? p.unit : null;
    const found = recipeProduct(pname, vocab);
    if (found.choices) { unclear.push(`«${pname}»: ${found.choices.join(' или ')}`); continue; }
    if (!found.item) { missing.push(`${lowerFirst(pname)}${amount !== null && unit !== 'по вкусу' ? ` ${dec(amount)} ${unit ?? ''}`.trimEnd() : ''}`); continue; }
    const q = recipeQty(found.item, amount !== null && amount > 0 ? amount : null, unit);
    rows.push({ item: found.item.item, qty: q.qty === null ? '' : String(q.qty), toTaste: q.qty === null, note: [str(p.note, 40), q.note].filter(Boolean).join(', ') });
  }
  if (unclear.length) return fail(head, `Уточни продукты, назови их полностью: ${unclear.join('; ')}.`);
  if (!rows.length) return fail(head, `Ни одного продукта нет в справочнике приложения${missing.length ? `: ${missing.join(', ')}` : ''}. Назови их, как в магазине.`);
  const about = [str(o.about, 200), missing.length ? `Ещё нужно: ${missing.join(', ')}`.replace(/\.?$/, '.') : ''].filter(Boolean).join(' ');
  const draft: Draft = {
    name, about, category, time: String(Math.round(minutes)), servings: String(servings), dima, dimaNote: dima === 'ok' ? '' : str(o.dima_note, 200),
    rows, steps, source: '',
  };
  const gap = missingOf(draft);
  if (gap.length) return fail(head, `Не хватает: ${gap.join(', ')}.`);
  return {
    summary: `${head} · ${rows.length} ${rows.length % 10 === 1 && rows.length % 100 !== 11 ? 'продукт' : [2, 3, 4].includes(rows.length % 10) && ![12, 13, 14].includes(rows.length % 100) ? 'продукта' : 'продуктов'}${missing.length ? `, без справочника: ${listed(missing)}` : ''}`,
    run: async () => {
      const id = await saveRecipe(me.household_id, draft);
      return {
        result: JSON.stringify({
          id, name, saved: 'в «Наши рецепты»',
          ...(missing.length ? { not_in_dictionary: missing, note: 'Этих продуктов нет в справочнике: они записаны в описание рецепта и сами в покупки не попадут.' } : {}),
        }),
        undo: async () => { await deleteRecipe((await db.recipes.get(id)) ?? ({ id } as Recipe)); },
      };
    },
  };
}

async function planAddExpense(input: unknown, { db, me, today }: ToolCtx): Promise<Plan> {
  if (me.role !== 'parent') return fail(TITLE.add_expense, 'Нет доступа: расходы вносят только родители.');
  const o = obj(input);
  const amount = num(o.amount);
  const rubles = amount === null ? 0 : Math.round(amount);
  if (rubles < 1 || rubles > MAX_RUB) return fail(TITLE.add_expense, `Сумма — число рублей от 1 до ${rubs(MAX_RUB)}.`);
  const asked = str(o.category, 40);
  const category = CATEGORIES.find((c) => norm(c) === norm(asked)) ?? 'Другое';
  const note = str(o.note, 80);
  const todayIso = isoOf(today);
  const date = given(o.date) ? isoDate(o.date) : todayIso;
  if (!date) return fail(TITLE.add_expense, 'Дата — в формате YYYY-MM-DD.');
  if (date > todayIso) return fail(TITLE.add_expense, 'Дата расхода ещё не наступила.');
  return {
    summary: `${TITLE.add_expense}: ${rubs(rubles)} · ${category}${note ? ` · «${note}»` : ''} · ${dayWord(date, todayIso)}`,
    run: async () => {
      await saveEntry(db, me, { kind: 'expense', amount: rubles, category, member_id: me.id, on_date: date, note });
      const moved = asked && norm(asked) !== norm(category) ? ` Категории «${asked}» нет, записано в «Другое».` : '';
      return { result: `Расход внесён: ${rubs(rubles)}, ${category}.${moved}` };
    },
  };
}

const PLANS: Record<string, (input: unknown, ctx: ToolCtx) => Promise<Plan>> = {
  find_recipes: planFindRecipes, get_recipe: planGetRecipe, add_to_shopping: planAddToShopping, set_home_stock: planHomeStock,
  ask_family: planAskFamily, offer_dish: planOfferDish, add_expense: planAddExpense, set_meal: planSetMeal, save_recipe: planSaveRecipe,
};

async function plan(name: string, input: unknown, ctx: ToolCtx): Promise<Plan> {
  const make = PLANS[name];
  if (!make) return fail(name, `Инструмента «${name}» нет.`);
  if (TOOLS.find((t) => t.name === name)?.parentsOnly && ctx.me.role !== 'parent') return fail(TITLE[name] ?? name, 'Нет доступа: это только для родителей.');
  return make(input, ctx);
}

// What a card says about a call before it runs, and whether the call can run at all (a confirm card
// is shown only for a call that can).
export async function planTool(name: string, input: unknown, ctx: ToolCtx): Promise<{ summary: string; error?: string }> {
  const p = await plan(name, input, ctx);
  return p.error ? { summary: p.summary, error: p.error } : { summary: p.summary };
}
export const describeTool = async (name: string, input: unknown, ctx: ToolCtx) => (await planTool(name, input, ctx)).summary;

export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolRun> {
  const p = await plan(name, input, ctx);
  if (p.error || !p.run) return { result: `Ошибка: ${p.error ?? 'не получилось'}`, summary: p.summary, error: true };
  const done = await p.run();
  return { result: done.result, summary: p.summary, ...(done.undo ? { undo: done.undo } : {}) };
}
