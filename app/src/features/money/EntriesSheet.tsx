import Sheet from '../menu/Sheet';
import type { Member } from '../family/useFamily';
import { rub } from '../shop/build';
import { dayTitle, monthTitle } from './month';
import type { MoneyEntry } from './types';

// The entries behind one line of the month: a category of expenses, or the income. A tap opens one to fix or delete.
export default function EntriesSheet({ title, month, entries, members, unpriced = 0, onPick, onAdd, onClose }: {
  title: string; month: string; entries: MoneyEntry[]; members: Member[]; unpriced?: number;
  onPick: (e: MoneyEntry) => void; onAdd?: () => void; onClose: () => void;
}) {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Кто-то';
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const list = [...entries].sort((a, b) => b.on_date.localeCompare(a.on_date) || b.amount - a.amount);
  return (
    <Sheet title={title} sub={`${monthTitle(month)} · ${rub(total)}${unpriced ? ` · ещё ${unpriced} без цены` : ''}`} onClose={onClose}
      actions={onAdd ? <button type="button" className="btn" onClick={onAdd}>Добавить доход</button> : undefined}>
      <div style={{ margin: '0 16px' }}>
        {list.length ? list.map((e) => 'fromShop' in e ? (
          // Bought from the shopping list: fixed there (price, mark), so read-only here.
          <div className="row set-row" key={e.id}>
            <span className="row-main"><b>{e.note}</b><small>из списка покупок · {name(e.member_id)}</small></span>
            <span className="amount">{rub(e.amount)}</span>
          </div>
        ) : (
          <button type="button" className="row set-row" key={e.id} onClick={() => onPick(e)}>
            <span className="row-main"><b>{e.note || dayTitle(e.on_date)}</b><small>{e.note ? `${dayTitle(e.on_date)} · ${name(e.member_id)}` : name(e.member_id)}</small></span>
            <span className="amount">{rub(e.amount)}</span>
          </button>
        )) : <p className="note">За {monthTitle(month).toLowerCase()} записей нет.</p>}
      </div>
    </Sheet>
  );
}
