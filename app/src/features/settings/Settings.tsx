import { useEffect, useState } from 'react';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import ThemePicker from './ThemePicker';
import SyncStatus from './SyncStatus';
import FoodCard from './FoodCard';
import NotifyCard from './NotifyCard';
import { pushIsOn, pushSupport, subscribePush, unsubscribePush } from '../../lib/push';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';
import { setThemeChoice } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Member } from '../family/useFamily';
import { addProfileWithoutSignIn, createInvite, MEMBER_COLORS, setRole } from '../family/api';
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

  const invite = async (role: 'parent' | 'child') => {
    try {
      const code = await createInvite(me.household_id, role);
      const url = inviteUrl(location.origin, code);
      await navigator.clipboard.writeText(url).then(
        () => setMsg(`Ссылка скопирована: ${url}. Отправьте её в мессенджере, она действует 7 дней.`),
        () => setMsg(`Ссылка: ${url}. Скопируйте и отправьте, она действует 7 дней.`),
      );
    } catch (e) { setMsg(familyErrorText((e as Error).message)); }
  };
  const switchRole = async (m: Member) => {
    try { await setRole(m, m.role === 'parent' ? 'child' : 'parent'); reload(); }
    catch (e) { setMsg(familyErrorText((e as Error).message)); }
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
              {me.is_owner && !m.is_owner && m.user_id ? (
                <button type="button" className="more" aria-label={`${m.name}: сделать ${m.role === 'parent' ? 'ребёнком' : 'родителем'}`} onClick={() => switchRole(m)}>
                  {m.role === 'parent' ? 'Сделать ребёнком' : 'Сделать родителем'}
                </button>
              ) : null}
            </div>
          ))}
          {me.is_owner ? (
            <button type="button" className="row set-row add-row" onClick={() => invite('parent')}><span className="row-main"><b>Пригласить родителя</b><small>сможет утверждать меню и видеть траты, ссылка на 7 дней</small></span></button>
          ) : null}
          <button type="button" className="row set-row add-row" onClick={() => invite('child')}><span className="row-main"><b>Пригласить ребёнка</b><small>свой вход, предлагает и голосует, ссылка на 7 дней</small></span></button>
          {members.some((m) => !m.user_id && m.portion < 1) ? null : (
            <button type="button" className="row set-row add-row" onClick={addToddler}><span className="row-main"><b>Добавить малыша без входа</b><small>его рацион ведут родители</small></span></button>
          )}
        </section>
      ) : null}
      <FoodCard me={me} />
      <NotifyCard me={me} push={<PushRow me={me} />} />
      <SyncStatus />
      <section className="card">
        <div className="card-h"><h2>Вход</h2></div>
        <button type="button" className="btn danger" onClick={() => supabase.auth.signOut()}><Icon name="logout" />Выйти</button>
      </section>
      {msg ? <p className="note" role="status" style={{ margin: '0 16px 16px' }}>{msg}</p> : null}
    </>
  );
}

function PushRow({ me }: { me: Member }) {
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { pushIsOn().then(setOn).catch(() => setOn(false)); }, []);
  if (support !== 'ok') {
    return <div className="row"><span className="row-main"><b>Пуши на этом телефоне</b><small>{support === 'install-first' ? 'Сначала установите приложение на экран «Домой»' : 'Этот браузер не умеет пуши'}</small></span></div>;
  }
  const flip = async () => {
    try {
      if (on) { await unsubscribePush(); setOn(false); return; }
      const r = await subscribePush(me);
      setOn(r === 'on');
      setMsg(r === 'denied' ? 'Уведомления запрещены в настройках телефона.' : '');
    } catch { setMsg('Не получилось включить. Проверьте интернет.'); }
  };
  return (
    <>
      <div className="row"><span className="row-main"><b>Пуши на этом телефоне</b><small>важное дублируется в приложении</small></span>
        <button type="button" className="switch" role="switch" aria-checked={on} aria-label="Пуши на этом телефоне" onClick={flip}><i /></button></div>
      {msg ? <p className="note" role="status">{msg}</p> : null}
    </>
  );
}
