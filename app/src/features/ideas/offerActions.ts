import { writeLocal } from '../../data/sync';
import type { DishOffer, LocalDb, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import { addDaysIso, dayOfWeek, mondayOf, type Meal } from '../menu/week';
import { buildMenuList, formatQty } from '../shop/build';
import { capitalize } from '../shop/menuList';

export const MEAL_FOR: Record<Meal, string> = { breakfast: 'на завтрак', lunch: 'на обед', snack: 'на полдник', dinner: 'на ужин' };
export const COLLECTIONS = [
  { id: 'weekend', name: 'Выходной проект' }, { id: 'world', name: 'Кухни мира' }, { id: 'cafe', name: 'Как в кафе' },
  { id: 'quick-new', name: 'Быстро и необычно' }, { id: 'sweet', name: 'Сладкое' }, { id: 'kids-cook', name: 'Готовим с детьми' },
];

export function offerDate(when: 'today' | 'tomorrow' | 'weekend', today: Date): string {
  const t = addDaysIso(mondayOf(today), dayOfWeek(today));
  if (when === 'today') return t;
  if (when === 'tomorrow') return addDaysIso(t, 1);
  return dayOfWeek(today) >= 5 ? t : addDaysIso(mondayOf(today), 5);
}

export async function createOffer(db: LocalDb, a: { me: Member; to: string | null; dish: string; date: string; meal: Meal; how: 'over' | 'instead'; cookMyself?: boolean }): Promise<DishOffer> {
  const offer: DishOffer = {
    id: crypto.randomUUID(), household_id: a.me.household_id, from_member: a.me.id, to_member: a.cookMyself ? a.me.id : a.to,
    dish_id: a.dish, on_date: a.date, meal: a.meal, how: a.how, status: a.cookMyself ? 'taken' : 'open',
    taken_by: a.cookMyself ? a.me.id : null, updated_at: '', deleted_at: null,
  };
  await writeLocal(db, 'dish_offers', [offer]);
  if (a.cookMyself) await addOfferItems(db, offer);
  return offer;
}

export async function takeOffer(db: LocalDb, offer: DishOffer, me: Member) {
  await writeLocal(db, 'dish_offers', [{ ...offer, status: 'taken', taken_by: me.id }]);
  await addOfferItems(db, offer);
}

export async function declineOffer(db: LocalDb, offer: DishOffer) {
  await writeLocal(db, 'dish_offers', [{ ...offer, status: 'declined' }]);
}

export async function addOfferItems(db: LocalDb, offer: DishOffer) {
  const recipe = await db.recipes.get(offer.dish_id);
  if (!recipe) return;
  const rows = await db.recipe_ingredients.where('recipe_id').equals(recipe.id).toArray();
  const lines = buildMenuList({
    slots: [{ day: 0, meal: offer.meal, dish_id: recipe.id, side_id: null, salad_id: null, simple: null }],
    servings: new Map([[recipe.id, recipe.servings]]),
    ingredientsOf: new Map([[recipe.id, rows.map((r) => ({ item: r.item, qty: r.qty === null ? null : Number(r.qty) }))]]),
    vocab: new Map((await db.ingredients.toArray()).map((v) => [v.item, v])),
    prices: new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)])),
    portions: Number((await db.meta.get('family_portions'))?.value ?? 3.5),
  });
  const items: ShoppingItem[] = lines.map((l) => ({
    id: `o:${offer.id}:${l.item}`, household_id: offer.household_id, week_id: null, offer_id: offer.id, source: 'offer', item: l.item,
    title: capitalize(l.item), qty: l.qty === null ? null : Math.round(l.qty * 10) / 10, unit: l.unit, qty_text: formatQty(l.qty, l.unit),
    dept: l.dept, urgent: false, est_price: l.est === null ? null : Math.round(l.est), added_by: null, updated_at: '', deleted_at: null,
  }));
  if (items.length) await writeLocal(db, 'shopping_items', items);
}
