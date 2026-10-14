import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { rub } from './build';

export default function ItemSheet({ item, mark, onPrice, onRemove, onClose }: {
  item: ShoppingItem; mark?: ShoppingMark; onPrice: (p: number | null) => Promise<void>; onRemove: () => Promise<void>; onClose: () => void;
}) {
  const [price, setPrice] = useState(mark?.price_real?.toString() ?? '');
  const save = async () => { const n = Number(price.replace(',', '.')); await onPrice(price.trim() && Number.isFinite(n) ? n : null); onClose(); };
  return (
    <Sheet title={item.title} sub={[item.qty_text, item.est_price !== null ? `примерно ${rub(item.est_price)}` : ''].filter(Boolean).join(' · ')} onClose={onClose}
      actions={<button type="button" className="btn" onClick={save}>Сохранить</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <label className="field">Сколько заплатили, ₽<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Например, 189" /></label>
        {item.source !== 'menu' ? <button type="button" className="btn soft" onClick={async () => { await onRemove(); onClose(); }}>Убрать из списка</button> : null}
      </div>
    </Sheet>
  );
}
