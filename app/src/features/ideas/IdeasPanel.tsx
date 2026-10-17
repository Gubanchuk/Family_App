import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe } from '../../data/db';
import type { Member } from '../family/useFamily';
import { addDaysIso, dayOfWeek, fitsMeal, mondayOf, type Meal } from '../menu/week';
import { useToast } from '../shell/toastContext';
import { lineOf } from '../menu/SlotSheet';
import { blockedBy, recipeMatches } from './search';
import { COLLECTIONS, MEAL_FOR, createOffer, declineOffer, offerDate, takeOffer, whenText } from './offerActions';
import RecipeSheet from './RecipeSheet';
import RecipeEditor from './RecipeEditor';
import { draftFrom, type Draft } from './recipeDraft';
import { deleteRecipe } from './recipeApi';

const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const MEAL_CHIPS: Array<[Meal, string]> = [['breakfast', 'Завтрак'], ['lunch', 'Обед'], ['snack', 'Полдник'], ['dinner', 'Ужин']];
// A dish fits a meal by its kind (soups for lunch, mains for dinner) or because the recipe names that meal.
const inMeal = (r: Recipe, m: Meal) => fitsMeal(r, m) || r.meals.includes(m);
const dishesWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'блюдо' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блюда' : 'блюд'}`;

export default function IdeasPanel({ me, members, db, today }: { me: Member; members: Member[]; db: LocalDb; today: Date }) {
  const todayIso = addDaysIso(mondayOf(today), dayOfWeek(today));
  const data = useLiveQuery(async () => {
    const weekStart = mondayOf(today);
    const weeks = (await db.weeks.where('household_id').equals(me.household_id).toArray())
      .filter((w) => !w.deleted_at && (w.starts_on === weekStart || w.starts_on === addDaysIso(weekStart, 7)));
    const slots = weeks.length ? await db.week_slots.where('week_id').anyOf(weeks.map((w) => w.id)).toArray() : [];
    const [recipes, rows, offers, notEat, vocab, prices, portions] = await Promise.all([
      // Base sides come with their main dish; a family's own side has no other way to be found.
      db.recipes.filter((r) => !r.deleted_at && (r.category !== 'side' || !!r.household_id)).toArray(),
      db.recipe_ingredients.toArray(),
      db.dish_offers.where('household_id').equals(me.household_id).toArray(),
      db.not_eat.where('household_id').equals(me.household_id).toArray(),
      db.ingredients.toArray(), db.prices.toArray(), db.meta.get('family_portions'),
    ]);
    const itemsOf = new Map<string, string[]>();
    for (const r of rows) itemsOf.set(r.recipe_id, [...(itemsOf.get(r.recipe_id) ?? []), r.item]);
    return {
      recipes, rows, itemsOf, notEat, weeks, slots,
      offers: offers.filter((o) => !o.deleted_at && o.status === 'open' && o.from_member !== me.id && (o.to_member === me.id || o.to_member === null) && o.on_date >= todayIso).sort((a, b) => a.on_date.localeCompare(b.on_date)),
      vocab: new Map(vocab.map((v) => [v.item, v])), prices: new Map(prices.map((p) => [p.item, Number(p.price_per_unit)])),
      portions: Number(portions?.value ?? 3.5),
    };
  }, [db, me.household_id, me.id, todayIso]);
  const toast = useToast();
  const [col, setCol] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  // Home links straight to a recipe with ?recipe=<id>.
  const [open, setOpen] = useState<string | null>(params.get('recipe'));
  const [editing, setEditing] = useState<Draft | 'new' | null>(null);
  const list = useMemo(() => {
    if (!data) return [];
    const ok = (r: Recipe) => !blockedBy(r, data.itemsOf.get(r.id) ?? [], data.notEat);
    const byName = (a: Recipe, b: Recipe) => a.name.localeCompare(b.name, 'ru');
    if (q.trim()) return data.recipes.filter((r) => ok(r) && recipeMatches(q, r, data.itemsOf.get(r.id) ?? [])).sort(byName);
    // Every dish of the base and the family's own; the ones from collections lead when nothing is filtered.
    return data.recipes.filter((r) => ok(r) && (!col || r.collections.includes(col)) && (!meal || inMeal(r, meal)))
      .sort((a, b) => (col || meal ? 0 : Number(b.collections.length > 0) - Number(a.collections.length > 0)) || byName(a, b));
  }, [data, q, col, meal]);
  if (!data) return <p className="note" style={{ margin: 16 }}>Загружаем рецепты…</p>;

  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const dish = (id: string) => data.recipes.find((r) => r.id === id);
  const forMe = data.offers[0];
  const weekend = data.recipes.filter((r) => r.collections.includes('weekend'));
  const tip = weekend.length ? weekend[Math.floor(today.getTime() / (7 * 86400000)) % weekend.length] : undefined;
  const recipe = open ? data.recipes.find((r) => r.id === open) : undefined;
  const hasOwn = data.recipes.some((r) => r.household_id);
  const inMenu = (id: string) => data.slots.some((s) => s.dish_id === id || s.side_id === id);

  return (
    <>
      {forMe && dish(forMe.dish_id) ? (
        <section className="hero" aria-label="Вам предложили блюдо">
          <h2>{name(forMe.from_member)} просит: {dish(forMe.dish_id)!.name}</h2>
          <p>{whenText(forMe.on_date, todayIso)} {MEAL_FOR[forMe.meal]}, {forMe.how === 'over' ? 'поверх меню' : 'вместо блюда по меню'}. {dish(forMe.dish_id)!.time_total} минут.</p>
          <div className="hero-chips">
            <button type="button" className="hero-chip primary" onClick={() => takeOffer(db, forMe, me)}><Icon name="check" />Сделаю</button>
            <button type="button" className="hero-chip" onClick={() => setOpen(forMe.dish_id)}>Рецепт</button>
            <button type="button" className="hero-chip" onClick={() => declineOffer(db, forMe)}>Не {forMe.on_date === todayIso ? 'сегодня' : 'в этот день'}</button>
          </div>
        </section>
      ) : tip ? (
        <section className="hero" aria-label="Идея на выходные">
          <h2>На выходные: {tip.name.charAt(0).toLowerCase() + tip.name.slice(1)}</h2><p>{tip.about}. {tip.time_total} минут.</p>
          <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={() => setOpen(tip.id)}>Посмотреть и предложить</button></div>
        </section>
      ) : null}
      <label className="search"><Icon name="search" /><span className="vh">Найти блюдо</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Блюдо или продукт: курица, яйца" autoComplete="off" /></label>
      {q.trim() ? null : (
        <>
          {/* A meal or a collection narrows the list; a second tap takes it off. */}
          <div className="col-chips" role="group" aria-label="Приём">
            {MEAL_CHIPS.map(([m, label]) => <button key={m} type="button" aria-pressed={meal === m} onClick={() => setMeal(meal === m ? null : m)}>{label}</button>)}
          </div>
          <div className="col-chips" role="group" aria-label="Подборки">
            {[...(hasOwn ? [{ id: 'ours', name: 'Наши рецепты' }] : []), ...COLLECTIONS].map((c) => <button key={c.id} type="button" className="soft" aria-pressed={col === c.id} onClick={() => setCol(col === c.id ? null : c.id)}>{c.name}</button>)}
          </div>
        </>
      )}
      <button type="button" className="btn soft sm own-add" onClick={() => setEditing('new')}><Icon name="plus" />Свой рецепт</button>
      {list.length ? <p className="note idea-count">{dishesWord(list.length)}</p> : null}
      <div className="idea-grid">
        {list.map((r, i) => (
          <button key={r.id} type="button" className={`idea ${i === 0 && !q.trim() && !col && !meal ? 'wide' : ''}`} onClick={() => setOpen(r.id)}>
            <b>{r.name}</b>{i === 0 && !q.trim() && !col && !meal ? <span className="i-about">{r.about}</span> : null}
            <span className="i-meta"><span className="i-min">{r.time_total}<small>мин</small></span></span>
            <span className="i-dima">{DIMA[r.dima_level]}</span>
          </button>
        ))}
      </div>
      {list.length ? null : <p className="empty">Ничего не нашли. Попробуйте продукт: «курица», «творог», «яйца».</p>}
      {recipe ? (
        <RecipeSheet recipe={recipe} rows={data.rows.filter((r) => r.recipe_id === recipe.id).sort((a, b) => a.pos - b.pos)} vocab={data.vocab} prices={data.prices}
          portions={data.portions} me={me} members={members} onClose={() => setOpen(null)}
          // Anyone in the family adds a recipe; changing or deleting one is for parents.
          {...(recipe.household_id && me.role === 'parent' ? {
            inMenu: inMenu(recipe.id),
            onEdit: () => { setEditing(draftFrom(recipe, data.rows.filter((r) => r.recipe_id === recipe.id))); setOpen(null); },
            onDelete: async () => {
              try {
                await deleteRecipe(recipe);
                toast({ text: `Рецепт «${recipe.name}» удалён` });
                setOpen(null);
              } catch (err) {
                toast({ text: (err as Error).message === 'offline' ? 'Нет интернета. Удалить получится, когда появится сеть.' : 'Не получилось удалить. Попробуйте ещё раз.' });
              }
            },
          } : {})}
          insteadOf={(d) => {
            const date = offerDate(d.when, today);
            const [y, m, dd] = date.split('-').map(Number);
            const day = new Date(y, m - 1, dd);
            const week = data.weeks.find((w) => w.starts_on === mondayOf(day));
            const slot = week && data.slots.find((s) => s.week_id === week.id && s.day === dayOfWeek(day) && s.meal === d.meal);
            if (!slot) return null;
            const all = new Map(data.recipes.map((r) => [r.id, r]));
            const line = lineOf(slot, all);
            return line === 'Не выбрано' ? null : lower(line);
          }}
          onOffer={async (d, cook) => {
            await createOffer(db, { me, to: d.to, dish: recipe.id, date: offerDate(d.when, today), meal: d.meal, how: d.how, cookMyself: cook });
            const when = `${d.when === 'today' ? 'сегодня' : d.when === 'tomorrow' ? 'завтра' : 'в выходные'} ${MEAL_FOR[d.meal]}`;
            const who = cook ? 'Готовите вы' : d.to ? `${name(d.to)} получит просьбу` : 'Семья получит просьбу';
            toast({ text: `${who}: ${lower(recipe.name)}, ${when}.` });
          }} />
      ) : null}
      {editing ? <RecipeEditor me={me} db={db} draft={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
