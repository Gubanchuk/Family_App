import { useEffect, useId, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { authErrorText } from './errors';
import { googleEnabled } from './providers';
import { inviteInfo, type InviteInfo } from '../family/api';
import { familyErrorText } from '../family/invite';

type AuthClient = Pick<SupabaseClient, 'auth'>;

type Lookup = (code: string) => Promise<InviteInfo | { error: string } | null>;

// Google's four-colour mark, unchanged, as its branding rules require.
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// One card for signing in and signing up, the way most apps do it: Google first, then email.
// Switching to a new login is a link under the form, not a second screen.
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
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pwId = useId();

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
  const switchMode = () => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setNote(''); };

  return (
    <main className="screen">
      <header className="k-head"><div>
        <h1>{invite ? (info ? `Вас зовут в семью «${info.family}»` : 'Вас пригласили в семью') : 'Семейный помощник'}</h1>
        <p>{invite ? 'Войдите или создайте вход — и сразу попадёте в семью.' : 'Меню, покупки и дела семьи в одном месте'}</p>
      </div></header>
      {dead ? <section className="notice" role="alert"><span className="row-main"><b>{dead}</b></span></section> : null}
      <section className="card auth">
        <button type="button" className="g-btn" onClick={google}><GoogleMark />Продолжить через Google</button>
        <p className="or">или по почте</p>
        <form onSubmit={submit}>
          <label className="field">Почта<input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="field">
            <label htmlFor={pwId}>{mode === 'in' ? 'Пароль' : 'Придумайте пароль'}</label>
            <span className="pw">
              <input id={pwId} type={show ? 'text' : 'password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password}
                onChange={(e) => setPassword(e.target.value)} aria-describedby={mode === 'up' ? 'pw-hint' : undefined} />
              <button type="button" className="pw-eye" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Скрыть' : 'Показать'}</button>
            </span>
          </div>
          {mode === 'up' ? <p className="note" id="pw-hint" style={{ marginTop: -4 }}>Не меньше 8 символов.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {note ? <p className="note" role="status">{note}</p> : null}
          <button type="submit" className="btn auth-submit" disabled={busy}>{mode === 'in' ? 'Войти' : 'Создать вход'}</button>
        </form>
        <p className="auth-switch">
          {mode === 'in' ? 'Нет входа по почте?' : 'Уже есть вход?'}
          <button type="button" className="more" onClick={switchMode}>{mode === 'in' ? 'Создать' : 'Войти'}</button>
        </p>
      </section>
      <p className="note" style={{ margin: '0 32px 24px', textAlign: 'center' }}>Если Google не открывается, войдите по почте.</p>
    </main>
  );
}
