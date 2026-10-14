import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../shell/Header';
import IdeasPanel from '../ideas/IdeasPanel';
import OfferRow from '../ideas/OfferRow';
import { takeOffer } from '../ideas/offerActions';
import { useSync } from '../../data/SyncProvider';
import { localDb, type LocalDb, type Week, type WeekSlot } from '../../data/db';
import Sheet from './Sheet';
import { saveWeekAsTemplate } from './saveTemplate';
import type { Member } from '../family/useFamily';
import { useMenu } from './useMenu';
import MealRow from './MealRow';
import SlotSheet from './SlotSheet';
import DaySheet from './DaySheet';
import { canEditWeek } from './actions';
import NextWeekHero from './NextWeekHero';
import WeekSheet from './WeekSheet';
import { dayOfWeek, MEAL_LABEL, MEAL_TIME, MEALS, soupBatches, soupOn, weekLabel, addDaysIso, type Meal } from './week';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAME = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const daysWord = (n: number) => (n === 1 ? 'день' : n < 5 ? 'дня' : 'дней');

export type MenuSheet =
  | { kind: 'slot'; day: number; meal: Meal }
  | { kind: 'day'; day: number }
  | { kind: 'week'; mode: 'current' | 'next' }
  | { kind: 'save' };

export default function MenuPage({ me, members, db = localDb, today = new Date() }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const data = useMenu(db, me.household_id, today);
  const sync = useSync();
  const [day, setDay] = useState(dayOfWeek(today));
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  const [saved, setSaved] = useState('');
  const [params, setParams] = useSearchParams();
  const panel = params.get('panel') === 'ideas' ? 'ideas' : 'week';
  if (!data) return <><Header title="Меню" /><p className="note" style={{ margin: 16 }}>Загружаем меню…</p></>;
  const { current, recipes, templates } = data;
  const parent = me.role === 'parent';
  const name = (id: string | null) => (id ? recipes.get(id)?.name ?? 'Блюдо не загружено' : '');
  const refused = sync.message ? (
    <section className="notice" role="alert"><span className="row-main"><b>{sync.message}</b></span>
      <button type="button" className="btn soft sm" onClick={sync.dismiss}>Понятно</button></section>
  ) : null;
  const noRecipes = recipes.size === 0 ? <section className="notice" role="status"><span className="row-main"><b>Рецепты ещё не загрузились. Откройте приложение с интернетом.</b></span></section> : null;
  const segs = (
    <div className="segs" role="tablist" aria-label="Меню">
      <button type="button" role="tab" aria-selected={panel === 'week'} onClick={() => setParams({})}>Неделя</button>
      <button type="button" role="tab" aria-selected={panel === 'ideas'} onClick={() => setParams({ panel: 'ideas' })}>Что покушать</button>
    </div>
  );
  if (panel === 'ideas') {
    return <><Header title="Меню" subtitle="Что покушать" />{noRecipes}{refused}{segs}<IdeasPanel me={me} members={members} db={db} today={today} /></>;
  }
  const slotAt = (d: number, meal: Meal): WeekSlot | undefined => current.slots.find((s) => s.day === d && s.meal === meal);
  const template = templates.find((t) => t.id === current.week?.template_id);

  if (!current.week) {
    return (
      <>
        <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)}`} />
        {noRecipes}
        {refused}
        {segs}
        <section className="card">
          <div className="card-h"><h2>Неделя на {weekLabel(current.start)} не выбрана</h2></div>
          <p className="note">Возьмите один из шаблонов — меню и список покупок соберутся сами. Потом любое блюдо можно заменить.</p>
          <div className="btns fill" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Выбрать неделю' : 'Предложить неделю'}</button>
          </div>
        </section>
        {data.next.week ? <NextWeekHero me={me} members={members} db={db} data={data} openWeek={() => setSheet({ kind: 'week', mode: 'next' })} /> : null}
        {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} /> : null}
      </>
    );
  }

  const dayIso = addDaysIso(current.start, day);
  const dayOffers = data.offers.filter((o) => o.on_date === dayIso);
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
    // A dish someone took «instead» replaces the menu dish on screen; the week itself stays as it was.
    const swap = dayOffers.find((o) => o.meal === meal && o.how === 'instead' && o.status === 'taken');
    if (swap) { extra.unshift(`вместо: ${lower(main)}`); main = name(swap.dish_id); }
    return <MealRow key={meal} name={main || 'Не выбрано'} label={MEAL_LABEL[meal]} time={MEAL_TIME[meal]} extra={extra} note={parent ? note : undefined} onOpen={() => setSheet({ kind: 'slot', day, meal })} />;
  };
  const date = (d: number) => Number(addDaysIso(current.start, d).slice(8));

  return (
    <>
      <Header title="Меню" subtitle={`Неделя ${weekLabel(current.start)} · ${current.week.status === 'approved' ? 'утверждена' : 'предложена'}`} />
      {noRecipes}
      {refused}
      {segs}
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
        {dayOffers.length ? <p className="tl-group">Предложили на этот день</p> : null}
        {dayOffers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} />)}
        <p className="note">Нажмите на блюдо, чтобы заменить его блюдом из другой недели или из всех рецептов.</p>
        {parent ? <div className="card-foot"><button type="button" className="more" onClick={() => setSheet({ kind: 'save' })}>Сохранить неделю как шаблон</button></div> : null}
      </section>
      {saved ? <p className="note" role="status" style={{ margin: '0 16px 16px' }}>{saved}</p> : null}
      {sheet ? <SheetHost sheet={sheet} close={() => setSheet(null)} me={me} members={members} db={db} data={data} onSaved={(name) => setSaved(`Шаблон «${name}» сохранён — он появится в выборе недели.`)} /> : null}
    </>
  );
}

function SheetHost({ sheet, close, me, db, data, onSaved }: { sheet: MenuSheet; close: () => void; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; onSaved?: (name: string) => void }) {
  const week = data.current.week;
  if (sheet.kind === 'save' && week) return <SaveTemplateSheet db={db} week={week} slots={data.current.slots} onClose={close} onSaved={onSaved} />;
  if (sheet.kind === 'slot' && week) {
    return <SlotSheet db={db} week={week} day={sheet.day} meal={sheet.meal} currentSlot={data.current.slots.find((s) => s.day === sheet.day && s.meal === sheet.meal)}
      recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onClose={close} />;
  }
  if (sheet.kind === 'week') return <WeekSheet db={db} mode={sheet.mode} me={me} data={data} onClose={close} />;
  if (sheet.kind === 'day' && week) return <DaySheet db={db} week={week} day={sheet.day} recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onClose={close} />;
  return null;
}

function SaveTemplateSheet({ db, week, slots, onClose, onSaved }: { db: LocalDb; week: Week; slots: WeekSlot[]; onClose: () => void; onSaved?: (name: string) => void }) {
  const [name, setName] = useState('');
  const save = async () => { await saveWeekAsTemplate(db, week, slots, name); onSaved?.(name.trim()); onClose(); };
  return (
    <Sheet title="Сохранить неделю как шаблон" sub="Со всеми заменами. Потом её можно выбрать на любую неделю." onClose={onClose}
      actions={<button type="button" className="btn" disabled={!name.trim()} onClick={save}>Сохранить</button>}>
      <label className="field" style={{ margin: '0 16px' }}>Название<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Наша осень" /></label>
    </Sheet>
  );
}
