import type { DishOffer } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
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

// The row opens the offered dish's recipe; «Сделаю» beside it takes the offer.
export default function OfferRow({ offer, me, members, dishName, onTake, onOpen }: { offer: DishOffer; me: Member; members: Member[]; dishName: string; onTake: () => void; onOpen: () => void }) {
  const from = members.find((m) => m.id === offer.from_member);
  const canTake = offer.status === 'open' && offer.from_member !== me.id && (offer.to_member === me.id || offer.to_member === null);
  const sub = offerSub(offer, me, members);
  return (
    <div className="row offer">
      <button type="button" className="row-btn" aria-label={`${dishName}: ${sub}. Открыть рецепт`} onClick={onOpen}>
        <span className="av sm" style={{ ['--c' as string]: from ? memberColor(from.color) : 'var(--k-ink-2)' }} aria-hidden="true">{from ? <AvatarFace member={from} /> : '?'}</span>
        <span className="row-main"><b>{dishName}</b><small>{sub}</small></span>
      </button>
      {canTake ? <button type="button" className="btn soft sm" onClick={onTake}>Сделаю</button> : null}
    </div>
  );
}
