import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Icon from '../shell/Icon';
import Sheet from '../menu/Sheet';
import { localDb, type LocalDb } from '../../data/db';
import { writeLocal } from '../../data/sync';
import type { Member } from '../family/useFamily';
import { getMealTimes, setMealTimes } from '../../lib/mealTimes';
import { MEAL_LABEL, MEALS, type Meal } from '../menu/week';
import { saveMealTimes } from './memberSettings';

export default function FoodCard({ me, db = localDb }: { me: Member; db?: LocalDb }) {
  const list = useLiveQuery(async () => (await db.not_eat.where('household_id').equals(me.household_id).toArray()).filter((x) => !x.deleted_at), [db, me.household_id]) ?? [];
  const [sheet, setSheet] = useState<'not-eat' | 'times' | null>(null);
  const [ref, setRef] = useState('');
  const [times, setTimes] = useState(getMealTimes());
  const parent = me.role === 'parent';
  const add = async () => { await writeLocal(db, 'not_eat', [{ household_id: me.household_id, kind: 'item', ref: ref.trim().toLowerCase(), deleted_at: null }]); setRef(''); };
  const remove = (r: string) => writeLocal(db, 'not_eat', [{ household_id: me.household_id, kind: 'item', ref: r, deleted_at: new Date().toISOString() }]);
  const saveTimes = async () => {
    setMealTimes(times);
    setSheet(null);
    try { await saveMealTimes(me.id, MEALS.map((m) => times[m])); } catch { /* kept on this phone; the server copy updates next time */ }
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Еда</h2></div>
      <button type="button" className="row set-row" onClick={() => setSheet('not-eat')}>
        <span className="row-main"><b>Не едим</b><small>{list.length ? list.map((x) => x.ref).join(', ') : 'ничего не убрано'}</small></span><Icon name="chev" className="chev" />
      </button>
      <button type="button" className="row set-row" onClick={() => setSheet('times')}>
        <span className="row-main"><b>Время еды</b><small>{MEALS.map((m) => times[m]).join(', ')}</small></span><Icon name="chev" className="chev" />
      </button>
      {sheet === 'not-eat' ? (
        <Sheet title="Не едим" sub="Блюда с этими продуктами не покажутся в «Что покушать», в поиске и в замене блюд." onClose={() => setSheet(null)}>
          <div style={{ margin: '0 16px 16px' }}>
            {list.map((x) => (
              <div className="row" key={x.ref}><span className="row-main"><b>{x.ref}</b></span>
                {parent ? <button type="button" className="round-btn" aria-label={`Убрать: ${x.ref}`} onClick={() => remove(x.ref)}><Icon name="x" /></button> : null}</div>
            ))}
            {parent ? (
              <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) add(); }}>
                <label className="field">Продукт или блюдо<input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} placeholder="Например, грибы" enterKeyHint="done" /></label>
                <button type="submit" className="btn soft" disabled={!ref.trim()}>Добавить</button>
              </form>
            ) : <p className="note">Список ведут родители.</p>}
          </div>
        </Sheet>
      ) : null}
      {sheet === 'times' ? (
        <Sheet title="Время еды" sub="По нему Главная показывает, что дальше." onClose={() => setSheet(null)} actions={<button type="button" className="btn" onClick={saveTimes}>Сохранить</button>}>
          <div style={{ display: 'grid', gap: 12, margin: '0 16px' }}>
            {MEALS.map((m: Meal) => <label className="field" key={m}>{MEAL_LABEL[m]}<input type="time" value={times[m]} onChange={(e) => setTimes({ ...times, [m]: e.target.value })} /></label>)}
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
