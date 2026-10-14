import { useState } from 'react';
import Header from '../shell/Header';
import { localDb, type LocalDb, type WeekSlot } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useMenu } from './useMenu';
import MealRow from './MealRow';
import { dayOfWeek, MEAL_LABEL, MEAL_TIME, MEALS, soupBatches, soupOn, weekLabel, addDaysIso, type Meal } from './week';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAME = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const daysWord = (n: number) => (n === 1 ? 'день' : n < 5 ? 'дня' : 'дней');

export type MenuSheet =
  | { kind: 'slot'; day: number; meal: Meal }
  | { kind: 'day'; day: number }
  | { kind: 'week'; mode: 'current' | 'next' };

export default function MenuPage({ me, members, db = localDb, today = new Date() }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const data = useMenu(db, me.household_id, today);
  const [day, setDay] = useState(dayOfWeek(today));
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  if (!data) return <><Header title="Меню" /><p className="note" style={{ margin: 16 }}>Загружаем меню…</p></>;
  const { current, recipes, templates } = data;
  const parent = me.role === 'parent';
  const name = (id: string | null) => (id ? recipes.get(id)?.name ?? 'Блюдо удалено' : '');
  const slotAt = (d: number, meal: Meal): WeekSlot | undefined => current.slots.find((s) => s.day === d && s.meal === meal);
  const template = templates.find((t) => t.id === current.week?.template_id);

  if (!current.week) {
    return (
      <>
        <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)}`} />
        <section className="card">
          <div className="card-h"><h2>Неделя на {weekLabel(current.start)} не выбрана</h2></div>
          <p className="note">Возьмите один из шаблонов — меню и список покупок соберутся сами. Потом любое блюдо можно заменить.</p>
          <div className="btns fill" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Выбрать неделю' : 'Предложить неделю'}</button>
          </div>
        </section>
        {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} /> : null}
      </>
    );
  }

  const row = (meal: Meal) => {
    const s = slotAt(day, meal);
    const extra: string[] = [];
    let main = name(s?.dish_id ?? null);
    let note: string | undefined;
    if (meal === 'lunch') {
      const pot = soupOn(current.slots, day);
      if (pot && pot.of > 1) extra.push(`кастрюля на ${pot.of} ${daysWord(pot.of)}, ${pot.nth}-й день`);
      note = recipes.get(s?.dish_id ?? '')?.dima_note || undefined;
    }
    if (meal === 'dinner') note = recipes.get(s?.dish_id ?? '')?.dima_note || undefined;
    if (meal === 'snack' && !s?.dish_id && s?.simple) main = s.simple.simple;
    if (s?.side_id) extra.push(lower(name(s.side_id)));
    if (s?.salad_id) extra.push(lower(name(s.salad_id)));
    return <MealRow key={meal} name={main || 'Не выбрано'} label={MEAL_LABEL[meal]} time={MEAL_TIME[meal]} extra={extra} note={parent ? note : undefined} onOpen={() => setSheet({ kind: 'slot', day, meal })} />;
  };
  const date = (d: number) => Number(addDaysIso(current.start, d).slice(8));

  return (
    <>
      <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)} · ${current.week.status === 'approved' ? 'утверждена' : 'предложена'}`} />
      <NextWeekHero me={me} members={members} db={db} data={data} openWeek={() => setSheet({ kind: 'week', mode: 'next' })} />
      <section className="week-bar">
        <span className="row-main"><b>Сейчас: «{template?.name ?? 'своя неделя'}», {weekLabel(current.start)}</b><small>{template?.note ?? ''}</small></span>
        <button type="button" className="btn soft sm" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Сменить' : 'Предложить'}</button>
      </section>
      <div className="days" role="group" aria-label="Дни недели">
        {DAY_SHORT.map((d, i) => (
          <button key={d} type="button" className={`day ${i === dayOfWeek(today) ? 'today' : ''}`} aria-pressed={i === day} aria-label={DAY_NAME[i]} onClick={() => setDay(i)}>{d}<b>{date(i)}</b><i /></button>
        ))}
      </div>
      <div className="soup-line">
        {soupBatches(current.slots).map((b) => <span key={`${b.dish_id}-${b.from}`} className="pill soft" style={{ ['--h' as string]: 'var(--k-meal)' }}>{name(b.dish_id)} · {DAY_SHORT[b.from]}{b.to > b.from ? `–${DAY_SHORT[b.to]}` : ''}</span>)}
      </div>
      <section className="card">
        <div className="card-h"><h2>{DAY_NAME[day]}, {date(day)}</h2><button type="button" className="more" onClick={() => setSheet({ kind: 'day', day })}>Заменить день</button></div>
        {MEALS.map(row)}
        <p className="note">Нажмите на блюдо, чтобы заменить его блюдом из другой недели или из всех рецептов.</p>
      </section>
      {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} /> : null}
    </>
  );
}

function NextWeekHero(_p: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void }) { return null; }
function SheetHost(_p: { sheet: MenuSheet; close: () => void; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>> }) { return null; }
