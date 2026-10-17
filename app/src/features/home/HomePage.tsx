import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useToday } from '../../lib/useToday';
import Header from '../shell/Header';
import QuickAddSheet from './QuickAddSheet';
import { useBoardReady } from '../board/useBoard';
import { useMoneyReady } from '../money/useMoney';
import Icon from '../shell/Icon';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { getMealTimes } from '../../lib/mealTimes';
import { dayOfWeek, MEAL_LABEL, MEALS, soupOn, type Meal } from '../menu/week';
import MealSheet from '../menu/MealSheet';
import { canEditWeek } from '../menu/actions';
import OfferRow from '../ideas/OfferRow';
import { MEAL_FOR, takeOffer } from '../ideas/offerActions';
import { listTotals, rub } from '../shop/build';
import { useHome } from './useHome';
import { dateLine, greeting, mainThing } from './main';
import { setRequestDone } from '../board/boardActions';
import { mineToDo, openTo, whenText } from '../board/requestText';
import { progress, savedIn } from '../board/boardMath';
import { daysTo, dueText, nextDue } from '../money/month';
import { memberColor } from '../family/colors';
import AvatarFace from '../family/AvatarFace';
import FamilyRow from './FamilyRow';
import PushPrompt from './PushPrompt';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function HomePage({ me, members, db = localDb, today: fixedToday }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const today = useToday(fixedToday);
  const data = useHome(db, me.household_id, today);
  const times = getMealTimes();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Meal | null>(null);
  const [adding, setAdding] = useState(false);
  // Read ahead so the quick-add sheet opens with all its rows at once.
  const boardReady = useBoardReady(db);
  const moneyReady = useMoneyReady(db);
  const avatar = <NavLink to="/settings" className="av" style={{ ['--c' as string]: memberColor(me.color) }} aria-label="Настройки и профиль"><AvatarFace member={me} /></NavLink>;
  const actions = (
    <>
      <button type="button" className="round-btn add-btn" aria-label="Добавить" onClick={() => setAdding(true)}><Icon name="plus" /></button>
      {avatar}
    </>
  );
  const head = (
    <>
      <Header title={`${greeting(today)}, ${me.name}`} subtitle={dateLine(today)} action={actions} />
      {adding ? <QuickAddSheet me={me} board={boardReady} money={moneyReady} onClose={() => setAdding(false)} /> : null}
    </>
  );
  if (!data) return head;

  const d = dayOfWeek(today);
  const name = (id: string | null | undefined) => (id ? data.recipes.get(id)?.name ?? '' : '');
  const slot = (m: Meal) => data.slots.find((s) => s.day === d && s.meal === m);
  const text = (m: Meal) => {
    const s = slot(m);
    if (m === 'lunch') { const pot = soupOn(data.slots, d); if (pot) return `${name(pot.dish_id)}${pot.of > 1 ? `, ${pot.nth}-й день из ${pot.of}` : ''}`; }
    if (m === 'snack' && !s?.dish_id && s?.simple) return s.simple.simple;
    return [name(s?.dish_id), s?.side_id ? lower(name(s.side_id)) : ''].filter(Boolean).join(' + ');
  };
  const urgent = data.items.filter((i) => i.urgent && !data.marks.get(i.id)?.bought);
  // A dish someone took «instead» of dinner is what the family eats tonight.
  const swap = data.offers.find((o) => o.meal === 'dinner' && o.how === 'instead' && o.status === 'taken');
  const swapOf = (m: Meal) => data.offers.find((o) => o.meal === m && o.how === 'instead' && o.status === 'taken');
  const partsOf = (m: Meal) => {
    const sw = swapOf(m);
    if (sw) return { dish_id: sw.dish_id, side_id: null, salad_id: null, simple: null };
    const s = slot(m);
    const pot = m === 'lunch' ? soupOn(data.slots, d) : null;
    return { dish_id: pot?.dish_id ?? s?.dish_id ?? null, side_id: s?.side_id ?? null, salad_id: s?.salad_id ?? null, simple: s?.simple ?? null };
  };
  // Today's meals open their recipe; an empty one goes to the menu to be chosen.
  const openMeal = (m: Meal) => { const p = partsOf(m); if (p.dish_id || p.simple) setOpen(m); else navigate(`/menu?replace=${m}`); };
  const dinner = name(swap?.dish_id ?? slot('dinner')?.dish_id);
  const main = mainThing({ me, today: data.todayIso, offers: data.offers, urgent, dinner: data.week && dinner ? lower(dinner) : null, hasWeek: !!data.week, requests: data.requests });
  // Open requests to me beyond the one on top, for the «Просьбы мне» card.
  const heroRequest = main.kind === 'request' ? main.request.id : null;
  const moreRequests = mineToDo(data.requests, me.id).filter((r) => r.status === 'open' && r.id !== heroRequest).slice(0, 3);
  // Piggy banks count the old saved sum plus deposits.
  const inBank = (x: { id: string; saved: number }) => savedIn(data.bank, x);
  const goal = data.goals.filter((g) => !g.owner_id && progress(inBank(g), g.target) < 1).sort((x, y) => progress(inBank(y), y.target) - progress(inBank(x), x.target))[0];
  // A child sees the wish closest to its price; without prices, the newest.
  const left = (w: { id: string; price: number | null; saved: number }) => (w.price ? Math.max(0, w.price - inBank(w)) : Number.MAX_SAFE_INTEGER);
  const myWish = me.role === 'child'
    ? data.wishes.filter((w) => w.owner_id === me.id).sort((a, b) => left(a) - left(b) || String(b.updated_at).localeCompare(String(a.updated_at)))[0]
    : undefined;
  // A parent sees the next unpaid payment of the month when it is a week away or less (or overdue).
  const nextPay = me.role === 'parent' ? nextDue(data.payments, data.paymentMarks, data.todayIso) : undefined;
  const pay = nextPay && daysTo(data.todayIso, nextPay.due) <= 7 ? nextPay : undefined;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const next = MEALS.find((m) => mins(times[m]) > nowMin);
  const totals = listTotals(data.items.map((i) => ({ est: i.est_price, real: data.marks.get(i.id)?.price_real ?? null, bought: !!data.marks.get(i.id)?.bought })));
  const who = (id: string) => members.find((m) => m.id === id)?.name ?? 'Кто-то';

  return (
    <>
      {head}
      <FamilyRow me={me} members={members} todo={openTo(data.requests)} />
      <PushPrompt me={me} />
      <section className="hero" aria-label="Главное сейчас">
        {main.kind === 'offer' ? (
          <>
            <h2>{who(main.offer.from_member)} просит: {name(main.offer.dish_id)}</h2>
            <p>Сегодня {MEAL_FOR[main.offer.meal]}, {main.offer.how === 'over' ? 'поверх меню' : 'вместо блюда по меню'}.</p>
            <div className="hero-chips">
              <button type="button" className="hero-chip primary" onClick={() => takeOffer(db, main.offer, me)}><Icon name="check" />Сделаю</button>
              <Link className="hero-chip" to={`/menu?panel=ideas&recipe=${main.offer.dish_id}`}>Рецепт</Link>
            </div>
          </>
        ) : main.kind === 'request' ? (
          <>
            <h2>{who(main.request.from_id)} просит: {main.request.title}</h2>
            <p>{[main.request.urgent ? 'Срочно' : '', whenText(main.request.due_on, data.todayIso)].filter(Boolean).join(' · ')}</p>
            <div className="hero-chips">
              <button type="button" className="hero-chip primary" onClick={() => setRequestDone(db, main.request, true)}><Icon name="check" />Сделано</button>
              <Link className="hero-chip" to="/board?tab=requests">Все просьбы</Link>
            </div>
          </>
        ) : main.kind === 'urgent' ? (
          <>
            <h2>Срочно купить: {main.item.title}</h2>
            <p>{[main.item.qty_text, main.item.added_by ? `добавлено: ${who(main.item.added_by)}` : ''].filter(Boolean).join(' · ')}</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/shop"><Icon name="cart" />Покупки</Link></div>
          </>
        ) : main.kind === 'dinner' ? (
          <>
            <h2>Ужин в {times.dinner} — {main.text}</h2>
            <p>{urgent.length ? '' : 'Срочных покупок нет.'}</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/menu"><Icon name="menu" />Меню на неделю</Link></div>
          </>
        ) : (
          <>
            <h2>Меню на эту неделю ещё не выбрано</h2>
            <p>{me.role === 'parent' ? 'Возьмите шаблон — меню и покупки соберутся сами.' : 'Предложите шаблон — родители утвердят.'}</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/menu">{me.role === 'parent' ? 'Выбрать неделю' : 'Предложить неделю'}</Link></div>
          </>
        )}
      </section>
      {data.week ? (
        <>
          <div className="sec-h"><h2>Сегодня едим</h2><Link className="more" to="/menu">Меню</Link></div>
          {next ? (
            <button type="button" className="meal-now" onClick={() => openMeal(next)}><span className="mn-time">{times[next]}</span><span className="mn-main"><b>{text(next) || 'Не выбрано'}</b><small>{MEAL_LABEL[next]}</small></span></button>
          ) : null}
          <section className="card">
            {MEALS.filter((m) => m !== next).map((m) => (
              <button type="button" className={`row meal-row ${mins(times[m]) < nowMin ? 'past' : ''}`} key={m} onClick={() => openMeal(m)}><span className="tl-t">{times[m]}</span><span className="row-main"><b>{text(m) || 'Не выбрано'}</b><small>{MEAL_LABEL[m]}</small></span></button>
            ))}
            {data.offers.length ? <p className="tl-group">Предложили на сегодня</p> : null}
            {data.offers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} />)}
          </section>
        </>
      ) : null}
      {moreRequests.length ? (
        <>
          <div className="sec-h"><h2>Просьбы мне</h2><Link className="more" to="/board?tab=requests">Все</Link></div>
          <section className="card">
            {moreRequests.map((r) => (
              <div className="row" key={r.id}>
                <span className="row-main"><b>{r.title}</b><small>{who(r.from_id)} · {whenText(r.due_on, data.todayIso)}</small></span>
                {r.urgent ? <span className="pill">срочно</span> : null}
                <button type="button" className="btn soft sm" aria-label={`${r.title}: сделано`} onClick={() => setRequestDone(db, r, true)}><Icon name="check" /></button>
              </div>
            ))}
          </section>
        </>
      ) : null}
      {open && data.week ? (
        <MealSheet key={open} db={db} parts={partsOf(open)} recipes={data.recipes} onClose={() => setOpen(null)}
          onReplace={canEditWeek(me, data.week) ? () => navigate(`/menu?replace=${open}`) : null} />
      ) : null}
      {/* As in the mockup: the goal stands tall on the left when two tiles share the right; no holes in two columns. */}
      <div className="bento">
        {goal ? (
          <Link className={`tile ${pay || myWish ? 'tall' : ''}`} to="/board?tab=goals" style={{ ['--h' as string]: 'var(--k-goal)' }}>
            <span className="t-k"><Icon name="board" />{goal.title}</span><span className="t-v num">{rub(inBank(goal))}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(progress(inBank(goal), goal.target) * 100)}%` }} /></span>
            <span className="t-s">из {rub(goal.target)}</span>
          </Link>
        ) : null}
        <Link className={`tile ${goal || pay || myWish ? '' : 'wide'}`} to="/shop" style={{ ['--h' as string]: 'var(--k-shop)' }}>
          <span className="t-k"><Icon name="cart" />Покупки</span><span className="t-v num">{totals.count - totals.doneCount}</span>
          <span className="t-s">осталось купить{totals.left ? ` · ≈ ${rub(totals.left)}` : ''}</span>
        </Link>
        {pay ? (
          <Link className="tile" to="/money" style={{ ['--h' as string]: 'var(--k-money)' }}>
            <span className="t-k"><Icon name="wallet" />Скоро платить</span><span className="t-v">{pay.p.title} · {rub(pay.p.amount)}</span>
            <span className="t-s">{dueText(daysTo(data.todayIso, pay.due))}</span>
          </Link>
        ) : myWish ? (
          <Link className="tile" to="/board?tab=wishes" style={{ ['--h' as string]: 'var(--k-money)' }}>
            <span className="t-k"><Icon name="gift" />Хотелки</span><span className="t-v">{myWish.title}</span>
            <span className="t-s">в копилке {rub(inBank(myWish))}</span>
          </Link>
        ) : null}
      </div>
    </>
  );
}
