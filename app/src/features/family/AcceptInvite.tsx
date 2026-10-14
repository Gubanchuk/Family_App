import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptInvite, MEMBER_COLORS } from './api';
import { familyErrorText } from './invite';

export default function AcceptInvite({ code, onDone }: { code: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(MEMBER_COLORS[2]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const join = async () => {
    try {
      await acceptInvite(code, name.trim(), color);
      try { sessionStorage.removeItem('fa.invite'); } catch { /* storage unavailable */ }
      navigate('/', { replace: true });
      onDone();
    } catch (e) { setError(familyErrorText((e as Error).message)); }
  };
  return (
    <main className="screen">
      <header className="k-head"><div><h1>Вас пригласили в семью</h1><p>Код {code}</p></div></header>
      <section className="card">
        <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Сын" /></label>
        <div className="btns" role="group" aria-label="Цвет">
          {MEMBER_COLORS.map((c) => <button key={c} type="button" className="av" style={{ ['--c' as string]: c }} aria-pressed={c === color} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} />)}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={join} disabled={!name.trim()}>Вступить</button></div>
      </section>
    </main>
  );
}
