export type Ev =
  | { kind: 'weeks'; author: string; template: string; startsOn: string }
  | { kind: 'dish_offers'; author: string; dish: string; meal: 'breakfast' | 'lunch' | 'snack' | 'dinner'; onDate: string; toAll: boolean }
  | { kind: 'shop_trips'; author: string };

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MEAL_FOR = { breakfast: 'на завтрак', lunch: 'на обед', snack: 'на полдник', dinner: 'на ужин' };
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const days = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

function weekLabel(start: string) {
  const a = parse(start);
  const b = new Date(a.getTime() + 6 * 86400000);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

export function compose(e: Ev, today: string) {
  if (e.kind === 'weeks') {
    return { title: `${e.author} предлагает меню на ${weekLabel(e.startsOn)}`, body: `Неделя «${e.template}». Проголосуйте в приложении.`, url: '/menu', pref: 'votes', tag: `week-${e.startsOn}` };
  }
  if (e.kind === 'dish_offers') {
    const d = days(today, e.onDate);
    const when = d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : `${parse(e.onDate).getUTCDate()} ${MONTHS[parse(e.onDate).getUTCMonth()]}`;
    return { title: `${e.author} просит: ${e.dish}`, body: `${when} ${MEAL_FOR[e.meal]}.${e.toAll ? ' Предложено всем.' : ''}`, url: '/menu?panel=ideas', pref: 'offers', tag: `offer-${e.onDate}` };
  }
  return { title: `${e.author} идёт в магазин`, body: 'Добавьте в список, что нужно купить.', url: '/shop', pref: 'shop', tag: 'shop' };
}

type Row = Record<string, unknown>;

// One push per version of an event: a week re-proposed with another template or by someone else is news again.
export function eventVersion(table: string, row: Row): string {
  return table === 'weeks' ? `${row.template_id}:${row.proposed_by}` : '';
}

// A trip or an offer queued offline can reach the server hours later; by then the push would mislead.
export function isStale(table: string, row: Row, now = Date.now()): boolean {
  if (table === 'shop_trips') return now - Date.parse(String(row.started_at)) > 3600 * 1000;
  if (table === 'dish_offers') return String(row.on_date) < new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
  return false;
}
