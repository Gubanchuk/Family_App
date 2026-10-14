import { useEffect, useState, type ReactNode } from 'react';
import type { Member } from '../family/useFamily';
import { loadMemberSettings, saveNotify } from './memberSettings';

const ROWS: Array<[string, string, string?]> = [
  ['offers', 'Предложения блюд', '«Сделай сегодня…»'],
  ['votes', 'Голосование за меню'],
  ['shop', 'Кто идёт в магазин'],
  ['quiet', 'Тихие часы', 'с 22:00 до 8:00 без звука'],
];

export default function NotifyCard({ me, push }: { me: Member; push?: ReactNode }) {
  const [n, setN] = useState<Record<string, boolean> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { loadMemberSettings(me.id).then((s) => setN(s?.notify ?? {})).catch(() => setN({})); }, [me.id]);
  const flip = async (k: string) => {
    const next = { ...(n ?? {}), [k]: !(n ?? {})[k] };
    setN(next);
    try { await saveNotify(me.id, next); setMsg(''); } catch { setMsg('Нет связи: настройка сохранится, когда появится интернет.'); }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Уведомления</h2></div>
      {push}
      {ROWS.map(([k, title, sub]) => (
        <div className="row" key={k}>
          <span className="row-main"><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
          <button type="button" className="switch" role="switch" aria-checked={!!n?.[k]} aria-label={title} disabled={!n} onClick={() => flip(k)}><i /></button>
        </div>
      ))}
      {msg ? <p className="note" role="status">{msg}</p> : null}
    </section>
  );
}
