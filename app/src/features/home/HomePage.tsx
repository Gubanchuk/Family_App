import { Link, NavLink } from 'react-router-dom';
import { useToday } from '../../lib/useToday';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import { localDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { getMealTimes } from '../../lib/mealTimes';
import { dayOfWeek, MEAL_LABEL, MEALS, soupOn, type Meal } from '../menu/week';
import OfferRow from '../ideas/OfferRow';
import { MEAL_FOR, takeOffer } from '../ideas/offerActions';
import { listTotals, rub } from '../shop/build';
import { useHome } from './useHome';
import { dateLine, greeting, mainThing } from './main';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function HomePage({ me, members, db = localDb, today: fixedToday }: { me: Member; members: Member[]; db?: LocalDb; today?: Date }) {
  const today = useToday(fixedToday);
  const data = useHome(db, me.household_id, today);
  const times = getMealTimes();
  const avatar = <NavLink to="/settings" className="av" style={{ ['--c' as string]: me.color }} aria-label="Настройки и профиль">{me.name.slice(0, 1)}</NavLink>;
  const head = <Header title={`${greeting(today)}, ${me.name}`} subtitle={dateLine(today)} action={avatar} />;
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
  const dinner = name(swap?.dish_id ?? slot('dinner')?.dish_id);
  const main = mainThing({ me, today: data.todayIso, offers: data.offers, urgent, dinner: data.week && dinner ? lower(dinner) : null, hasWeek: !!data.week });
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const next = MEALS.find((m) => mins(times[m]) > nowMin);
  const totals = listTotals(data.items.map((i) => ({ est: i.est_price, real: data.marks.get(i.id)?.price_real ?? null, bought: !!data.marks.get(i.id)?.bought })));
  const who = (id: string) => members.find((m) => m.id === id)?.name ?? 'Кто-то';

  return (
    <>
      {head}
      <div className="family" aria-label="Семья">
        {members.map((m) => (
          <div className="fam" key={m.id} style={{ ['--c' as string]: m.color }}>
            <span className="av" aria-hidden="true">{m.name.slice(0, 1)}</span><b>{m.name}</b><small>{m.user_id ? (m.role === 'parent' ? 'родитель' : 'ребёнок') : 'без входа'}</small>
          </div>
        ))}
      </div>
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
            <p>Возьмите шаблон — меню и покупки соберутся сами.</p>
            <div className="hero-chips"><Link className="hero-chip primary" to="/menu">Выбрать неделю</Link></div>
          </>
        )}
      </section>
      {data.week ? (
        <>
          <div className="sec-h"><h2>Сегодня едим</h2><Link className="more" to="/menu">Меню</Link></div>
          {next ? (
            <Link className="meal-now" to="/menu"><span className="mn-time">{times[next]}</span><span className="mn-main"><b>{text(next) || 'Не выбрано'}</b><small>{MEAL_LABEL[next]}</small></span></Link>
          ) : null}
          <section className="card">
            {MEALS.filter((m) => m !== next).map((m) => (
              <div className={`row ${mins(times[m]) < nowMin ? 'past' : ''}`} key={m}><span className="tl-t">{times[m]}</span><span className="row-main"><b>{text(m) || 'Не выбрано'}</b><small>{MEAL_LABEL[m]}</small></span></div>
            ))}
            {data.offers.length ? <p className="tl-group">Предложили на сегодня</p> : null}
            {data.offers.map((o) => <OfferRow key={o.id} offer={o} me={me} members={members} dishName={name(o.dish_id)} onTake={() => takeOffer(db, o, me)} />)}
          </section>
        </>
      ) : null}
      <div className="bento">
        <Link className="tile wide" to="/shop" style={{ ['--h' as string]: 'var(--k-shop)' }}>
          <span className="t-k"><Icon name="cart" />Покупки</span><span className="t-v num">{totals.count - totals.doneCount}</span>
          <span className="t-s">осталось купить{totals.left ? ` · ≈ ${rub(totals.left)}` : ''}</span>
        </Link>
      </div>
    </>
  );
}
