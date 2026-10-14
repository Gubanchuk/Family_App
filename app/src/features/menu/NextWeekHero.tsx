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
      <p>{stats?.count ? `Список покупок собран: ${stats.count} ${products(stats.count)} ≈ ${rub(stats.cost)}.` : 'Список покупок соберётся, как только меню загрузится.'}</p>
      <div className="hero-chips">
        <Link className="hero-chip primary" to="/shop"><Icon name="cart" />К покупкам</Link>
        <button type="button" className="hero-chip" onClick={openNext}>Следующая неделя</button>
      </div>
    </section>
  );
}

export default function NextWeekHero({ me, members, db, data, openWeek }: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void }) {
  const toast = useToast();
  const { next, templates } = data;
  const label = weekLabel(next.start);
  if (!next.week) {
    return (
      <section className="hero" aria-label={`Неделя на ${label}`}>
        <h2>Неделя на {label} ещё не выбрана</h2>
        <p>Предложите шаблон — семья проголосует, родители утвердят.</p>
        <div className="hero-chips"><button type="button" className="hero-chip primary" onClick={openWeek}>Выбрать неделю</button></div>
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
  return (
    <section className="hero" aria-label={`Неделя на ${label}`}>
      <h2>{by ? `${by.name}${by.id === me.id ? ' (вы)' : ''} предлагает неделю` : 'Предложена неделя'} «{t?.name ?? 'своя'}» на {label}</h2>
      <p>{yes.length ? `За: ${yes.join(', ')}.` : 'Голосов пока нет.'}{complete ? '' : ' Неделя ещё загружается.'}</p>
      <div className="hero-chips">
        {approved ? <span className="hero-chip">Утверждено</span> : null}
        <button type="button" className="hero-chip" onClick={openWeek}>{approved ? 'Посмотреть' : 'Посмотреть или другая'}</button>
        {!approved && complete && me.role === 'parent' ? <button type="button" className="hero-chip primary" onClick={async () => {
          await approveWeek(db, next.week!, me);
          const s = await weekListStats(db, next.week!.id);
          toast({ text: `Неделя на ${label} утверждена. Список покупок: ${s.count} ${products(s.count)} ≈ ${rub(s.cost)}`, action: { label: 'К покупкам', to: '/shop' } });
        }}>Утвердить</button> : null}
        {!approved && me.role !== 'parent' && !voted ? <button type="button" className="hero-chip primary" onClick={() => voteWeek(db, next.week!, me, 'yes')}><Icon name="check" />За</button> : null}
      </div>
    </section>
  );
}
