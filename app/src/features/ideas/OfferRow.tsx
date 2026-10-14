import type { DishOffer } from '../../data/db';
import type { Member } from '../family/useFamily';
import { MEAL_FOR } from './offerActions';
import { memberColor } from '../family/colors';

export function offerSub(o: DishOffer, me: Member, members: Member[]): string {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const how = o.how === 'over' ? 'поверх меню' : 'вместо блюда';
  if (o.status === 'taken') return `готовит ${name(o.taken_by)} · ${MEAL_FOR[o.meal]}`;
  if (o.from_member === me.id) return `вы предложили · кому: ${o.to_member ? name(o.to_member) : 'всем'} · ${MEAL_FOR[o.meal]}`;
  if (o.to_member === me.id) return `${name(o.from_member)} просит ${MEAL_FOR[o.meal]}, ${how}`;
  return `${name(o.from_member)} предлагает всем ${MEAL_FOR[o.meal]}, ${how}`;
}

export default function OfferRow({ offer, me, members, dishName, onTake }: { offer: DishOffer; me: Member; members: Member[]; dishName: string; onTake: () => void }) {
  const from = members.find((m) => m.id === offer.from_member);
  const canTake = offer.status === 'open' && offer.from_member !== me.id && (offer.to_member === me.id || offer.to_member === null);
  return (
    <div className="row offer">
      <span className="av sm" style={{ ['--c' as string]: from ? memberColor(from.color) : 'var(--k-ink-2)' }} aria-hidden="true">{from?.name.slice(0, 1) ?? '?'}</span>
      <span className="row-main"><b>{dishName}</b><small>{offerSub(offer, me, members)}</small></span>
      {canTake ? <button type="button" className="btn soft sm" onClick={onTake}>Сделаю</button> : null}
    </div>
  );
}
