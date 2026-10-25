import { useState, type FormEvent } from 'react';
import { parseRub, twinOf, type Twin } from './boardMath';
import TwinNote from './TwinNote';
import Sheet from '../menu/Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { useToast } from '../shell/toastContext';
import { rub } from '../shop/build';
import { putIn, removeGoal, saveGoal, takeBack, toggleStep } from './boardActions';
import type { Deposit, Goal, GoalStep } from './types';
import DepositHistory from './DepositHistory';
import PhotoField, { Photo } from '../shell/PhotoField';
import { useFeature } from '../../data/useFeature';
// The old photo is not removed here: the change may wait offline, and other phones still show the old
// file until it arrives. A replaced photo stays in storage.
import { photoPathFor, type PhotoEdit } from '../../lib/photos';

const sid = () => Math.random().toString(36).slice(2, 8);

export default function GoalSheet({ me, members, db, goal, deposits = [], banked, ready = false, twins = [], onOpenTwin, onClose }: {
  me: Member; members: Member[]; db: LocalDb; goal: Goal | null; deposits?: Deposit[]; banked?: number; ready?: boolean;
  twins?: Twin[]; onOpenTwin?: (id: string) => void; onClose: () => void;
}) {
  const toast = useToast();
  const parent = me.role === 'parent';
  const canEdit = !goal || parent || goal.owner_id === me.id;
  const [editing, setEditing] = useState(!goal);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [owner, setOwner] = useState<string | null>(goal ? goal.owner_id : parent ? null : me.id);
  const twin = twinOf(title, owner, twins);
  const [steps, setSteps] = useState<GoalStep[]>(goal?.steps ?? []);
  const [step, setStep] = useState('');
  const [sum, setSum] = useState('');
  const hasPhotos = useFeature(db, 'photos');
  const [id] = useState(() => goal?.id ?? crypto.randomUUID());
  const [photo, setPhoto] = useState<PhotoEdit>({ kind: 'keep' });
  const [busy, setBusy] = useState(false);
  if (goal && !editing) {
    return (
      <Sheet title={goal.title} sub={`${rub(banked ?? goal.saved)} из ${rub(goal.target)}`} onClose={onClose}
        actions={canEdit ? <button type="button" className="btn soft" onClick={() => setEditing(true)}>Изменить цель</button> : undefined}>
        <Photo path={goal.photo_path} className="sheet-photo" />
        {twin ? <div style={{ margin: '0 16px 12px' }}><TwinNote twin={twin} kind="wish" me={me} members={members} onOpen={onOpenTwin} /></div> : null}
        <div style={{ margin: '0 16px' }}>
          {goal.steps.map((s) => (
            <label className="row step" key={s.id}>
              <input type="checkbox" checked={s.done} disabled={!canEdit} onChange={() => toggleStep(db, goal, s.id)} />
              <span className="row-main"><b>{s.t}</b></span>
            </label>
          ))}
          {ready || canEdit ? (
            <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); const n = parseRub(sum); if (!n) return; await putIn(db, me, { goal }, n, ready); setSum(''); toast({ text: `В копилку +${rub(n)}` }); }}>
              <label className="field">Положить в копилку, ₽<input inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="5000" /></label>
              <button type="submit" className="btn soft" disabled={!parseRub(sum)}>Положить</button>
            </form>
          ) : null}
          <DepositHistory me={me} members={members} deposits={deposits} onTakeBack={async (d) => { await takeBack(db, d); toast({ text: `Взнос ${rub(d.amount)} убран` }); }} />
        </div>
      </Sheet>
    );
  }
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const t = parseRub(target);
    if (!t || busy) return;
    setBusy(true);
    let photo_path: string | null | undefined;
    try { photo_path = hasPhotos ? await photoPathFor(me.household_id, 'goals', id, photo) : undefined; } catch {
      toast({ text: 'Не получилось загрузить фото: нужен интернет. Попробуйте ещё раз.' });
      setBusy(false);
      return;
    }
    await saveGoal(db, me, { id, owner_id: owner, title, target: t, steps, photo_path }, goal ?? undefined);
    toast({ text: goal ? 'Цель сохранена' : `Цель «${title.trim()}» на доске` });
    onClose();
  };
  return (
    <Sheet title={goal ? 'Изменить цель' : 'Новая цель'} onClose={onClose} keepOnBackdrop={!!title.trim()}
      actions={<button type="submit" form="goal-form" className="btn" disabled={!title.trim() || !parseRub(target) || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
      <form id="goal-form" style={{ margin: '0 16px' }} onSubmit={save}>
        <label className="field">Цель<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus={!goal} placeholder="Например, море летом" /></label>
        {twin ? <TwinNote twin={twin} kind="wish" me={me} members={members} onOpen={onOpenTwin} /> : null}
        <label className="field">Сколько нужно, ₽<input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="120000" /></label>
        {hasPhotos ? <PhotoField path={goal?.photo_path} value={photo} onChange={setPhoto} /> : null}
        <fieldset className="kin-pick">
          <legend>Чья</legend>
          <div className="picks">
            {parent ? <button type="button" className="pick" aria-pressed={owner === null} onClick={() => setOwner(null)}>Семейная</button> : null}
            {(parent ? members : [me]).map((m) => <button key={m.id} type="button" className="pick" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>{m.id === me.id ? 'Моя' : m.name}</button>)}
          </div>
        </fieldset>
        <p className="field" style={{ marginBottom: 4 }}>Шаги</p>
        {steps.map((s) => (
          <div className="row" key={s.id}><span className="row-main"><b>{s.t}</b></span><button type="button" className="more" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}>Убрать</button></div>
        ))}
        <div className="inline-add">
          <label className="field">Новый шаг<input value={step} onChange={(e) => setStep(e.target.value)} maxLength={60} placeholder="Например, выбрать место"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (step.trim()) { setSteps([...steps, { id: sid(), t: step.trim(), done: false }]); setStep(''); } } }} /></label>
          <button type="button" className="btn soft" disabled={!step.trim()} onClick={() => { setSteps([...steps, { id: sid(), t: step.trim(), done: false }]); setStep(''); }}>Добавить</button>
        </div>
        {goal && canEdit ? <button type="button" className="more" onClick={async () => { await removeGoal(db, goal); toast({ text: 'Цель удалена' }); onClose(); }}>Удалить цель</button> : null}
      </form>
    </Sheet>
  );
}
