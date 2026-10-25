import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../shell/Icon';
import { suggestionsFor } from './suggestions';

// Home's way in: ask right here, or tap a question; the conversation opens on its own screen.
export default function AskCard({ role }: { role: 'parent' | 'child' }) {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  // The question rides in the router's state, not the address: it never lands in the browser's history as text.
  const ask = (q: string) => { if (q.trim()) navigate('/assistant?from=home', { state: { q: q.trim() } }); };
  return (
    <section className="card ask-card" aria-label="Помощник">
      <div className="ask-card-h"><Icon name="spark" /><h2>Помощник</h2><span className="note">знает наше меню, покупки и дела</span></div>
      <form className="ask-row" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label className="vh" htmlFor="ask-home">Спросить помощника</label>
        <input id="ask-home" value={text} onChange={(e) => setText(e.target.value)} placeholder="Спросите или попросите" maxLength={500} enterKeyHint="send" autoComplete="off" />
        <button type="submit" className="round-btn ask-send" aria-label="Отправить" disabled={!text.trim()}><Icon name="send" /></button>
      </form>
      <div className="ask-sugs">
        {suggestionsFor('home', role).map((q) => <button key={q} type="button" className="pick ask-sug" onClick={() => ask(q)}>{q}</button>)}
      </div>
    </section>
  );
}
