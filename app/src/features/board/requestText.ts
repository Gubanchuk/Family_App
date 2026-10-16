import type { Request } from './types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayNum = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

export function whenText(due: string | null, today: string): string {
  if (!due) return 'без срока';
  const d = dayNum(due) - dayNum(today);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d < 0) return 'срок прошёл';
  return `к ${Number(due.slice(8, 10))} ${MONTHS[Number(due.slice(5, 7)) - 1]}`;
}

const rank = (r: Request) => [r.status === 'open' ? 0 : 1, r.urgent ? 0 : 1, r.due_on ?? '9999-12-31'] as const;
const order = (a: Request, b: Request) => {
  const x = rank(a); const y = rank(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
};

export const mineToDo = (list: Request[], meId: string) => list.filter((r) => r.to_id === meId && r.status !== 'cancelled').sort(order);
export const mineAsked = (list: Request[], meId: string) => list.filter((r) => r.from_id === meId).sort(order);

// Open requests per person, for the counter on the family row.
export function openTo(list: Request[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const r of list) if (r.status === 'open' && !r.deleted_at) n.set(r.to_id, (n.get(r.to_id) ?? 0) + 1);
  return n;
}

export const requestsWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'просьба' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'просьбы' : 'просьб'}`;
