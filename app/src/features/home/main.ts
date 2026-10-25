import type { DishOffer, ShoppingItem } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Request } from '../board/types';
import type { MonthPayment } from '../money/month';

export type Main = { kind: 'offer'; offer: DishOffer } | { kind: 'request'; request: Request } | { kind: 'pay'; pay: MonthPayment } | { kind: 'urgent'; item: ShoppingItem } | { kind: 'dinner'; text: string } | { kind: 'no-week' };

// A request counts as «now» when it is urgent or due today or earlier, and still waits or was taken.
export const pressing = (requests: Request[], me: Member, today: string) => requests
  .filter((r) => r.to_id === me.id && (r.status === 'open' || r.status === 'accepted') && (r.urgent || (r.due_on !== null && r.due_on <= today)))
  .sort((x, y) => Number(y.urgent) - Number(x.urgent) || (x.due_on ?? '9999').localeCompare(y.due_on ?? '9999'));

// On top, in this order: a request that cannot wait, a parent's overdue payment, a dish asked for today,
// an urgent purchase, dinner. pay: the next unpaid payment of the month, if any.
export function mainThing(a: { me: Member; today: string; offers: DishOffer[]; urgent: ShoppingItem[]; dinner: string | null; hasWeek: boolean; requests?: Request[]; pay?: MonthPayment }): Main {
  const request = pressing(a.requests ?? [], a.me, a.today)[0];
  if (request) return { kind: 'request', request };
  if (a.me.role === 'parent' && a.pay && !a.pay.paid && a.pay.due < a.today) return { kind: 'pay', pay: a.pay };
  const offer = a.offers.find((o) => o.status === 'open' && o.on_date === a.today && o.from_member !== a.me.id && (o.to_member === a.me.id || o.to_member === null));
  if (offer) return { kind: 'offer', offer };
  if (a.urgent.length) return { kind: 'urgent', item: a.urgent[0] };
  return a.hasWeek && a.dinner ? { kind: 'dinner', text: a.dinner } : { kind: 'no-week' };
}

const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const greeting = (d: Date) => { const h = d.getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : 'Добрый вечер'; };
export const dateLine = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
