import Sheet from '../menu/Sheet';
import type { ShoppingItem, ShoppingMark } from '../../data/db';
import Icon from '../shell/Icon';
import { rub } from './build';

// The parts of a product listed more than once: each opens its own line to change or remove.
export default function SameSheet({ lines, marks, origin, onOpen, onClose }: {
  lines: ShoppingItem[]; marks: Map<string, ShoppingMark>; origin: (l: ShoppingItem) => string;
  onOpen: (l: ShoppingItem) => void; onClose: () => void;
}) {
  return (
    <Sheet title={lines[0].title} sub="Этот товар добавили несколько раз. Каждую часть можно поправить или убрать." onClose={onClose}>
      <div style={{ margin: '0 16px' }}>
        {lines.map((l) => {
          const price = marks.get(l.id)?.price_real ?? l.est_price;
          return (
            <div className="row" key={l.id}>
              <button type="button" className="row-btn" onClick={() => onOpen(l)} aria-label={`${l.title}, ${[l.qty_text, origin(l)].filter(Boolean).join(', ')}: открыть`}>
                <span className="row-main"><b>{l.qty_text || 'без количества'}</b><small>{origin(l)}</small></span>
                <span className="amount">{price !== null ? rub(price) : ''}</span>
                <Icon name="chev" />
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
