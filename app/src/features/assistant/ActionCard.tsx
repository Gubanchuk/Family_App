import { useState } from 'react';
import Icon from '../shell/Icon';
import type { ActionCard as Card } from './loop';

const HEAD: Record<Card['status'], string> = {
  pending: 'Сделать?', running: 'Делаю сам', done: 'Готово', undone: 'Отменено', failed: 'Не получилось', declined: 'Не стал делать',
};

// What the assistant does in the app, told by the app itself from the action: asked first («Сделать?») when
// others will see it or it is money, otherwise done at once with «Отменить».
export default function ActionCard({ card }: { card: Card }) {
  const [busy, setBusy] = useState(false);
  const run = async (f?: () => Promise<void>) => { if (!f || busy) return; setBusy(true); try { await f(); } finally { setBusy(false); } };
  return (
    <div className={`act-card ${card.status}`} role="group" aria-label={`${HEAD[card.status]}: ${card.summary}`}>
      <div className="act-h">
        <Icon name={card.status === 'done' ? 'check' : card.status === 'failed' ? 'x' : 'spark'} />
        <b>{card.status === 'done' && card.kind === 'confirm' ? 'Сделано' : HEAD[card.status]}</b>
      </div>
      <p className="act-what">{card.summary}</p>
      {card.error ? <p className="act-err">{card.error}</p> : null}
      {card.status === 'pending' && card.decide ? (
        <div className="btns fill">
          <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => card.decide!(true))}>Сделать</button>
          <button type="button" className="btn soft sm" disabled={busy} onClick={() => run(() => card.decide!(false))}>Не надо</button>
        </div>
      ) : null}
      {card.status === 'done' && card.undo ? (
        <button type="button" className="act-undo" disabled={busy} onClick={() => run(card.undo)}>Отменить</button>
      ) : null}
    </div>
  );
}
