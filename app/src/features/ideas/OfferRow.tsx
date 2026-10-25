import type { DishOffer, LocalDb } from '../../data/db';
import AvatarFace from '../family/AvatarFace';
import type { Member } from '../family/useFamily';
import { cancelOffer, leaveOffer, MEAL_FOR } from './offerActions';
import { memberColor } from '../family/colors';
import { useToast } from '../shell/toastContext';

export function offerSub(o: DishOffer, me: Member, members: Member[]): string {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const how = o.how === 'over' ? 'поверх меню' : 'вместо блюда';
  if (o.status === 'taken') return `готовит ${name(o.taken_by)} · ${MEAL_FOR[o.meal]}`;
  if (o.from_member === me.id) return `вы предложили · кому: ${o.to_member ? name(o.to_member) : 'всем'} · ${MEAL_FOR[o.meal]}`;
  if (o.to_member === me.id) return `${name(o.from_member)} просит ${MEAL_FOR[o.meal]}, ${how}`;
  // Addressed to someone else: say whom, not «всем».
  if (o.to_member) return `${name(o.from_member)} предлагает · кому: ${name(o.to_member)} · ${MEAL_FOR[o.meal]}, ${how}`;
  return `${name(o.from_member)} предлагает всем ${MEAL_FOR[o.meal]}, ${how}`;
}

// The row opens the offered dish's recipe; «Сделаю» beside it takes the offer. Whoever offered a dish can
// take it back, and whoever took someone's offer can back out; both leave the list and can be undone.
export default function OfferRow({ db, offer, me, members, dishName, onTake, onOpen }: { db: LocalDb; offer: DishOffer; me: Member; members: Member[]; dishName: string; onTake: () => void; onOpen: () => void }) {
  const toast = useToast();
  const from = members.find((m) => m.id === offer.from_member);
  const canTake = offer.status === 'open' && offer.from_member !== me.id && (offer.to_member === me.id || offer.to_member === null);
  const mine = offer.from_member === me.id;
  const cooking = !mine && offer.status === 'taken' && offer.taken_by === me.id;
  const sub = offerSub(offer, me, members);
  const exit = async (run: typeof cancelOffer, text: string) => {
    const undo = await run(db, offer);
    toast({ text, action: { label: 'Вернуть', run: () => { void undo(); } } });
  };
  return (
    <div className="row offer">
      <button type="button" className="row-btn" aria-label={`${dishName}: ${sub}. Открыть рецепт`} onClick={onOpen}>
        <span className="av sm" style={{ ['--c' as string]: from ? memberColor(from.color) : 'var(--k-ink-2)' }} aria-hidden="true">{from ? <AvatarFace member={from} /> : '?'}</span>
        <span className="row-main"><b>{dishName}</b><small>{sub}</small></span>
      </button>
      {canTake ? <button type="button" className="btn soft sm" onClick={onTake}>Сделаю</button> : null}
      {mine ? <button type="button" className="more" aria-label={`Отменить: ${dishName}`} onClick={() => exit(cancelOffer, `«${dishName}» больше не предлагается.`)}>Отменить</button> : null}
      {cooking ? <button type="button" className="more" aria-label={`Не смогу: ${dishName}`} onClick={() => exit(leaveOffer, `«${dishName}» снова ждёт, кто приготовит.`)}>Не смогу</button> : null}
    </div>
  );
}
