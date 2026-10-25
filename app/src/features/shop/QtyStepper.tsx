import { useRef, useState } from 'react';
import Icon from '../shell/Icon';
import { formatAmount, inputUnit, nextQty, parseTyped, stepOf, type LineUnit, type Sell } from './units';

// «− 1,5 кг +»: steps on the product's grid; a tap on the amount lets one type it (kilos and litres with a comma).
export default function QtyStepper({ qty, unit, sell, pieceWeight = null, title, onChange, disabled }: {
  qty: number; unit: LineUnit; sell: Sell; pieceWeight?: number | null; title: string; onChange: (qty: number) => void; disabled?: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  // Set once the typed amount is taken or dropped, so the blur that follows does nothing.
  const settled = useRef(false);
  const step = stepOf(sell, unit, pieceWeight);
  const how = inputUnit(sell, unit, pieceWeight);
  const text = formatAmount(qty, unit, sell, pieceWeight);
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    const n = typing === null ? null : parseTyped(typing, how.factor);
    setTyping(null);
    if (n !== null && n !== qty) onChange(n);
  };
  return (
    <span className="stepper" role="group" aria-label={`${title}: количество`}>
      <button type="button" className="stepper-btn" aria-label={`Меньше: ${title}`} disabled={disabled || qty <= step} onClick={() => onChange(nextQty(qty, step, -1))}>
        <Icon name="minus" />
      </button>
      {typing === null ? (
        <button type="button" className="stepper-val" aria-label={`${text}, ввести количество`} disabled={disabled}
          onClick={() => { settled.current = false; setTyping(String(Math.round((qty / how.factor) * 1000) / 1000).replace('.', ',')); }}>{text}</button>
      ) : (
        <span className="stepper-edit">
          <input autoFocus inputMode={how.decimals ? 'decimal' : 'numeric'} value={typing} aria-label={`Сколько, ${how.label}`} enterKeyHint="done"
            onChange={(e) => setTyping(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { settled.current = true; setTyping(null); } }} />
          <small>{how.label}</small>
        </span>
      )}
      <button type="button" className="stepper-btn" aria-label={`Больше: ${title}`} disabled={disabled} onClick={() => onChange(nextQty(qty, step, 1))}>
        <Icon name="plus" />
      </button>
    </span>
  );
}
