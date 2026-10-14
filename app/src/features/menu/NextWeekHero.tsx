import Icon from '../shell/Icon';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { approveWeek, voteWeek } from './weekActions';
import { weekLabel } from './week';

export default function NextWeekHero({ me, members, db, data, openWeek }: { me: Member; members: Member[]; db: LocalDb; data: NonNullable<ReturnType<typeof useMenu>>; openWeek: () => void }) {
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
  const yes = next.votes.filter((v) => v.value === 'yes').map((v) => members.find((m) => m.id === v.member_id)?.name).filter(Boolean);
  const voted = next.votes.some((v) => v.member_id === me.id);
  const approved = next.week.status === 'approved';
  return (
    <section className="hero" aria-label={`Неделя на ${label}`}>
      <h2>{by ? `${by.name}${by.id === me.id ? ' (вы)' : ''} предлагает` : 'Предложена'} неделю «{t?.name ?? 'своя'}» на {label}</h2>
      <p>{yes.length ? `За: ${yes.join(', ')}.` : 'Голосов пока нет.'}</p>
      <div className="hero-chips">
        {approved ? <span className="hero-chip">Утверждено</span> : null}
        <button type="button" className="hero-chip" onClick={openWeek}>Посмотреть или другая</button>
        {!approved && me.role === 'parent' ? <button type="button" className="hero-chip primary" onClick={() => approveWeek(db, next.week!, me)}>Утвердить</button> : null}
        {!approved && me.role !== 'parent' && !voted ? <button type="button" className="hero-chip primary" onClick={() => voteWeek(db, next.week!, me, 'yes')}><Icon name="check" />За</button> : null}
      </div>
    </section>
  );
}
