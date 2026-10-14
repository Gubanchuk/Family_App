import Icon from '../shell/Icon';
import { useSync } from '../../data/SyncProvider';

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export function syncLine(s: { offline: boolean; pending: number; syncedAt: string | null }, now: Date): string {
  if (s.pending > 0) {
    const what = `${s.pending} ${plural(s.pending, 'изменение ждёт', 'изменения ждут', 'изменений ждут')} отправки`;
    return s.offline ? `нет сети · ${what}` : what;
  }
  if (!s.syncedAt) return s.offline ? 'нет сети · данные на телефоне' : 'ещё не сохраняли';
  const t = new Date(s.syncedAt);
  const sameDay = t.toDateString() === now.toDateString();
  const time = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  return `всё сохранено · ${sameDay ? time : `${pad(t.getDate())}.${pad(t.getMonth() + 1)} в ${time}`}`;
}

export default function SyncStatus() {
  const s = useSync();
  return (
    <section className="card">
      <div className="card-h"><h2>Приложение</h2></div>
      <div className="row">
        <span className="row-main"><b>Работает без интернета</b><small>{syncLine(s, new Date())}</small></span>
        {s.pending === 0 && !s.offline ? <Icon name="check" className="ok" /> : null}
      </div>
      {s.message ? <p className="form-error" role="alert">{s.message}</p> : null}
      <button type="button" className="row set-row" onClick={() => s.syncNow()} disabled={s.syncing}>
        <span className="row-main"><b>{s.syncing ? 'Сохраняем…' : 'Сохранить сейчас'}</b></span>
      </button>
    </section>
  );
}
