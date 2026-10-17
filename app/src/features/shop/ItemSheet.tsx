import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { rub } from './build';

// onHome, once the server keeps it: «Есть дома» closes a line still to buy without buying; on a line kept at home
// the same place puts it back on the list.
export default function ItemSheet({ item, mark, onPrice, onRemove, onHome, onClose }: {
  item: ShoppingItem; mark?: ShoppingMark; onPrice: (p: number | null) => Promise<void>; onRemove: () => Promise<void>;
  onHome?: (on: boolean) => Promise<unknown>; onClose: () => void;
}) {
  const [price, setPrice] = useState(mark?.price_real?.toString() ?? '');
  // An unchanged price is not written: every write moves the mark's time on the server.
  const save = async () => {
    const n = Number(price.replace(',', '.'));
    const next = price.trim() && Number.isFinite(n) ? n : null;
    if (next !== (mark?.price_real ?? null)) await onPrice(next);
    onClose();
  };
  return (
    <Sheet title={item.title} sub={[item.qty_text, item.est_price !== null ? `примерно ${rub(item.est_price)}` : ''].filter(Boolean).join(' · ')} onClose={onClose}
      actions={<button type="button" className="btn" onClick={save}>Сохранить</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <label className="field">Сколько заплатили, ₽<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Например, 189" /></label>
        {onHome && !mark?.bought ? (
          <button type="button" className="btn soft" onClick={async () => { await onHome(!mark?.at_home); onClose(); }}>{mark?.at_home ? 'Вернуть в покупки' : 'Есть дома'}</button>
        ) : null}
        {item.source !== 'menu' ? <button type="button" className="btn soft" onClick={async () => { await onRemove(); onClose(); }}>Убрать из списка</button> : null}
      </div>
    </Sheet>
  );
}
