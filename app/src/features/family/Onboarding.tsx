import { useState } from 'react';
import { createHousehold, MEMBER_COLORS } from './api';
import { familyErrorText } from './invite';

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [family, setFamily] = useState('Наша семья');
  const [name, setName] = useState('Папа');
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [error, setError] = useState('');
  const create = async () => {
    try { await createHousehold(family.trim(), name.trim(), color); onDone(); } catch (e) { setError(familyErrorText((e as Error).message)); }
  };
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Создать семью</h1><p>Остальных пригласите ссылкой из настроек</p></div></header>
      <section className="card">
        <label className="field">Как назвать семью<input value={family} onChange={(e) => setFamily(e.target.value)} maxLength={40} /></label>
        <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <p className="note">Цвет вашего кружка</p>
        <div className="btns" role="group" aria-label="Цвет">
          {MEMBER_COLORS.map((c) => <button key={c} type="button" className="av" style={{ ['--c' as string]: c }} aria-pressed={c === color} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} />)}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={create} disabled={!family.trim() || !name.trim()}>Создать семью</button></div>
        <p className="note">Если вас пригласили, откройте ссылку из приглашения.</p>
      </section>
    </main>
  );
}
