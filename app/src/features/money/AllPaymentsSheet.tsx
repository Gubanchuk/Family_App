import Sheet from '../menu/Sheet';
import { rub } from '../shop/build';
import { allPayments, paymentSpan } from './month';
import type { Payment } from './types';

// Every payment in one place, also the ones that start in a later month and do not show in this one yet.
export default function AllPaymentsSheet({ payments, current, onPick, onClose }: { payments: Payment[]; current: string; onPick: (p: Payment) => void; onClose: () => void }) {
  const list = allPayments(payments, current);
  return (
    <Sheet title="Все платежи" sub="тап — изменить" onClose={onClose}>
      <div style={{ margin: '0 16px 16px' }}>
        {list.length ? list.map(({ p, done }) => (
          <button type="button" className={`row meal-row pay-row ${done ? 'paid' : ''}`} key={p.id} onClick={() => onPick(p)}>
            <span className="row-main"><b>{p.title}</b><small>{done ? 'выплачена · ' : ''}{paymentSpan(p, current)}</small></span>
            <span className="amount">{rub(p.amount)}</span>
          </button>
        )) : <p className="note" style={{ margin: 0 }}>Платежей пока нет.</p>}
      </div>
    </Sheet>
  );
}
