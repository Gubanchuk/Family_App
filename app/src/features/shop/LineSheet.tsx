import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { ShoppingItem, ShoppingMark } from '../../data/db';
import { rub } from './build';
import type { Product } from './catalog';
import QtyStepper from './QtyStepper';
import { lineEstimate, sellOf, type LineUnit } from './units';
import { linePrice } from './tripActions';

const UNITS: LineUnit[] = ['г', 'мл', 'шт', 'уп'];

// A trip line's sheet: how much, what was paid, out of the trip, «есть дома», off the list.
// Before buying, the price is what the line is expected to cost (it also becomes the product's price for next
// time); once bought, it is what was paid.
export default function LineSheet({ line, mark, product, who, onSave, onPrice, onTrip, onHome, onUnbuy, onRemove, onClose }: {
  line: ShoppingItem; mark?: ShoppingMark; product?: Product; who: string;
  onSave: (change: { qty?: number; est?: number | null }) => Promise<unknown>; onPrice: (p: number | null) => Promise<unknown>; onTrip: (on: boolean) => Promise<unknown>;
  onHome?: (on: boolean) => Promise<unknown>; onUnbuy?: () => Promise<unknown>; onRemove: () => Promise<unknown>; onClose: () => void;
}) {
  const unit = UNITS.includes(line.unit as LineUnit) ? (line.unit as LineUnit) : null;
  const [qty, setQty] = useState(line.qty ?? 0);
  const bought = !!mark?.bought;
  const [price, setPrice] = useState((bought ? mark?.price_real : null)?.toString() ?? '');
  const perUnit = product?.price ?? linePrice(line);
  const est = unit ? lineEstimate(qty, perUnit) : line.est_price;
  // Only what changed is written: every write moves the line's time on the server.
  const save = async () => {
    const n = Number(price.replace(',', '.'));
    const typed = price.trim() && Number.isFinite(n) && n >= 0 ? n : null;
    if (bought) {
      if (typed !== (mark?.price_real ?? null)) await onPrice(typed);
    } else if ((unit && qty !== line.qty && qty > 0) || typed !== null) {
      await onSave({ qty: unit && qty !== line.qty && qty > 0 ? qty : undefined, est: typed });
    }
    onClose();
  };
  return (
    <Sheet title={line.title} sub={[who, line.source === 'menu' ? 'из меню' : ''].filter(Boolean).join(' · ')} onClose={onClose}
      actions={<button type="button" className="btn" onClick={save}>Сохранить</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        {unit && line.qty !== null && !bought ? (
          <div className="picker-qty">
            <QtyStepper qty={qty} unit={unit} sell={product?.sell ?? sellOf(line.item, unit)} pieceWeight={product?.pieceWeight ?? null} title={line.title} onChange={setQty} />
            <span className="amount">{est !== null ? `≈ ${rub(est)}` : 'без цены'}</span>
          </div>
        ) : line.qty_text ? <p className="note" style={{ margin: 0 }}>Сколько: {line.qty_text}</p> : null}
        <label className="field">{bought ? 'Сколько заплатили, ₽' : 'Цена за всё, ₽'}
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={est !== null ? `Примерно ${Math.round(est)}` : 'Например, 189'} />
        </label>
        <div className="btns fill">
          {bought && onUnbuy
            ? <button type="button" className="btn soft" onClick={async () => { await onUnbuy(); onClose(); }}>Не купил — вернуть</button>
            : <button type="button" className="btn soft" onClick={async () => { await onTrip(!line.in_trip); onClose(); }}>{line.in_trip ? 'Убрать из похода' : 'В поход'}</button>}
          {onHome && !bought ? <button type="button" className="btn soft" onClick={async () => { await onHome(!mark?.at_home); onClose(); }}>{mark?.at_home ? 'Вернуть в покупки' : 'Есть дома'}</button> : null}
        </div>
        {/* Off the list for everyone: set apart and in the warning colour; the toast offers «Вернуть». */}
        {line.source !== 'menu' ? <button type="button" className="btn danger" onClick={async () => { await onRemove(); onClose(); }}>Убрать из списка совсем</button> : null}
      </div>
    </Sheet>
  );
}
