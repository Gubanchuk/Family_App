import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../shell/Icon';

// Home's way in: one field to ask right here; the conversation and its suggested questions open on their own screen.
export default function AskCard() {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  // The question rides in the router's state, not the address: it never lands in the browser's history as text.
  const ask = (q: string) => { if (q.trim()) navigate('/assistant?from=home', { state: { q: q.trim() } }); };
  return (
    <section className="card ask-card" aria-label="Помощник">
      <form className="ask-row" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <Icon name="spark" />
        <label className="vh" htmlFor="ask-home">Спросить помощника</label>
        <input id="ask-home" value={text} onChange={(e) => setText(e.target.value)} placeholder="Спросить помощника" maxLength={500} enterKeyHint="send" autoComplete="off" />
        <button type="submit" className="round-btn ask-send" aria-label="Отправить" disabled={!text.trim()}><Icon name="send" /></button>
      </form>
    </section>
  );
}
