import { writeLocal } from '../../data/sync';
import type { LocalDb, ShoppingItem, ShoppingMark } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { Need } from './types';
import { guessNonFood } from '../shop/shopActions';
import { tripMark } from '../shop/tripMark';

// One shopping line per need, keyed by the need, so a second tap finds it instead of adding another.
// The shopping list keeps at most 40 characters under a line; «для …» stays whole, the note gives way.
const QTY_MAX = 40;
function qtyText(note: string, forName: string | null) {
  const who = forName ? `для ${forName}`.slice(0, QTY_MAX) : '';
  const room = QTY_MAX - (who ? who.length + 3 : 0);
  const n = note.trim();
  const cut = n.length > room ? `${n.slice(0, Math.max(0, room - 1)).trimEnd()}…` : n;
  return [room > 1 ? cut : '', who].filter(Boolean).join(' · ');
}

export function needLine(n: Need, forName: string | null) {
  const qty = qtyText(n.note, forName);
  // The chosen department, else one the name points to; a thing for a person is not clothes by default.
  const dept = n.dept || guessNonFood(n.title) || (n.for_id ? 'Другое' : 'Для дома');
  return { id: `n:${n.id}`, dept, title: n.title, qty_text: qty, est_price: n.price };
}

export async function sendNeedToShop(db: LocalDb, me: Member, n: Need, forName: string | null): Promise<'added' | 'already'> {
  const line = needLine(n, forName);
  const existing = await db.shopping_items.get(line.id);
  if (existing && !existing.deleted_at) return 'already';
  await writeLocal(db, 'shopping_items', [{
    ...line, household_id: me.household_id, week_id: null, offer_id: null, source: 'manual', item: null, qty: null, unit: null,
    urgent: false, added_by: me.id, deleted_at: null, ...(await tripMark(db, me.household_id)),
  }]);
  return 'added';
}

export function needState(n: Need, items: Map<string, ShoppingItem>, marks: Map<string, ShoppingMark>): 'todo' | 'in-shop' | 'bought' {
  const id = `n:${n.id}`;
  const item = items.get(id);
  if (!item || item.deleted_at) return 'todo';
  return marks.get(id)?.bought ? 'bought' : 'in-shop';
}
