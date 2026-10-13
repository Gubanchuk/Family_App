import { useEffect, useState } from 'react';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import ThemePicker from './ThemePicker';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';
import { setThemeChoice } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Member } from '../family/useFamily';
import { addProfileWithoutSignIn, createInvite, MEMBER_COLORS } from '../family/api';
import { familyErrorText, inviteUrl } from '../family/invite';

const roleText = (m: Member) => (m.role === 'parent'
  ? `Родитель${m.is_owner ? ' · владелец семьи' : ''}`
  : m.user_id ? 'Ребёнок · свой вход' : 'Ребёнок · без входа, ведут родители');

export default function Settings({ me, members, reload }: { me: Member; members: Member[]; reload: () => void }) {
  const [msg, setMsg] = useState('');
  const parent = me.role === 'parent';
  useEffect(() => {
    // A choice made on this phone wins over the one stored for the member.
    let mine: string | null = null;
    try { mine = localStorage.getItem('fa.theme'); } catch { /* storage unavailable */ }
    if (!mine) loadThemeChoice(me.id).then((t) => { if (t) setThemeChoice(t); });
  }, [me.id]);

  const invite = async () => {
    try {
      const code = await createInvite(me.household_id, 'child');
      const url = inviteUrl(location.origin, code);
      await navigator.clipboard.writeText(url).then(
        () => setMsg(`Ссылка скопирована: ${url}. Отправьте её в мессенджере, она действует 7 дней.`),
        () => setMsg(`Ссылка: ${url}. Скопируйте и отправьте, она действует 7 дней.`),
      );
    } catch (e) { setMsg(familyErrorText((e as Error).message)); }
  };
  const addToddler = async () => {
    try { await addProfileWithoutSignIn(me.household_id, 'Дима', MEMBER_COLORS[3], 0.5); reload(); setMsg('Профиль без входа добавлен.'); }
    catch (e) { setMsg(familyErrorText((e as Error).message)); }
  };

  return (
    <>
      <Header title="Настройки" back />
      <section className="card profile">
        <span className="av lg" style={{ ['--c' as string]: me.color }} aria-hidden="true">{me.name.slice(0, 1)}</span>
        <span className="row-main"><b>{me.name}</b><small>{roleText(me)}</small></span>
      </section>
      <ThemePicker onPick={(c) => { saveThemeChoice(me.id, c); }} />
      {parent ? (
        <section className="card">
          <div className="card-h"><h2>Семья</h2></div>
          {members.map((m) => (
            <div className="row" key={m.id}>
              <span className="av sm" style={{ ['--c' as string]: m.color }} aria-hidden="true">{m.name.slice(0, 1)}</span>
              <span className="row-main"><b>{m.name}</b><small>{roleText(m)}</small></span>
            </div>
          ))}
          <button type="button" className="row set-row add-row" onClick={invite}><span className="row-main"><b>Пригласить в семью</b><small>ссылка для входа, 7 дней</small></span></button>
          {members.some((m) => !m.user_id && m.portion < 1) ? null : (
            <button type="button" className="row set-row add-row" onClick={addToddler}><span className="row-main"><b>Добавить малыша без входа</b><small>его рацион ведут родители</small></span></button>
          )}
        </section>
      ) : null}
      <section className="card">
        <div className="card-h"><h2>Вход</h2></div>
        <button type="button" className="btn danger" onClick={() => supabase.auth.signOut()}><Icon name="logout" />Выйти</button>
      </section>
      {msg ? <p className="note" role="status" style={{ margin: '0 16px 16px' }}>{msg}</p> : null}
    </>
  );
}
