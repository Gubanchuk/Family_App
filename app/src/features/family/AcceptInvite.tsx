import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { acceptInvite, inviteInfo, MEMBER_COLORS, type InviteInfo } from './api';
import { familyErrorText } from './invite';
import ColorPicker from './ColorPicker';
import { firstFreeColor } from './colors';

const ROLE_TEXT = {
  child: 'Вы будете ребёнком: предлагаете меню, голосуете и отмечаете покупки.',
  parent: 'Вы будете родителем: утверждаете меню и видите траты.',
} as const;
const names = (m: InviteInfo['members']) => m.map((x) => x.name).join(', ');

export default function AcceptInvite({ code, onDone, suggestedName = '' }: { code: string; onDone: () => void | Promise<void>; suggestedName?: string }) {
  const [name, setName] = useState(suggestedName);
  const [color, setColor] = useState(MEMBER_COLORS[2]);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [dead, setDead] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    inviteInfo(code).then((r) => {
      if (!live || !r) return;
      if ('error' in r) { setDead(familyErrorText(r.error)); return; }
      setInfo(r);
      setColor((c) => (r.members.some((m) => m.color.toLowerCase() === c.toLowerCase()) ? firstFreeColor(r.members) : c));
    });
    return () => { live = false; };
  }, [code]);
  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await acceptInvite(code, name.trim(), color);
      navigate('/', { replace: true });
      // The stored code keeps this screen up until the family loads, so «Создать семью» never flashes.
      await onDone();
      try { sessionStorage.removeItem('fa.invite'); } catch { /* storage unavailable */ }
    } catch (err) { setError(familyErrorText((err as Error).message)); setBusy(false); }
  };
  const title = info ? `Вас зовут в семью «${info.family}»` : 'Вас пригласили в семью';
  const sub = info ? [info.members.length ? `Там уже: ${names(info.members)}.` : '', ROLE_TEXT[info.role]].filter(Boolean).join(' ') : 'Осталось представиться и выбрать цвет.';
  if (dead) {
    return (
      <main className="screen">
        <header className="k-head"><div><h1>Приглашение не работает</h1></div></header>
        <section className="card"><p className="form-error" role="alert" style={{ margin: 0 }}>{dead}</p></section>
      </main>
    );
  }
  // An invite made for an existing profile (a toddler who grew up) keeps that profile's name and colour.
  const forProfile = info?.profile;
  return (
    <main className="screen">
      <header className="k-head"><div><h1>{title}</h1><p>{sub}</p></div></header>
      <form className="card" onSubmit={join}>
        {forProfile ? <p className="note" style={{ marginTop: 0 }}>Вы войдёте в профиль «{forProfile}».</p> : (
          <>
            <label className="field">Как вас называть<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Например, Сын" autoComplete="given-name" autoFocus enterKeyHint="done" /></label>
            <ColorPicker value={color} onChange={setColor} letter={name.trim().slice(0, 1).toUpperCase()} taken={info?.members} />
          </>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="btns fill" style={{ marginTop: 12 }}><button type="submit" className="btn" disabled={(!forProfile && !name.trim()) || busy}>Вступить в семью</button></div>
      </form>
    </main>
  );
}
