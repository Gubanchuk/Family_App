import { useEffect, useState, type FormEvent } from 'react';
import Header from '../shell/Header';
import Icon from '../shell/Icon';
import ThemePicker from './ThemePicker';
import SyncStatus from './SyncStatus';
import { signOutHere } from './signOut';
import { localDb } from '../../data/db';
import FoodCard from './FoodCard';
import NotifyCard from './NotifyCard';
import { pushIsOn, pushSupport, subscribePush, unsubscribePush } from '../../lib/push';
import { loadThemeChoice, saveThemeChoice } from './syncTheme';
import { setThemeChoice } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Member } from '../family/useFamily';
import { addProfileWithoutSignIn, createInvite, householdName, setRole, updateMember, updateMyProfile } from '../family/api';
import ColorPicker from '../family/ColorPicker';
import AvatarFace from '../family/AvatarFace';
import KinPicker from '../family/KinPicker';
import { roleLine, type Kin } from '../family/kin';
import { firstFreeColor, memberColor } from '../family/colors';
import Sheet from '../menu/Sheet';
import { useToast } from '../shell/toastContext';
import { familyErrorText, inviteUrl } from '../family/invite';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const INVITE_DAYS = 7;
type Invite = { url: string; role: 'parent' | 'child'; until: Date };

export default function Settings({ me, members, reload }: { me: Member; members: Member[]; reload: () => void }) {
  const [msg, setMsg] = useState('');
  const toast = useToast();
  const parent = me.role === 'parent';
  const [family, setFamily] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'profile' | 'toddler' | Member | null>(null);
  useEffect(() => {
    // A choice made on this phone wins over the one stored for the member.
    let mine: string | null = null;
    try { mine = localStorage.getItem('fa.theme'); } catch { /* storage unavailable */ }
    if (!mine) loadThemeChoice(me.id).then((t) => { if (t) setThemeChoice(t); });
  }, [me.id]);
  useEffect(() => { householdName(me.household_id).then(setFamily).catch(() => {}); }, [me.household_id]);

  const [outWarn, setOutWarn] = useState(0);
  const signOut = async () => {
    const r = await signOutHere({ db: localDb, signOut: () => supabase.auth.signOut(), force: outWarn > 0 });
    if (!r.done) {
      setOutWarn(r.pending);
      setMsg(`На телефоне есть неотправленные изменения (${r.pending}). Подключитесь к интернету и подождите минуту — или нажмите «Выйти всё равно», тогда они пропадут.`);
    }
  };
  const [link, setLink] = useState<Invite | null>(null);
  const invite = async (role: 'parent' | 'child') => {
    try {
      setLink({ url: inviteUrl(location.origin, await createInvite(me.household_id, role)), role, until: new Date(Date.now() + INVITE_DAYS * 86400000) });
    } catch (e) { toast({ text: familyErrorText((e as Error).message) }); }
  };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); toast({ text: 'Ссылка скопирована. Отправьте её в мессенджере.' }); } catch { toast({ text: `Не получилось скопировать. Ссылка: ${link.url}` }); }
  };
  // Sharing and copying run in their own tap: Safari refuses both once a network request has passed.
  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Семейный помощник', text: `Приглашение в семью${family ? ` «${family}»` : ''} в «Семейном помощнике»`, url: link.url }); return; } catch { /* closed the menu: offer copying */ }
    }
    await copy();
  };
  const switchRole = async (m: Member) => {
    try { await setRole(m, m.role === 'parent' ? 'child' : 'parent'); reload(); }
    catch (e) { toast({ text: familyErrorText((e as Error).message) }); }
  };
  const others = members.filter((m) => m.id !== me.id);
  // The database lets parents edit everyone but the owner; the owner edits their own row in «Изменить».
  const editable = (m: Member) => parent && m.id !== me.id && !m.is_owner;

  return (
    <>
      <Header title="Настройки" back />
      <section className="card profile">
        <span className="av lg" style={{ ['--c' as string]: memberColor(me.color) }} aria-hidden="true"><AvatarFace member={me} /></span>
        <span className="row-main"><b>{me.name}</b><small>{roleLine(me)}</small></span>
        <button type="button" className="btn soft sm" onClick={() => setSheet('profile')}>Изменить</button>
      </section>
      <ThemePicker onPick={(c) => { saveThemeChoice(me.id, c); }} />
      {parent ? (
        <section className="card">
          <div className="card-h"><h2>{family ? `Семья «${family}»` : 'Семья'}</h2></div>
          {members.map((m) => (
            <div className="row member" key={m.id}>
              {editable(m) ? (
                <button type="button" className="row-btn" aria-label={`${m.name}, ${roleLine(m)}: изменить`} onClick={() => setSheet(m)}>
                  <span className="av sm" style={{ ['--c' as string]: memberColor(m.color) }} aria-hidden="true"><AvatarFace member={m} /></span>
                  <span className="row-main"><b>{m.name}</b><small>{roleLine(m)}</small></span>
                  <Icon name="chev" className="chev" />
                </button>
              ) : (
                <>
                  <span className="av sm" style={{ ['--c' as string]: memberColor(m.color) }} aria-hidden="true"><AvatarFace member={m} /></span>
                  <span className="row-main"><b>{m.name}</b><small>{roleLine(m)}</small></span>
                </>
              )}
              {me.is_owner && !m.is_owner && m.user_id ? (
                <button type="button" className="more" aria-label={`${m.name}: сделать ${m.role === 'parent' ? 'ребёнком' : 'родителем'}`} onClick={() => switchRole(m)}>
                  {m.role === 'parent' ? 'Сделать ребёнком' : 'Сделать родителем'}
                </button>
              ) : null}
            </div>
          ))}
          {me.is_owner ? (
            <button type="button" className="row set-row add-row" onClick={() => invite('parent')}><span className="row-main"><b>Пригласить родителя</b><small>сможет утверждать меню и видеть траты</small></span></button>
          ) : null}
          <button type="button" className="row set-row add-row" onClick={() => invite('child')}><span className="row-main"><b>Пригласить ребёнка</b><small>свой вход, предлагает и голосует</small></span></button>
          {link ? (
            <div className="invite-link">
              <span className="row-main"><b>Ссылка для {link.role === 'parent' ? 'родителя' : 'ребёнка'}</b><small>действует до {link.until.getDate()} {MONTHS[link.until.getMonth()]}, войти по ней можно один раз</small></span>
              <div className="btns fill">
                <button type="button" className="btn sm" onClick={share}>Отправить ссылку</button>
                <button type="button" className="btn soft sm" onClick={copy}>Скопировать</button>
              </div>
            </div>
          ) : null}
          {members.some((m) => !m.user_id && m.portion < 1) ? null : (
            <button type="button" className="row set-row add-row" onClick={() => setSheet('toddler')}><span className="row-main"><b>Добавить малыша без входа</b><small>его рацион ведут родители</small></span></button>
          )}
        </section>
      ) : null}
      <FoodCard me={me} />
      <NotifyCard me={me} push={<PushRow me={me} />} />
      <SyncStatus />
      <section className="card">
        <div className="card-h"><h2>Вход</h2></div>
        <button type="button" className="btn danger" onClick={signOut}><Icon name="logout" />{outWarn ? 'Выйти всё равно' : 'Выйти'}</button>
        {msg ? <p className="note" role="status">{msg}</p> : null}
      </section>
      {sheet === 'profile' ? (
        <PersonSheet title="Ваш профиль" name={me.name} color={me.color} kin={me.kin ?? null} role={me.role} taken={others} save="Сохранить" onClose={() => setSheet(null)}
          onSave={async (name, color, kin) => { await updateMyProfile(name, color, kin); reload(); toast({ text: 'Профиль сохранён' }); }} />
      ) : null}
      {sheet === 'toddler' ? (
        <PersonSheet title="Малыш без входа" sub="Ест то же, что все, порция — половина взрослой. Его рацион ведут родители." name="" color={firstFreeColor(members)} kin={null} role="child" kinLegend="Кто в семье" taken={members}
          placeholder="Например, Дима" save="Добавить в семью" onClose={() => setSheet(null)}
          onSave={async (name, color, kin) => { await addProfileWithoutSignIn(me.household_id, name.trim(), color, 0.5, kin); reload(); toast({ text: `${name.trim()} теперь в семье` }); }} />
      ) : null}
      {sheet && typeof sheet === 'object' ? (
        <PersonSheet title={sheet.name} name={sheet.name} color={sheet.color} kin={sheet.kin ?? null} role={sheet.role} kinLegend="Кто в семье" taken={members.filter((m) => m.id !== sheet.id)}
          save="Сохранить" onClose={() => setSheet(null)}
          onSave={async (name, color, kin) => { await updateMember(sheet, name, color, kin); reload(); toast({ text: `${name.trim()}: сохранено` }); }} />
      ) : null}
    </>
  );
}

// Name, place in the family and colour of a person: one's own profile, another member, or a toddler without a login.
function PersonSheet({ title, sub, name: start, color: startColor, kin: startKin, role, kinLegend, taken, placeholder, save, onSave, onClose }: {
  title: string; sub?: string; name: string; color: string; kin: Kin | null; role: Member['role']; kinLegend?: string; taken: Member[]; placeholder?: string; save: string;
  onSave: (name: string, color: string, kin: Kin | null) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(start);
  const [color, setColor] = useState(startColor);
  const [kin, setKin] = useState(startKin);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await onSave(name, color, kin); onClose(); } catch (err) { setError(familyErrorText((err as Error).message)); }
  };
  return (
    <Sheet title={title} sub={sub} onClose={onClose} keepOnBackdrop={name.trim() !== start.trim() || color !== startColor || kin !== startKin}
      actions={<button type="submit" form="person-form" className="btn" disabled={!name.trim() || !kin}>{save}</button>}>
      <form id="person-form" style={{ margin: '0 16px' }} onSubmit={submit}>
        <label className="field">Имя<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={placeholder} autoFocus={!start} enterKeyHint="done" /></label>
        <KinPicker value={kin} onChange={setKin} role={role} legend={kinLegend} />
        <ColorPicker value={color} onChange={setColor} letter={name.trim().slice(0, 1).toUpperCase()} taken={taken} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    </Sheet>
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
