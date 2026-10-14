import { useState, type FormEvent } from 'react';
import { createHousehold, MEMBER_COLORS } from './api';
import { familyErrorText } from './invite';
import ColorPicker from './ColorPicker';

export default function Onboarding({ onDone, suggestedName = '' }: { onDone: () => void; suggestedName?: string }) {
  const [name, setName] = useState(suggestedName);
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [family, setFamily] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await createHousehold(family.trim() || 'Наша семья', name.trim(), color); onDone(); } catch (err) { setError(familyErrorText((err as Error).message)); }
    setBusy(false);
  };
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Создать семью</h1><p>Потом позовёте остальных ссылкой</p></div></header>
      <form className="card" onSubmit={create}>
        <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Мама" autoComplete="given-name" autoFocus enterKeyHint="next" /></label>
        <ColorPicker value={color} onChange={setColor} letter={name.trim().slice(0, 1).toUpperCase()} />
        <label className="field">Название семьи<input value={family} onChange={(e) => setFamily(e.target.value)} maxLength={40} placeholder="Например, Губанчуки" enterKeyHint="done" /></label>
        <p className="note">Его увидят те, кого вы пригласите.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="submit" className="btn" disabled={!name.trim() || busy}>Создать семью</button></div>
        <p className="note">Если вас пригласили, откройте ссылку из приглашения.</p>
      </form>
    </main>
  );
}
