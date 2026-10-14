import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { authErrorText } from './errors';
import { googleEnabled } from './providers';
import { inviteInfo, type InviteInfo } from '../family/api';
import { familyErrorText } from '../family/invite';

type AuthClient = Pick<SupabaseClient, 'auth'>;

type Lookup = (code: string) => Promise<InviteInfo | { error: string } | null>;

export default function SignIn({ client = supabase, googleReady = googleEnabled, invite = null, lookup = inviteInfo }: { client?: AuthClient; googleReady?: () => Promise<boolean | null>; invite?: string | null; lookup?: Lookup }) {
  // Someone who came by an invite most likely has no login yet.
  const [mode, setMode] = useState<'in' | 'up'>(invite ? 'up' : 'in');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [dead, setDead] = useState('');
  useEffect(() => {
    if (!invite) return;
    let live = true;
    lookup(invite).then((r) => {
      if (!live || !r) return;
      if ('error' in r) setDead(familyErrorText(r.error)); else setInfo(r);
    });
    return () => { live = false; };
  }, [invite, lookup]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNote('');
    const r = mode === 'in'
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/` } });
    setBusy(false);
    if (r.error) setError(authErrorText(r.error));
    // With email confirmation on, sign-up returns no session until the link in the letter is opened.
    else if (mode === 'up' && !r.data?.session) setNote(`Мы отправили письмо на ${email}. Откройте ссылку из письма — после неё вход откроется сам.`);
  };
  const google = async () => {
    setError('');
    if ((await googleReady()) === false) { setError('Вход через Google ещё не включён. Войдите по почте.'); return; }
    const r = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/` } });
    if (r.error) setError(authErrorText(r.error));
  };

  return (
    <main className="screen">
      <header className="k-head"><div>
        <h1>{invite ? (info ? `Вас зовут в семью «${info.family}»` : 'Вас пригласили в семью') : 'Семейный помощник'}</h1>
        <p>{invite ? 'Войдите или создайте вход — и сразу попадёте в семью.' : 'Вход для своих'}</p>
      </div></header>
      {dead ? <section className="notice" role="alert"><span className="row-main"><b>{dead}</b></span></section> : null}
      <section className="card">
        <button type="button" className="btn" style={{ width: '100%' }} onClick={google}>Войти через Google</button>
        <p className="note">Если Google не открывается, войдите по почте.</p>
      </section>
      <form className="card" onSubmit={submit}>
        <div className="card-h"><h2>{mode === 'in' ? 'Вход по почте' : 'Новый вход по почте'}</h2></div>
        <label className="field">Почта<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Пароль<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={mode === 'up' ? 'pw-hint' : undefined} /></label>
        {mode === 'up' ? <p className="note" id="pw-hint" style={{ marginTop: -4 }}>Не меньше 8 символов.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {note ? <p className="note" role="status">{note}</p> : null}
        <div className="btns fill">
          <button type="submit" className="btn" disabled={busy}>{mode === 'in' ? 'Войти' : 'Создать вход'}</button>
        </div>
        <button type="button" className="more" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Первый раз? Создать вход по почте' : 'Уже есть вход? Войти'}
        </button>
      </form>
    </main>
  );
}
