import { useEffect, useState } from 'react';
import { useToday } from '../../lib/useToday';
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
import MealSheet from './MealSheet';
import DaySheet from './DaySheet';
import { canEditWeek } from './actions';
import NextWeekHero, { CurrentWeekHero } from './NextWeekHero';
import { getMealTimes } from '../../lib/mealTimes';
import { useToast } from '../shell/toastContext';
import WeekSheet from './WeekSheet';
import { setWeekFromTemplate } from './weekActions';
import { dayOfWeek, daysWord, MEAL_LABEL, MEALS, mondayOf, soupBatches, soupOn, weekLabel, addDaysIso, type Meal } from './week';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAME = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type MenuSheet =
  | { kind: 'meal'; day: number; meal: Meal }
  | { kind: 'dish'; dish_id: string }
  | { kind: 'slot'; day: number; meal: Meal }
  | { kind: 'day'; day: number }
  | { kind: 'week'; mode: 'current' | 'next'; other?: boolean }
  | { kind: 'save' };

export default function MenuPage({ me, members, db = localDb, today: fixedToday }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const today = useToday(fixedToday);
  const data = useMenu(db, me.household_id, today);
  const sync = useSync();
  const [day, setDay] = useState(dayOfWeek(today));
  // A new week (the app left open past Sunday midnight) opens on its own today.
  const weekStart = mondayOf(today);
  useEffect(() => { setDay(dayOfWeek(today)); }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const [params, setParams] = useSearchParams();
  // «Заменить» on Home lands here with the replace sheet of today's meal already open.
  const [sheet, setSheet] = useState<MenuSheet | null>(() => {
    const m = params.get('replace') as Meal | null;
    return m && MEALS.includes(m) ? { kind: 'slot', day: dayOfWeek(today), meal: m } : null;
  });
  const closeSheet = () => { setSheet(null); if (params.has('replace')) setParams({}, { replace: true }); };
  // «Предложить блюдо» for whoever cannot change the week: «Что покушать» is where a dish is offered.
  const propose = () => { setParams({ panel: 'ideas' }); setSheet(null); };
  const toast = useToast();
  const times = getMealTimes();
  const panel = params.get('panel') === 'ideas' ? 'ideas' : 'week';
  if (!data) return <><Header ask="menu" title="Меню" /><p className="note" style={{ margin: 16 }}>Загружаем меню…</p></>;
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
    return <><Header ask="menu" title="Меню" subtitle="Что покушать" />{noRecipes}{refused}{segs}<IdeasPanel me={me} members={members} db={db} today={today} /></>;
  }
  const slotAt = (d: number, meal: Meal): WeekSlot | undefined => current.slots.find((s) => s.day === d && s.meal === meal);
  const template = templates.find((t) => t.id === current.week?.template_id);

  if (!current.week) {
    // Dishes offered or taken for this week still show without a menu: someone is cooking them.
    const weekOffers = [...data.offers].sort((a, b) => a.on_date.localeCompare(b.on_date));
    return (
      <>
        <Header ask="menu" title="Меню" subtitle={`Неделя ${weekLabel(current.start)}`} />
        {noRecipes}
        {refused}
        {segs}
        <section className="card">
          <div className="card-h"><h2>Неделя на {weekLabel(current.start)} не выбрана</h2></div>
          <p className="note">Возьмите один из шаблонов — меню и список покупок соберутся сами. Потом любое блюдо можно заменить. Или выберите блюда только на нужные дни.</p>
          <div className="btns fill" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setSheet({ kind: 'week', mode: parent ? 'current' : 'next' })}>{parent ? 'Выбрать неделю' : 'Предложить неделю'}</button>
            {parent ? <button type="button" className="btn soft" onClick={async () => {
              await setWeekFromTemplate(db, { household: me.household_id, startsOn: current.start, template: null, status: 'approved', by: me.id });
              toast({ text: 'Нажмите на приём в нужный день и выберите блюдо. В покупки попадёт только выбранное.' });
            }}>Только нужные дни</button> : null}
          </div>
        </section>
        {weekOffers.length ? (
          <section className="card">
            <div className="card-h"><h2>Предложили на эту неделю</h2></div>
            {weekOffers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} onOpen={() => setSheet({ kind: 'dish', dish_id: o.dish_id })} />)}
          </section>
        ) : null}
        {data.next.week ? <NextWeekHero me={me} members={members} db={db} data={data} openWeek={() => setSheet({ kind: 'week', mode: 'next' })} openOther={() => setSheet({ kind: 'week', mode: 'next', other: true })} /> : null}
        {sheet ? <SheetHost sheet={sheet} open={setSheet} close={closeSheet} propose={propose} me={me} members={members} db={db} data={data} today={dayOfWeek(today)} /> : null}
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
    if (swap) { if (main) extra.unshift(`вместо: ${lower(main)}`); main = name(swap.dish_id); }
    const replace = () => setSheet({ kind: 'slot', day, meal });
    // An empty meal has nothing to read, so it goes straight to choosing one.
    const filled = !!(s?.dish_id || s?.simple || swap);
    const dish = recipes.get(swap?.dish_id ?? s?.dish_id ?? '');
    return <MealRow key={meal} name={main || 'Не выбрано'} label={MEAL_LABEL[meal]} time={times[meal]} extra={extra} note={parent ? note : undefined} dish={dish}
      onOpen={filled ? () => setSheet({ kind: 'meal', day, meal }) : replace} onReplace={canEditWeek(me, current.week!) ? replace : undefined} />;
  };
  const date = (d: number) => Number(addDaysIso(current.start, d).slice(8));

  return (
    <>
      <Header ask="menu" title="Меню" subtitle={`Неделя ${weekLabel(current.start)} · ${current.week.status === 'approved' ? 'утверждена' : 'предложена'}`} />
      {noRecipes}
      {refused}
      {segs}
      {!data.next.week && current.week.status === 'approved' && dayOfWeek(today) < 3
        ? <CurrentWeekHero db={db} data={data} openNext={() => setSheet({ kind: 'week', mode: 'next' })} />
        : <NextWeekHero me={me} members={members} db={db} data={data} openWeek={() => setSheet({ kind: 'week', mode: 'next' })} openOther={() => setSheet({ kind: 'week', mode: 'next', other: true })} />}
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
        {dayOffers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} onOpen={() => setSheet({ kind: 'dish', dish_id: o.dish_id })} />)}
        <p className="note">Нажмите на блюдо, чтобы открыть рецепт.</p>
        {parent ? <div className="card-foot"><button type="button" className="more" onClick={() => setSheet({ kind: 'save' })}>Сохранить неделю как шаблон</button></div> : null}
      </section>
      {sheet ? <SheetHost sheet={sheet} open={setSheet} close={closeSheet} propose={propose} me={me} members={members} db={db} data={data} today={dayOfWeek(today)} onSaved={(name) => toast({ text: `Шаблон «${name}» сохранён — он появится в выборе недели.` })} /> : null}
    </>
  );
}

function SheetHost({ sheet, open, close, propose, me, db, data, today, onSaved }: { sheet: MenuSheet; open: (s: MenuSheet) => void; close: () => void; propose: () => void; me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; today: number; onSaved?: (name: string) => void }) {
  const week = data.current.week;
  if (sheet.kind === 'save' && week) return <SaveTemplateSheet db={db} week={week} slots={data.current.slots} onClose={close} onSaved={onSaved} />;
  if (sheet.kind === 'meal' && week) {
    const s = data.current.slots.find((x) => x.day === sheet.day && x.meal === sheet.meal);
    const swap = data.offers.find((o) => o.on_date === addDaysIso(data.current.start, sheet.day) && o.meal === sheet.meal && o.how === 'instead' && o.status === 'taken');
    const parts = swap ? { dish_id: swap.dish_id, side_id: null, salad_id: null, simple: null } : { dish_id: s?.dish_id ?? null, side_id: s?.side_id ?? null, salad_id: s?.salad_id ?? null, simple: s?.simple ?? null };
    return <MealSheet key={`${sheet.day}-${sheet.meal}`} db={db} parts={parts} recipes={data.recipes} onClose={close} onPropose={propose}
      onReplace={canEditWeek(me, week) ? () => open({ kind: 'slot', day: sheet.day, meal: sheet.meal }) : null} />;
  }
  if (sheet.kind === 'dish') return <MealSheet key={`dish-${sheet.dish_id}`} db={db} parts={{ dish_id: sheet.dish_id, side_id: null, salad_id: null, simple: null }} recipes={data.recipes} onClose={close} onReplace={null} />;
  if (sheet.kind === 'slot' && week) {
    return <SlotSheet db={db} week={week} day={sheet.day} meal={sheet.meal} currentSlot={data.current.slots.find((s) => s.day === sheet.day && s.meal === sheet.meal)} slots={data.current.slots}
      recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onPropose={propose} onClose={close} />;
  }
  if (sheet.kind === 'week') return <WeekSheet db={db} mode={sheet.mode} other={sheet.other} me={me} data={data} today={today} onClose={close} />;
  if (sheet.kind === 'day' && week) return <DaySheet db={db} week={week} day={sheet.day} recipes={data.recipes} templates={data.templates} editable={canEditWeek(me, week)} onPropose={propose} onClose={close} />;
  return null;
}

function SaveTemplateSheet({ db, week, slots, onClose, onSaved }: { db: LocalDb; week: Week; slots: WeekSlot[]; onClose: () => void; onSaved?: (name: string) => void }) {
  const [name, setName] = useState('');
  const save = async () => { await saveWeekAsTemplate(db, week, slots, name); onSaved?.(name.trim()); onClose(); };
  return (
    <Sheet title="Сохранить неделю как шаблон" sub="Со всеми заменами. Потом её можно выбрать на любую неделю." onClose={onClose} keepOnBackdrop={!!name.trim()}
      actions={<button type="button" className="btn" disabled={!name.trim()} onClick={save}>Сохранить</button>}>
      <label className="field" style={{ margin: '0 16px' }}>Название<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Наша осень" /></label>
    </Sheet>
  );
}
