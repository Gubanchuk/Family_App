import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe, TemplateSlot, Week, WeekSlot, WeekTemplate } from '../../data/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { fitsMeal, MEAL_LABEL, type Meal } from './week';
import { replaceMeal } from './actions';
import { blockedBy } from '../ideas/search';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
const DIMA = { ok: 'Диме можно', adapt: 'Диме с поправкой', skip: 'Диме нельзя' } as const;

export function lineOf(s: Pick<WeekSlot, 'dish_id' | 'side_id' | 'simple'> | undefined, recipes: Map<string, Recipe>) {
  if (!s) return 'Не выбрано';
  const main = s.dish_id ? recipes.get(s.dish_id)?.name ?? 'Блюдо не загружено' : s.simple?.simple ?? 'Не выбрано';
  const side = s.side_id ? recipes.get(s.side_id)?.name : undefined;
  return side ? `${main} + ${side.charAt(0).toLowerCase()}${side.slice(1)}` : main;
}

export default function SlotSheet({ db, week, day, meal, currentSlot, recipes, templates, editable, onClose }: {
  db: LocalDb; week: Week; day: number; meal: Meal; currentSlot?: WeekSlot; recipes: Map<string, Recipe>; templates: WeekTemplate[]; editable: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<'weeks' | 'all'>('weeks');
  const [tpl, setTpl] = useState(templates.find((t) => t.id !== week.template_id)?.id ?? templates[0]?.id);
  const [q, setQ] = useState('');
  const tplSlots = useLiveQuery(() => (tpl ? db.template_slots.where('template_id').equals(tpl).filter((s) => s.meal === meal).toArray() : []), [db, tpl, meal]) ?? [];
  const sides = useLiveQuery(() => db.recipe_sides.toArray(), [db]) ?? [];
  // «Не едим» keeps its promise here too: such dishes are not offered as a replacement.
  const blockers = useLiveQuery(async () => {
    const notEat = (await db.not_eat.where('household_id').equals(week.household_id).toArray()).filter((x) => !x.deleted_at);
    if (!notEat.length) return null;
    const itemsOf = new Map<string, string[]>();
    for (const r of await db.recipe_ingredients.toArray()) itemsOf.set(r.recipe_id, [...(itemsOf.get(r.recipe_id) ?? []), r.item]);
    return { notEat, itemsOf };
  }, [db, week.household_id]);
  const all = useMemo(() => [...recipes.values()]
    .filter((r) => fitsMeal(r, meal) && !(blockers && blockedBy(r, blockers.itemsOf.get(r.id) ?? [], blockers.notEat)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')), [recipes, meal, blockers]);
  const title = `${MEAL_LABEL[meal]} ${DAY_ACC[day]}`;

  if (!editable) {
    return <Sheet title={title} sub={`Сейчас: ${lineOf(currentSlot, recipes)}`} onClose={onClose}><p className="note" style={{ margin: '0 16px 16px' }}>Утверждённую неделю меняют родители. Предложите блюдо — им придёт просьба.</p></Sheet>;
  }
  const pick = async (src: Parameters<typeof replaceMeal>[4]) => { await replaceMeal(db, week, day, meal, src); onClose(); };
  const shown = all.filter((r) => !q || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Sheet title={title} sub={`Сейчас: ${lineOf(currentSlot, recipes)}`} onClose={onClose}>
      <div className="segs sheet-segs" role="tablist" aria-label="Откуда взять">
        <button type="button" role="tab" aria-selected={tab === 'weeks'} onClick={() => setTab('weeks')}>Из других недель</button>
        <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>Все рецепты</button>
      </div>
      {tab === 'weeks' ? (
        <>
          <div className="col-chips sheet-chips" role="group" aria-label="Неделя">
            {templates.map((t) => <button key={t.id} type="button" aria-pressed={t.id === tpl} onClick={() => setTpl(t.id)}>{t.name}</button>)}
          </div>
          <div className="opts">
            {[...tplSlots].sort((a, b) => a.day - b.day).map((s: TemplateSlot) => (
              <button key={s.day} type="button" className="opt" aria-label={`${DAY_SHORT[s.day]} · ${lineOf(s, recipes)}`} onClick={() => pick({ fromSlot: s })}>
                <span className="opt-day">{DAY_SHORT[s.day]}</span><span className="row-main"><b>{lineOf(s, recipes)}</b></span><Icon name="swap" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <label className="search sheet-search"><Icon name="search" /><span className="vh">Найти блюдо</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти блюдо" autoComplete="off" /></label>
          <div className="opts">
            {shown.map((r) => (
              <button key={r.id} type="button" className="opt" onClick={() => pick({ recipe: r, sides: sides.filter((x) => x.recipe_id === r.id).map((x) => x.side_id) })}>
                <span className="row-main"><b>{r.name}</b><small>{r.time_total} мин · {DIMA[r.dima_level]}</small></span><Icon name="swap" />
              </button>
            ))}
          </div>
          {shown.length ? null : <p className="empty">Ничего не нашли.</p>}
        </>
      )}
    </Sheet>
  );
}
