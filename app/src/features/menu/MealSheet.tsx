import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import Icon from '../shell/Icon';
import type { Ingredient, LocalDb, Recipe, SimpleSnack } from '../../data/db';
import RecipeBody, { DimaLine } from '../ideas/RecipeBody';
import { formatQty } from '../shop/build';

export type MealParts = { dish_id: string | null; side_id: string | null; salad_id: string | null; simple: SimpleSnack | null };

export const LOCKED_NOTE = 'Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.';
const portionsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'порция' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'порции' : 'порций');

// A meal opens on what is cooked: the dish, its side and salad, each with its recipe.
// Replacing is a separate button, so looking at a recipe never changes the menu by accident.
export default function MealSheet({ db, parts, recipes, onReplace, onClose }: {
  db: LocalDb; parts: MealParts; recipes: Map<string, Recipe>; onReplace: (() => void) | null; onClose: () => void;
}) {
  const ids = [parts.dish_id, parts.side_id, parts.salad_id].filter((x): x is string => !!x && recipes.has(x));
  const [pick, setPick] = useState(ids[0] ?? null);
  const recipe = pick ? recipes.get(pick) : undefined;
  const data = useLiveQuery(async () => {
    const [rows, portions] = await Promise.all([
      pick ? db.recipe_ingredients.where('recipe_id').equals(pick).sortBy('pos') : Promise.resolve([]),
      db.meta.get('family_portions'),
    ]);
    const items = [...rows.map((r) => r.item), ...(parts.simple?.items.map((i) => i.item) ?? [])];
    const vocab = new Map((await db.ingredients.bulkGet(items)).filter((v): v is Ingredient => !!v).map((v) => [v.item, v]));
    return { rows, vocab, portions: Number(portions?.value ?? 3.5) };
  }, [db, pick, parts.simple]);

  const actions = onReplace
    ? <button type="button" className="btn soft" onClick={onReplace}><Icon name="swap" />Заменить</button>
    : <p className="note" style={{ margin: 0 }}>{LOCKED_NOTE}</p>;

  if (!recipe) {
    // A simple snack has no recipe: what to put on the plate, for the whole family.
    const simple = parts.simple;
    return (
      <Sheet title={simple?.simple ?? 'Блюдо не загружено'} onClose={onClose} actions={actions}>
        {simple && data ? (
          <>
            <h3 className="sh-h">Продукты на семью</h3>
            <ul className="ing">
              {simple.items.map((i) => <li key={i.item}><span>{i.item.charAt(0).toUpperCase() + i.item.slice(1)}</span><span>{formatQty(i.qty * data.portions, data.vocab.get(i.item)?.unit ?? 'г')}</span></li>)}
            </ul>
          </>
        ) : <p className="note" style={{ margin: '0 16px 16px' }}>Рецепт появится, когда приложение откроется с интернетом.</p>}
      </Sheet>
    );
  }
  // A soup is cooked as a whole pot for several days; everything else is scaled to the family.
  const pot = recipe.category === 'soup';
  return (
    <Sheet title={recipe.name} sub={recipe.about} onClose={onClose} actions={actions}>
      {ids.length > 1 ? (
        <div className="col-chips sheet-chips" role="group" aria-label="Что входит">
          {ids.map((id) => <button key={id} type="button" aria-pressed={id === pick} onClick={() => setPick(id)}>{recipes.get(id)!.name}</button>)}
        </div>
      ) : null}
      <p className="meta-line"><span>{recipe.time_total} минут</span>{pot ? <span>кастрюля на {recipe.servings} {portionsWord(recipe.servings)}</span> : null}</p>
      <DimaLine recipe={recipe} />
      {data ? <RecipeBody recipe={recipe} rows={data.rows} vocab={data.vocab} factor={pot ? 1 : data.portions / recipe.servings} heading={pot ? 'Продукты на кастрюлю' : 'Продукты на семью'} /> : null}
    </Sheet>
  );
}
