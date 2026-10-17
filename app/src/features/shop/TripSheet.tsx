import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from '../menu/Sheet';
import type { Ingredient, LocalDb, ShoppingItem, ShoppingMark, TripLine } from '../../data/db';
import type { Member } from '../family/useFamily';
import { addDaysIso, MEAL_LABEL, MEALS, type Meal } from '../menu/week';
import { capitalize } from './menuList';
import { addManualItem } from './shopActions';
import { cartFromPicks, dishesOf, pickLabel, type Pick } from './tripCart';
import { closed, groupByDept } from './useShop';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// Why a product of the chosen meals stays out of the cart, one sentence per reason.
const WHY: Array<[string, string]> = [['bought', 'Уже куплено'], ['home', 'Есть дома'], ['pantry', 'Всегда есть дома'], ['absent', 'Нет в списке']];
const same = (a: Pick, b: Pick) => a.day === b.day && a.kind === b.kind && (a.kind === 'meal' ? a.meal === (b as typeof a).meal : a.dish_id === (b as typeof a).dish_id);

// «Что берём»: a cart for this trip from a meal of a day, a dish, lines of the list or a line of one's own.
// «Беру весь список» goes as before, with no cart.
export default function TripSheet({ db, me, weekId, weekStart, today, lines, marks, vocab, onStart, onClose }: {
  db: LocalDb; me: Member; weekId: string | null; weekStart: string; today: number | null;
  lines: ShoppingItem[]; marks: Map<string, ShoppingMark>; vocab: Map<string, Ingredient>;
  onStart: (cart?: { label: string; items: TripLine[] }) => Promise<void>; onClose: () => void;
}) {
  const first = today ?? 0;
  const [day, setDay] = useState(first);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);

  const menu = useLiveQuery(async () => {
    const slots = weekId ? await db.week_slots.where('week_id').equals(weekId).toArray() : [];
    const offers = (await db.dish_offers.where('household_id').equals(me.household_id).toArray())
      .filter((o) => !o.deleted_at && o.status !== 'declined' && o.on_date >= weekStart && o.on_date <= addDaysIso(weekStart, 6));
    const ids = [...new Set([...slots.flatMap((s) => [s.dish_id, s.side_id, s.salad_id]), ...offers.map((o) => o.dish_id)].filter((x): x is string => !!x))];
    const recipes = (await db.recipes.bulkGet(ids)).filter((r) => !!r);
    const rows = ids.length ? await db.recipe_ingredients.where('recipe_id').anyOf(ids).toArray() : [];
    const ingredientsOf = new Map<string, Array<{ item: string; qty: number | null }>>();
    for (const r of rows) ingredientsOf.set(r.recipe_id, [...(ingredientsOf.get(r.recipe_id) ?? []), { item: r.item, qty: r.qty === null ? null : Number(r.qty) }]);
    const prices = new Map((await db.prices.toArray()).map((p) => [p.item, Number(p.price_per_unit)]));
    const portions = Number((await db.meta.get('family_portions'))?.value ?? 3.5);
    return { slots, offers, recipes: new Map(recipes.map((r) => [r!.id, r!])), ingredientsOf, prices, portions };
  }, [db, weekId, weekStart, me.household_id]);

  const dishName = (id: string) => menu?.recipes.get(id)?.name ?? 'Блюдо';
  const result = useMemo(() => {
    if (!menu) return { lines: [] as TripLine[], skipped: [] as Array<{ item: string; why: string }> };
    return cartFromPicks({
      picks, slots: menu.slots, offers: menu.offers.filter((o) => o.status === 'taken'), weekStart, lines, marks, dishName,
      build: { servings: new Map([...menu.recipes.values()].map((r) => [r.id, r.servings])), ingredientsOf: menu.ingredientsOf, vocab, prices: menu.prices, portions: menu.portions,
        isSoup: (id) => menu.recipes.get(id)?.category === 'soup' },
    });
  }, [menu, picks, weekStart, lines, marks, vocab]); // eslint-disable-line react-hooks/exhaustive-deps
  const items: TripLine[] = [...result.lines, ...chosen.filter((id) => !result.lines.some((l) => l.id === id)).map((id) => ({ id, hint: null }))];
  const toggle = (p: Pick) => setPicks((x) => (x.some((y) => same(y, p)) ? x.filter((y) => !same(y, p)) : [...x, p]));
  const pickOn = (p: Pick) => picks.some((y) => same(y, p));

  const days = Array.from({ length: 7 - first }, (_, k) => first + k);
  const dayName = (d: number) => (today !== null && d === today ? 'Сегодня' : today !== null && d === today + 1 ? 'Завтра' : `${DAY_SHORT[d]} ${Number(addDaysIso(weekStart, d).slice(8))}`);
  // The day's dishes: every meal of the menu, plus dishes offered for the day.
  const dayDishes = menu ? [...new Set([
    ...MEALS.flatMap((m) => dishesOf({ kind: 'meal', day, meal: m }, menu.slots, [], weekStart)),
    ...menu.offers.filter((o) => o.on_date === addDaysIso(weekStart, day)).map((o) => o.dish_id),
  ])] : [];
  const open = lines.filter((l) => !closed(marks.get(l.id)));
  const titleOf = (id: string) => lines.find((l) => l.id === id)?.title;
  const label = [pickLabel(picks, today ?? -1, dishName), ...chosen.map((id) => titleOf(id)?.toLowerCase()).filter(Boolean)].filter(Boolean).join(', ').slice(0, 80);
  // Said only once the menu is read: before that an empty cart means nothing.
  const nothing = !!menu && picks.length > 0 && items.length === 0;

  const addOwn = async () => {
    const title = own.trim();
    if (!title) return;
    const id = `u:${crypto.randomUUID()}`;
    await addManualItem(db, me, { title, qtyText: '', urgent: false, vocab, id });
    setChosen((x) => [...x, id]);
    setOwn('');
  };
  const start = async (cart?: { label: string; items: TripLine[] }) => {
    setBusy(true);
    try { await onStart(cart); onClose(); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Что берём" sub="Выберите, за чем идёте, — в магазине будет видно только это." onClose={onClose}
      actions={(
        <div className="btns fill">
          <button type="button" className="btn" disabled={!items.length || busy} onClick={() => start({ label, items })}>Пошли</button>
          <button type="button" className="btn soft" disabled={busy} onClick={() => start()}>Беру весь список</button>
        </div>
      )}>
      <div className="col-chips sheet-chips" role="group" aria-label="День">
        {days.map((d) => <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)}>{dayName(d)}</button>)}
      </div>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <fieldset className="kin-pick"><legend>Приём пищи</legend><div className="picks">
          {MEALS.map((m: Meal) => <button key={m} type="button" className="pick" aria-pressed={pickOn({ kind: 'meal', day, meal: m })} onClick={() => toggle({ kind: 'meal', day, meal: m })}>{MEAL_LABEL[m]}</button>)}
        </div></fieldset>
        {dayDishes.length ? (
          <fieldset className="kin-pick"><legend>Или одно блюдо</legend><div className="picks">
            {dayDishes.map((id) => <button key={id} type="button" className="pick" aria-pressed={pickOn({ kind: 'dish', day, dish_id: id })} onClick={() => toggle({ kind: 'dish', day, dish_id: id })}>{dishName(id)}</button>)}
          </div></fieldset>
        ) : null}
        {nothing ? <p className="note" role="status" style={{ margin: 0 }}>Всё для этого уже куплено или есть дома</p> : null}
        {picks.length && result.skipped.length ? (
          <p className="note" style={{ margin: 0 }}>{WHY.map(([why, text]) => {
            const names = result.skipped.filter((s) => s.why === why).map((s) => s.item);
            return names.length ? `${text}: ${names.join(', ')}.` : '';
          }).filter(Boolean).join(' ')}</p>
        ) : null}
        <div className="row" style={{ gap: 8 }}>
          <label className="field" style={{ flex: 1, margin: 0 }}>Дописать своё<input value={own} onChange={(e) => setOwn(e.target.value)} maxLength={80} placeholder="Например, хлеб" enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addOwn(); } }} /></label>
          {own.trim() ? <button type="button" className="btn soft sm" aria-label={`Добавить «${own.trim()}»`} onClick={addOwn}>Добавить</button> : null}
        </div>
        <button type="button" className="more" aria-expanded={showLines} onClick={() => setShowLines(!showLines)}>{showLines ? 'Скрыть строки списка' : `Выбрать строки из списка (${open.length})`}</button>
        {showLines ? groupByDept(open, marks).map((g) => (
          <fieldset className="kin-pick" key={g.dept}><legend>{g.dept}</legend><div className="picks">
            {g.items.map((l) => (
              <button key={l.id} type="button" className="pick" aria-pressed={chosen.includes(l.id) || result.lines.some((x) => x.id === l.id)}
                onClick={() => setChosen((x) => (x.includes(l.id) ? x.filter((y) => y !== l.id) : [...x, l.id]))}>{l.title}</button>
            ))}
          </div></fieldset>
        )) : null}
        {items.length ? <p className="note" style={{ margin: 0 }}>В корзине: {items.length} · {capitalize(label || 'свой список')}</p> : null}
      </div>
    </Sheet>
  );
}
