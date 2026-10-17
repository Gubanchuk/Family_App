import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient, Recipe, RecipeIngredient } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEAL_LABEL, type Meal } from '../menu/week';
import { rub } from '../shop/build';
import RecipeBody, { DimaLine } from './RecipeBody';
import { Photo } from '../shell/PhotoField';
export type OfferDraft = { to: string | null; when: 'today' | 'tomorrow' | 'weekend'; meal: Meal; how: 'over' | 'instead' };
const defaultMeal = (r: Recipe): Meal => (r.category === 'breakfast' ? 'breakfast' : r.category === 'soup' ? 'lunch' : ['snack', 'dessert', 'drink'].includes(r.category) ? 'snack' : r.meals.includes('dinner') ? 'dinner' : (r.meals[0] as Meal) ?? 'dinner');

export default function RecipeSheet({ recipe, rows, vocab, prices, portions, me, members, onOffer, onClose, insteadOf = () => null, onEdit, onDelete, inMenu = false, request }: {
  recipe: Recipe; rows: RecipeIngredient[]; vocab: Map<string, Ingredient>; prices: Map<string, number>; portions: number;
  me: Member; members: Member[]; onOffer: (d: OfferDraft, cookMyself: boolean) => Promise<void>; onClose: () => void;
  insteadOf?: (d: OfferDraft) => string | null;
  // Opened from someone's request for this dish: the answer to it, not a new offer.
  request?: { onTake: () => void; onDecline: () => void; declineLabel: string };
  // Only the family's own recipes can be changed; base recipes come without these.
  onEdit?: () => void; onDelete?: () => Promise<void>; inMenu?: boolean;
}) {
  const [d, setD] = useState<OfferDraft>({ to: null, when: 'today', meal: defaultMeal(recipe), how: 'over' });
  const [sure, setSure] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  };
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
  // Sending never fails silently: the buttons say it is under way, and a failure is named on the sheet.
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  const send = async (cook: boolean) => {
    if (sending) return;
    setSending(true);
    setFailed('');
    try {
      await onOffer(d, cook);
      onClose();
    } catch (e) {
      setFailed(`Не получилось отправить: ${(e as Error)?.message || 'неизвестная ошибка'}. Попробуйте ещё раз.`);
    } finally {
      setSending(false);
    }
  };
  // «Вместо» names the dish of the menu it would replace, so nobody guesses which one.
  const replaced = insteadOf(d);
  return (
    <Sheet title={recipe.name} sub={recipe.about} onClose={onClose}
      actions={request
        ? <div className="btns fill"><button type="button" className="btn" onClick={() => { request.onTake(); onClose(); }}>Сделаю</button><button type="button" className="btn soft" onClick={() => { request.onDecline(); onClose(); }}>{request.declineLabel}</button></div>
        : <>
          {failed ? <p className="form-error" role="alert" style={{ margin: '0 0 10px' }}>{failed}</p> : null}
          <div className="btns fill">
            <button type="button" className="btn" disabled={sending} onClick={() => send(false)}>{sending ? 'Отправляем…' : 'Предложить'}</button>
            <button type="button" className="btn soft" disabled={sending} onClick={() => send(true)}>Приготовлю я</button>
          </div>
        </>}>
      <Photo path={recipe.photo_path} className="sheet-photo" />
      <p className="meta-line"><span>{recipe.time_total} минут</span><span>{recipe.servings} {recipe.servings < 5 ? 'порции' : 'порций'}</span>{cost ? <span>≈&nbsp;{rub(cost)}{missing ? ' без части продуктов' : ''}</span> : null}</p>
      <DimaLine recipe={recipe} />
      {onEdit && onDelete ? (
        <div className="btns own-actions">
          <button type="button" className="btn soft sm" onClick={onEdit}>Изменить</button>
          <button type="button" className="more" disabled={deleting} onClick={() => (sure ? remove() : setSure(true))}>
            {deleting ? 'Удаляем…' : sure ? (inMenu ? 'Блюдо есть в меню на неделю. Удалить всё равно?' : 'Точно удалить рецепт?') : 'Удалить'}
          </button>
        </div>
      ) : null}
      {request ? null : <>
      <h3 className="sh-h">Кому и когда</h3>
      <div className="offer-picks">
        <div className="pick-g"><span>Кого просим</span><div className="picks">{pick('to', null, 'Всем')}{others.map((m) => <span key={m.id}>{pick('to', m.id, m.name)}</span>)}</div></div>
        <div className="pick-g"><span>Когда</span><div className="picks">{pick('when', 'today', 'Сегодня')}{pick('when', 'tomorrow', 'Завтра')}{pick('when', 'weekend', 'В выходные')}</div></div>
        <div className="pick-g"><span>Приём</span><div className="picks">{(['breakfast', 'lunch', 'snack', 'dinner'] as Meal[]).map((m) => <span key={m}>{pick('meal', m, MEAL_LABEL[m])}</span>)}</div></div>
        <div className="pick-g"><span>Как</span><div className="picks">{pick('how', 'over', 'Поверх меню')}{pick('how', 'instead', replaced ? `Вместо: ${replaced}` : 'Вместо блюда')}</div></div>
      </div>
      </>}
      <RecipeBody recipe={recipe} rows={rows} vocab={vocab} factor={factor} />
    </Sheet>
  );
}
