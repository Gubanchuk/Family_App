import type { Ingredient, Recipe, RecipeIngredient } from '../../data/db';
import { formatQty } from '../shop/build';

const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;

export function DimaLine({ recipe }: { recipe: Recipe }) {
  return <p className="dima-line"><span><b>{DIMA[recipe.dima_level]}</b>{recipe.dima_note ? <small>{recipe.dima_note}</small> : null}</span></p>;
}

// Products scaled for the family, the steps and the source: the part of a recipe that is the same
// whether it is opened from ideas or from the menu.
export default function RecipeBody({ recipe, rows, vocab, factor, heading = 'Продукты на семью' }: {
  recipe: Recipe; rows: RecipeIngredient[]; vocab: Map<string, Ingredient>; factor: number; heading?: string;
}) {
  return (
    <>
      <h3 className="sh-h">{heading}</h3>
      <ul className="ing">
        {rows.map((r) => {
          const v = vocab.get(r.item);
          const q = v?.pantry ? 'есть дома' : r.qty === null ? 'по вкусу' : formatQty(Number(r.qty) * factor, v?.unit ?? 'г');
          return <li key={r.pos}><span>{r.item.charAt(0).toUpperCase() + r.item.slice(1)}{r.note ? `, ${r.note}` : ''}</span><span>{q}</span></li>;
        })}
      </ul>
      {recipe.steps.length ? (
        <>
          <h3 className="sh-h">Как готовить</h3>
          <ol className="steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </>
      ) : null}
      {recipe.source_url ? <p className="note" style={{ margin: '0 16px 16px' }}>Рецепт: <a href={recipe.source_url} target="_blank" rel="noreferrer">{recipe.source_site ?? 'источник'}</a></p> : null}
    </>
  );
}
