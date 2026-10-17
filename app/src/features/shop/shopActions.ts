import { writeLocal } from '../../data/sync';
import type { Ingredient, LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import { capitalize } from './menuList';
import { stockFromBought } from './stock';

// The server stamps bought_at; a mark that already has it keeps a local copy right away, so Money does not
// move a purchase until the next sync. A mark without it (no column on the server yet) never sends one.
const boughtAt = (prev: ShoppingMark | undefined, bought: boolean) =>
  prev && 'bought_at' in prev ? { bought_at: bought ? (prev.bought ? prev.bought_at : new Date().toISOString()) : null } : {};

// at_home travels only on marks that already have it, for the same reason. A bought line is never at home.
const atHome = (prev: ShoppingMark | undefined, value: boolean) => (prev && 'at_home' in prev ? { at_home: value } : {});

// With home (the vocabulary) a bought line also puts its product «at home».
export async function setBought(db: LocalDb, item: ShoppingItem, me: Member, bought: boolean, prev?: ShoppingMark, home?: { vocab: Map<string, Ingredient> }) {
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought, by_member: me.id, price_real: prev?.price_real ?? null, ...boughtAt(prev, bought), ...atHome(prev, false) }]);
  if (bought && home) await stockFromBought(db, me, item, home.vocab);
}

export async function setRealPrice(db: LocalDb, item: ShoppingItem, me: Member, price: number | null, prev?: ShoppingMark) {
  // A price on a line kept as «есть дома» leaves it at home, not bought.
  const home = !!prev?.at_home;
  const bought = home ? false : prev?.bought ?? true;
  await writeLocal(db, 'shopping_marks', [{ item_id: item.id, household_id: item.household_id, bought, by_member: prev?.by_member ?? me.id, price_real: price, ...boughtAt(prev, bought), ...atHome(prev, home) }]);
}

// A hand-typed line goes to the department a shopper expects: «хлеб» to Хлеб, «сыр» to dairy.
// Only an exact match links the line to the product itself; a near one just picks the department.
export function guessIngredient(title: string, vocab: Map<string, Ingredient>): { exact: boolean; dept: string; item: string | null } | null {
  const t = title.trim().toLowerCase();
  const hit = vocab.get(t);
  if (hit) return { exact: true, dept: hit.dept, item: hit.item };
  const first = t.split(/\s+/)[0];
  // «помидор» finds «помидоры», «яблоко» finds «яблоки».
  const stem = first.length > 4 ? first.slice(0, -1) : first;
  const all = [...vocab.values()];
  const near = all.find((v) => v.item.startsWith(`${t} `))
    ?? all.find((v) => { const head = v.item.split(' ')[0]; return head === first || (stem.length >= 4 && head.startsWith(stem)); });
  return near ? { exact: false, dept: near.dept, item: null } : null;
}

// Words that mark a line as not food; a stem matches the start of any word («порош» → «порошок»).
const NON_FOOD: Array<[string, RegExp]> = [
  ['Аптека', /(^|\s)(таблет|лекарс|сироп|пластыр|бинт|витамин|капли|мазь|мази|градусник|термометр|аспирин|парацетам|ибупроф|нурофен|йод(?=\s|$)|зел[её]нк|антисепт|спрей от|спрей в нос)/],
  ['Одежда и обувь', /(^|\s)(носк|колгот|футболк|майк|трус|куртк|штан|брюки|джинс|шапк|шарф|варежк|перчатк|кроссовк|ботин|сапог|туфл|кеды|тапк|тапоч|плать|юбк|свитер|кофт|пижам|шорт|рубаш|комбинезон|обувь|одежд)/],
  ['Техника', /(^|\s)(процессор|видеокарт|ноутбук|компьютер|телефон|смартфон|наушник|зарядк|кабел|мышк|клавиатур|монитор|планшет|колонк|телевизор|флешк|роутер|принтер|картридж|приставк|джойстик|геймпад|фен(?=\s|$)|утюг|чайник электр|пылесос)/],
  ['Для дома', /(^|\s)(средств|порош|мыл|шампун|бумаг|салфет|губк|пакеты для|мешк|лампоч|батарейк|зубн|щ[её]тк|гель|кондиционер|отбелив|освежит|фольг|пл[её]нк|подгуз|пел[её]нк|тряпк|полотенц|свеч|спичк|ватн|прокладк|туалетн|бытов|для посуды|для стирки)/],
];
export const NON_FOOD_DEPTS = ['Для дома', 'Аптека', 'Одежда и обувь', 'Техника', 'Другое'];

// Phrases that name a household thing even when a word in them looks like food or medicine
// («таблетки для посудомоечной машины»).
const HOUSE_PHRASES = /(для посуд|посудомо|для стирк|туалетн|перчатки резин|для мусора|мусорн|для унитаз|для пола|для окон)/;

// A non-food department named by a word of the title, for lines written without the product list.
export function guessNonFood(title: string): string | null {
  const t = title.trim().toLowerCase();
  if (HOUSE_PHRASES.test(t)) return 'Для дома';
  return NON_FOOD.find(([, re]) => re.test(t))?.[0] ?? null;
}

// The department a hand-written line goes to: an exact product; a household phrase; a product named by the
// first word («Молоко 2 пакета» is milk, not a bag); then non-food words anywhere; else «Другое».
export function guessDept(title: string, vocab: Map<string, Ingredient>): string {
  const g = guessIngredient(title, vocab);
  if (g?.exact) return g.dept;
  const t = title.trim().toLowerCase();
  if (HOUSE_PHRASES.test(t)) return 'Для дома';
  if (g) return g.dept;
  const nonFood = NON_FOOD.find(([, re]) => re.test(t));
  return nonFood ? nonFood[0] : 'Другое';
}

export async function addManualItem(db: LocalDb, me: Member, a: { title: string; qtyText: string; urgent: boolean; vocab: Map<string, Ingredient>; dept?: string }): Promise<string> {
  const title = a.title.trim();
  const g = guessIngredient(title, a.vocab);
  const dept = a.dept ?? guessDept(title, a.vocab);
  await writeLocal(db, 'shopping_items', [{
    id: `u:${crypto.randomUUID()}`, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual',
    item: g?.item && g.dept === dept ? g.item : null, title: capitalize(title), qty: null, unit: null, qty_text: a.qtyText.trim(), dept,
    urgent: a.urgent, est_price: null, added_by: me.id, deleted_at: null,
  }]);
  return dept;
}

export async function removeItem(db: LocalDb, item: ShoppingItem) {
  await writeLocal(db, 'shopping_items', [{ ...item, deleted_at: new Date().toISOString() }]);
}

export async function goShopping(db: LocalDb, me: Member, at = new Date()) {
  await writeLocal(db, 'shop_trips', [{ id: crypto.randomUUID(), household_id: me.household_id, member_id: me.id, started_at: at.toISOString() }]);
}
