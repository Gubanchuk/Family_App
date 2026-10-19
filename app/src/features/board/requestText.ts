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

// Waiting for an answer first, then taken, then «не могу», done and cancelled at the bottom.
const STAGE: Record<Request['status'], number> = { open: 0, accepted: 1, declined: 2, done: 3, cancelled: 4 };
const rank = (r: Request) => [STAGE[r.status], r.urgent ? 0 : 1, r.due_on ?? '9999-12-31'] as const;
const order = (a: Request, b: Request) => {
  const x = rank(a); const y = rank(b);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
};

export const mineToDo = (list: Request[], meId: string) => list.filter((r) => r.to_id === meId && r.status !== 'cancelled').sort(order);
export const mineAsked = (list: Request[], meId: string) => list.filter((r) => r.from_id === meId).sort(order);

// What the asker sees after the recipient's name: the answer, then the date while it matters.
export function answerText(r: Request, today: string, answers: boolean): string {
  if (r.status === 'done') return 'сделано';
  if (r.status === 'cancelled') return 'отменено';
  if (r.status === 'declined') return 'не может';
  if (r.status === 'accepted') return `сделает · ${whenText(r.due_on, today)}`;
  return answers ? `ждёт ответа · ${whenText(r.due_on, today)}` : whenText(r.due_on, today);
}
