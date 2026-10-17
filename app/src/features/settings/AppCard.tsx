import { useEffect, useRef, useState } from 'react';
import { BUILD, checkForUpdate, resetAppCache } from '../../lib/appVersion';
import { userBusy } from '../../lib/appUpdate';

const SAID = {
  checking: 'Проверяем…',
  latest: 'Это последняя версия.',
  none: 'Этот браузер не хранит копию приложения: обновите страницу.',
  failed: 'Не получилось проверить. Проверьте интернет.',
  ready: 'Новая версия загружена: она откроется, когда вы закончите и обновите страницу.',
  offline: 'Нет интернета: без него приложение после сброса не откроется. Сбросьте, когда появится сеть.',
} as const;

// Which version this phone runs, a manual check for a newer one, and a way out when an update is stuck.
export default function AppCard({ reload = () => location.reload(), check = checkForUpdate, reset = resetAppCache }: {
  reload?: () => void; check?: typeof checkForUpdate; reset?: typeof resetAppCache;
}) {
  const [state, setState] = useState<keyof typeof SAID | null>(null);
  // The check can take 20 seconds; by then the person may have left this card or started typing elsewhere.
  const here = useRef(true);
  useEffect(() => () => { here.current = false; }, []);
  const run = async () => {
    setState('checking');
    try {
      const r = await check();
      if (r !== 'updated') { if (here.current) setState(r); return; }
      if (here.current && !userBusy()) reload(); else if (here.current) setState('ready');
    } catch {
      if (here.current) setState('failed');
    }
  };
  const resetNow = async () => {
    if (!navigator.onLine) { setState('offline'); return; }
    await reset().catch(() => {});
    reload();
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Приложение</h2><span className="note" style={{ margin: 0 }}>версия {BUILD}</span></div>
      <div className="btns fill">
        <button type="button" className="btn soft" disabled={state === 'checking'} onClick={run}>Проверить обновление</button>
      </div>
      {state ? <p className="note" role="status">{SAID[state]}</p> : null}
      <button type="button" className="more" style={{ marginTop: 8 }} onClick={resetNow}>Сбросить и загрузить заново</button>
      <p className="note" style={{ margin: '4px 0 0' }}>Если обновление не приходит. Семья, вход и данные останутся.</p>
    </section>
  );
}
