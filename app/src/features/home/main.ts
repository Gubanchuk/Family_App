import type { DishOffer, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';

export type Main = { kind: 'offer'; offer: DishOffer } | { kind: 'urgent'; item: ShoppingItem } | { kind: 'dinner'; text: string } | { kind: 'no-week' };

export function mainThing(a: { me: Member; today: string; offers: DishOffer[]; urgent: ShoppingItem[]; dinner: string | null; hasWeek: boolean }): Main {
  const offer = a.offers.find((o) => o.status === 'open' && o.on_date === a.today && o.from_member !== a.me.id && (o.to_member === a.me.id || o.to_member === null));
  if (offer) return { kind: 'offer', offer };
  if (a.urgent.length) return { kind: 'urgent', item: a.urgent[0] };
  return a.hasWeek && a.dinner ? { kind: 'dinner', text: a.dinner } : { kind: 'no-week' };
}

const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const greeting = (d: Date) => { const h = d.getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер'; };
export const dateLine = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
