import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient, Recipe, RecipeIngredient } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEAL_LABEL, type Meal } from '../menu/week';
import { formatQty, rub } from '../shop/build';

const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;
export type OfferDraft = { to: string | null; when: 'today' | 'tomorrow' | 'weekend'; meal: Meal; how: 'over' | 'instead' };
const defaultMeal = (r: Recipe): Meal => (r.category === 'breakfast' ? 'breakfast' : r.category === 'soup' ? 'lunch' : ['snack', 'dessert', 'drink'].includes(r.category) ? 'snack' : r.meals.includes('dinner') ? 'dinner' : (r.meals[0] as Meal) ?? 'dinner');

export default function RecipeSheet({ recipe, rows, vocab, prices, portions, me, members, onOffer, onClose }: {
  recipe: Recipe; rows: RecipeIngredient[]; vocab: Map<string, Ingredient>; prices: Map<string, number>; portions: number;
  me: Member; members: Member[]; onOffer: (d: OfferDraft, cookMyself: boolean) => Promise<void>; onClose: () => void;
}) {
  const [d, setD] = useState<OfferDraft>({ to: null, when: 'today', meal: defaultMeal(recipe), how: 'over' });
  const factor = portions / recipe.servings;
  let cost = 0; let missing = false;
  for (const r of rows) {
    if (r.qty === null || vocab.get(r.item)?.pantry) continue;
    const p = prices.get(r.item);
    if (p === undefined) missing = true; else cost += Number(r.qty) * factor * p;
  }
  const others = members.filter((m) => m.id !== me.id && m.user_id);
  const pick = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K], label: string) => (
    <button type="button" className="pick" aria-pressed={d[k] === v} onClick={() => setD({ ...d, [k]: v })}>{label}</button>
  );
  const send = async (cook: boolean) => { await onOffer(d, cook); onClose(); };
  return (
    <Sheet title={recipe.name} sub={recipe.about} onClose={onClose}
      actions={<div className="btns fill"><button type="button" className="btn" onClick={() => send(false)}>Предложить</button><button type="button" className="btn soft" onClick={() => send(true)}>Приготовлю сам</button></div>}>
      <p className="meta-line"><span>{recipe.time_total} минут</span><span>{recipe.servings} {recipe.servings < 5 ? 'порции' : 'порций'}</span>{cost ? <span>≈&nbsp;{rub(cost)}{missing ? ' без части продуктов' : ''}</span> : null}</p>
      <p className="dima-line"><span><b>{DIMA[recipe.dima_level]}</b>{recipe.dima_note ? <small>{recipe.dima_note}</small> : null}</span></p>
      <h3 className="sh-h">Кому и когда</h3>
      <div className="offer-picks">
        <div className="pick-g"><span>Кому</span><div className="picks">{pick('to', null, 'Всем')}{others.map((m) => <span key={m.id}>{pick('to', m.id, m.name)}</span>)}</div></div>
        <div className="pick-g"><span>Когда</span><div className="picks">{pick('when', 'today', 'Сегодня')}{pick('when', 'tomorrow', 'Завтра')}{pick('when', 'weekend', 'В выходные')}</div></div>
        <div className="pick-g"><span>Приём</span><div className="picks">{(['breakfast', 'lunch', 'snack', 'dinner'] as Meal[]).map((m) => <span key={m}>{pick('meal', m, MEAL_LABEL[m])}</span>)}</div></div>
        <div className="pick-g"><span>Как</span><div className="picks">{pick('how', 'over', 'Поверх меню')}{pick('how', 'instead', 'Вместо блюда')}</div></div>
      </div>
      <h3 className="sh-h">Продукты на семью</h3>
      <ul className="ing">
        {rows.map((r) => {
          const v = vocab.get(r.item);
          const q = v?.pantry ? 'есть дома' : r.qty === null ? 'по вкусу' : formatQty(Number(r.qty) * factor, v?.unit ?? 'г');
          return <li key={r.pos}><span>{r.item.charAt(0).toUpperCase() + r.item.slice(1)}{r.note ? `, ${r.note}` : ''}</span><span>{q}</span></li>;
        })}
      </ul>
      <h3 className="sh-h">Как готовить</h3>
      <ol className="steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {recipe.source_url ? <p className="note" style={{ margin: '0 16px 16px' }}>Рецепт: <a href={recipe.source_url} target="_blank" rel="noreferrer">{recipe.source_site ?? 'источник'}</a></p> : null}
    </Sheet>
  );
}
