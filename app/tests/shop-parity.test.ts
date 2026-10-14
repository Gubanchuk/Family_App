// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuList, type SlotIn } from '../src/features/shop/build';
import type { Ingredient } from '../src/data/db';

const root = resolve(__dirname, '../..');
const read = (p: string) => JSON.parse(readFileSync(join(root, 'content', p), 'utf8'));
// Food cost per template from `python content/tools/week_cost.py .` on 2026-10-14 (pantry excluded).
const FOOD: Record<string, number> = { autumn: 9048, winter: 9527, spring: 11530, summer: 9379, budget: 7223, quick: 8116 };

describe('shopping list cost matches the week cost script', () => {
  const vocab = new Map<string, Ingredient>(read('ingredients.json').map((x: Record<string, unknown>) => [x.item, { item: x.item, unit: x.unit, dept: x.dept, grp: x.group, piece_weight: x.pieceWeight ?? null, piece_name: x.pieceName ?? null, pantry: !!x.pantry }]));
  const prices = new Map<string, number>(read('prices.json').prices.map((p: { item: string; pricePerUnit: number }) => [p.item, p.pricePerUnit]));
  const servings = new Map<string, number>();
  const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
  for (const f of readdirSync(join(root, 'content', 'recipes')).filter((x) => x.endsWith('.json'))) {
    for (const r of read(`recipes/${f}`).recipes) {
      servings.set(r.id, r.servings);
      ingredientsOf.set(r.id, r.ingredients.map((i: { item: string; qty?: number }) => ({ item: i.item, qty: i.qty ?? null })));
    }
  }
  for (const w of read('weeks.json')) {
    it(`${w.id}`, () => {
      const slots: SlotIn[] = [];
      w.days.forEach((d: Record<string, any>, day: number) => {
        const lunch = d.lunch ?? {}; const dinner = d.dinner ?? {}; const snack = d.snack;
        slots.push({ day, meal: 'breakfast', dish_id: d.breakfast ?? null, side_id: null, salad_id: null, simple: null });
        slots.push({ day, meal: 'lunch', dish_id: lunch.soup ?? null, side_id: null, salad_id: lunch.salad ?? null, simple: null });
        slots.push({ day, meal: 'snack', dish_id: typeof snack === 'string' ? snack : null, side_id: null, salad_id: null, simple: typeof snack === 'object' ? snack : null });
        slots.push({ day, meal: 'dinner', dish_id: dinner.main ?? null, side_id: dinner.side ?? null, salad_id: dinner.salad ?? null, simple: null });
      });
      const total = buildMenuList({ slots, servings, ingredientsOf, vocab, prices, portions: 3.5 }).reduce((s, l) => s + (l.est ?? 0), 0);
      expect(Math.abs(Math.round(total) - FOOD[w.id])).toBeLessThanOrEqual(1);
    });
  }
});
