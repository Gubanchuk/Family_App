import type { LocalDb } from '../../data/db';
import { buildMenuList } from '../shop/build';

// What a template's shopping list would cost this family, by the same rules the list is built with.
// A template with a dish missing on this phone gets no price rather than a wrong one.
export async function templateCosts(db: LocalDb): Promise<Map<string, number>> {
  const [slots, recipes, rows, vocab, prices, portions] = await Promise.all([
    db.template_slots.toArray(), db.recipes.toArray(), db.recipe_ingredients.toArray(),
    db.ingredients.toArray(), db.prices.toArray(), db.meta.get('family_portions'),
  ]);
  const servings = new Map(recipes.filter((r) => !r.deleted_at).map((r) => [r.id, r.servings]));
  const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
  for (const r of rows) ingredientsOf.set(r.recipe_id, [...(ingredientsOf.get(r.recipe_id) ?? []), { item: r.item, qty: r.qty === null ? null : Number(r.qty) }]);
  const shared = {
    servings, ingredientsOf,
    vocab: new Map(vocab.map((v) => [v.item, v])),
    prices: new Map(prices.map((p) => [p.item, Number(p.price_per_unit)])),
    portions: Number(portions?.value ?? 3.5),
  };
  const byTemplate = new Map<string, typeof slots>();
  for (const s of slots) byTemplate.set(s.template_id, [...(byTemplate.get(s.template_id) ?? []), s]);
  const out = new Map<string, number>();
  for (const [id, list] of byTemplate) {
    if (list.length < 28) continue;
    const dishes = list.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]).filter((x): x is string => !!x);
    if (dishes.some((d) => !servings.has(d))) continue;
    out.set(id, buildMenuList({ ...shared, slots: list }).reduce((sum, l) => sum + (l.est ?? 0), 0));
  }
  return out;
}
