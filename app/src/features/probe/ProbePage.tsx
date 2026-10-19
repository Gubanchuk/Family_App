import { useEffect, useState } from 'react';
import { API_URL, SUPABASE_KEY, SUPABASE_URL, supabase } from '../../lib/supabase';
import { checkAuth, checkGoogle, checkRealtime, checkRest, formatReport, type CheckResult } from './checks';

export default function ProbePage() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    // Both roads to the base: straight to supabase.co and through this site's /sb/, which the app uses.
    const site = `${location.origin}/sb`;
    Promise.all([
      checkRest(SUPABASE_URL, SUPABASE_KEY, fetch, 14_000, { id: 'rest', title: 'База напрямую, ответ 64 КБ' }),
      checkRest(site, SUPABASE_KEY, fetch, 14_000, { id: 'rest-site', title: 'База через сайт, ответ 64 КБ' }),
      checkAuth(API_URL, SUPABASE_KEY), checkGoogle(), checkRealtime(supabase),
    ]).then(setResults);
  }, []);
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection;
  const report = results ? formatReport(results, {
    ua: navigator.userAgent, net: conn ? `${conn.type ?? ''} ${conn.effectiveType ?? ''}`.trim() : 'неизвестно',
    host: location.host, at: new Date().toLocaleString('ru-RU'),
  }) : '';
  const copy = () => navigator.clipboard.writeText(report).then(() => setCopied('Скопировано. Вставьте в чат.'), () => setCopied('Не получилось скопировать: выделите текст ниже вручную.'));
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Проверка доступа</h1><p>Откройте дважды: на мобильном интернете и на Wi-Fi.</p></div></header>
      <section className="card">
        {!results ? <p className="note">Проверяем, до 15 секунд…</p> : results.map((r) => (
          <div className="row" key={r.id}>
            <span className="row-main"><b>{r.ok ? '✓' : '✗'} {r.title}</b><small>{r.ms} мс · {r.detail}</small></span>
          </div>
        ))}
      </section>
      {results ? <div className="btns fill" style={{ margin: '0 16px 12px' }}><button type="button" className="btn" onClick={copy}>Скопировать результат</button></div> : null}
      {copied ? <p className="note" style={{ margin: '0 16px' }} role="status">{copied}</p> : null}
      {results ? <pre className="note" style={{ margin: '12px 16px', whiteSpace: 'pre-wrap' }}>{report}</pre> : null}
    </main>
  );
}
