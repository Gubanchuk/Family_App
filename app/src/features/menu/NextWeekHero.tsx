import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Icon from '../shell/Icon';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { approveWeek, voteWeek, weekListStats } from './weekActions';
import { products, weekLabel } from './week';
import { rub } from '../shop/build';
import { useToast } from '../shell/toastContext';

// Early in the week the menu screen celebrates the week that is set and its ready list;
// the next week takes the hero from Thursday, when the family starts thinking about it.
export function CurrentWeekHero({ db, data, openNext }: { db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openNext: () => void }) {
  const week = data.current.week;
  const stats = useLiveQuery(() => (week ? weekListStats(db, week.id) : undefined), [db, week?.id]);
  const t = data.templates.find((x) => x.id === week?.template_id);
  return (
    <section className="hero" aria-label="Эта неделя">
      <h2>Неделя «{t?.name ?? 'своя'}» стоит до воскресенья</h2>
      <p>{stats?.count ? `Список покупок собран: ${stats.count} ${products(stats.count)} ≈\u00A0${rub(stats.cost)}.` : data.current.slots.some((s) => s.dish_id || s.simple) ? 'Список покупок соберётся, как только меню загрузится.' : 'Нажмите на приём в нужный день и выберите блюдо — список соберётся из выбранного.'}</p>
      <div className="hero-chips">
        <Link className="hero-chip primary" to="/shop"><Icon name="cart" />К покупкам</Link>
        <button type="button" className="hero-chip" onClick={openNext}>Следующая неделя</button>
      </div>
    </section>
  );
}

// openWeek shows the proposed week; openOther offers another one instead.
export default function NextWeekHero({ me, members, db, data, openWeek, openOther = openWeek }: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void; openOther?: () => void }) {
  const toast = useToast();
  const { next, templates } = data;
  const label = weekLabel(next.start);
  if (!next.week) {
    return (
      <section className="hero" aria-label={`Неделя на ${label}`}>
        <h2>Неделя на {label} ещё не выбрана</h2>
        <p>{me.role === 'parent' ? 'Выберите шаблон — семья проголосует, вы утвердите.' : 'Предложите шаблон — семья проголосует, родители утвердят.'}</p>
        <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={openWeek}>{me.role === 'parent' ? 'Выбрать неделю' : 'Предложить неделю'}</button></div>
      </section>
    );
  }
  const t = templates.find((x) => x.id === next.week!.template_id);
  const by = members.find((m) => m.id === next.week!.proposed_by);
  // Someone who joined after this phone loaded the family still counts until the family reloads.
  const yes = next.votes.filter((v) => v.value === 'yes').map((v) => members.find((m) => m.id === v.member_id)?.name ?? 'кто-то из семьи');
  const voted = next.votes.some((v) => v.member_id === me.id);
  const approved = next.week.status === 'approved';
  // A proposal reaches this phone meal by meal; approving it before all 28 arrive would be refused.
  const complete = next.slots.length >= 28;
  // Nothing for this person to do (approved, or a child who has voted): a short card, so this week stays first.
  // A child who proposed it waits too, before the server's vote for the proposer reaches the phone.
  if (approved || (me.role !== 'parent' && (voted || by?.id === me.id))) {
    return (
      <section className="card next-mini" aria-label={`Неделя на ${label}`}>
        <span className="row-main">
          <b>Неделя на {label}: «{t?.name ?? 'своя'}»</b>
          <small>{approved ? 'утверждена, список покупок собран' : by?.id === me.id ? 'вы предложили, ждём родителей' : 'вы проголосовали, ждём родителей'}</small>
        </span>
        <button type="button" className="btn soft sm" onClick={openWeek}>Посмотреть</button>
      </section>
    );
  }
  return (
    <section className="hero compact" aria-label={`Неделя на ${label}`}>
      <h2>{by ? `${by.name}${by.id === me.id ? ' (вы)' : ''} предлагает неделю` : 'Предложена неделя'} «{t?.name ?? 'своя'}» на {label}</h2>
      <p>{yes.length ? `${yes.length === 1 ? 'Голос' : 'Голоса'} «за»: ${yes.join(', ')}.` : 'Голосов пока нет.'}{complete ? '' : ' Неделя ещё загружается.'}</p>
      {/* The main action first, so it stays at the start of the row when the chips wrap. */}
      <div className="hero-chips">
        {!approved && complete && me.role === 'parent' ? <button type="button" className="hero-chip primary" onClick={async () => {
          await approveWeek(db, next.week!, me);
          const s = await weekListStats(db, next.week!.id);
          toast({ text: `Неделя на ${label} утверждена. Список покупок: ${s.count} ${products(s.count)} ≈\u00A0${rub(s.cost)}`, action: { label: 'К покупкам', to: `/shop?week=${next.week!.id}` } });
        }}>Утвердить</button> : null}
        {!approved && me.role !== 'parent' && !voted ? <button type="button" className="hero-chip primary" onClick={() => voteWeek(db, next.week!, me, 'yes')}><Icon name="check" />За</button> : null}
        <button type="button" className="hero-chip" onClick={openWeek}>Посмотреть</button>
        <button type="button" className="hero-chip" onClick={openOther} aria-label="Предложить другую неделю">Другая</button>
      </div>
    </section>
  );
}
