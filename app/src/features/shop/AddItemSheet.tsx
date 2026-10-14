import { useState } from 'react';
import Sheet from '../menu/Sheet';
import type { Ingredient } from '../../data/db';

export default function AddItemSheet({ vocab, onAdd, onClose }: { vocab: Map<string, Ingredient>; onAdd: (a: { title: string; qtyText: string; urgent: boolean }) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [qtyText, setQty] = useState('');
  const [urgent, setUrgent] = useState(false);
  const add = async () => { await onAdd({ title, qtyText, urgent }); onClose(); };
  return (
    <Sheet title="Добавить в список" sub="Увидит вся семья. Срочное покажется на Главной." onClose={onClose}
      actions={<button type="button" className="btn" disabled={!title.trim()} onClick={add}>Добавить в список</button>}>
      <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
        <label className="field">Что купить<input value={title} onChange={(e) => setTitle(e.target.value)} list="vocab" maxLength={80} autoComplete="off" /></label>
        <datalist id="vocab">{[...vocab.keys()].map((v) => <option key={v} value={v} />)}</datalist>
        <label className="field">Сколько<input value={qtyText} onChange={(e) => setQty(e.target.value)} maxLength={40} placeholder="Например, 2 л" /></label>
        <div className="row"><span className="row-main"><b>Срочно</b><small>нужно сегодня</small></span>
          <button type="button" className="switch" role="switch" aria-checked={urgent} aria-label="Срочно" onClick={() => setUrgent(!urgent)}><i /></button></div>
      </div>
    </Sheet>
  );
}
