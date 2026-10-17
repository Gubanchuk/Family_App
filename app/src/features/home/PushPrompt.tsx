import { useState } from 'react';
import type { Member } from '../family/useFamily';
import { pushSupport, subscribePush } from '../../lib/push';

const LATER = 'fa.push-later';
const askable = () => pushSupport() === 'ok' && Notification.permission === 'default';

// Pushes need one tap on each phone; a switch deep in Settings was easy to miss, so Home asks once.
export default function PushPrompt({ me, subscribe = subscribePush }: { me: Member; subscribe?: typeof subscribePush }) {
  const [shown, setShown] = useState(() => { try { return askable() && !localStorage.getItem(LATER); } catch { return askable(); } });
  const [msg, setMsg] = useState('');
  if (!shown) return null;
  const later = () => { try { localStorage.setItem(LATER, '1'); } catch { /* storage unavailable */ } setShown(false); };
  const on = async () => {
    try {
      const r = await subscribe(me);
      if (r === 'on') setShown(false); else setMsg('Уведомления запрещены. Их можно разрешить в настройках телефона для этого приложения.');
    } catch { setMsg('Не получилось включить. Проверьте интернет и попробуйте ещё раз.'); }
  };
  return (
    <section className="notice stack" aria-label="Уведомления">
      <span className="row-main"><b>Включите уведомления</b><small>{msg || 'Просьбы, предложения блюд и платежи придут сразу.'}</small></span>
      <span className="btns">
        <button type="button" className="btn sm" onClick={on}>Включить</button>
        <button type="button" className="more" onClick={later}>Не сейчас</button>
      </span>
    </section>
  );
}
