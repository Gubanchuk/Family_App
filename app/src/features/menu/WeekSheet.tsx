import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import type { LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { setWeekFromTemplate, voteWeek } from './weekActions';
import { weekLabel } from './week';
import { lineOf } from './SlotSheet';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function WeekSheet({ db, mode, me, data, onClose }: { db: LocalDb; mode: 'current' | 'next'; me: Member; data: NonNullable<ReturnType<typeof useMenu>>; onClose: () => void }) {
  const target = mode === 'current' ? data.current : data.next;
  // Until someone taps a template the default follows the data: templates may still be downloading when the sheet opens.
  const [picked, setPick] = useState<string>();
  const pick = picked ?? target.week?.template_id ?? data.templates[0]?.id;
  const slots = useLiveQuery(() => (pick ? db.template_slots.where('template_id').equals(pick).toArray() : []), [db, pick]) ?? [];
  const [confirm, setConfirm] = useState(false);
  const t = data.templates.find((x) => x.id === pick);
  const parent = me.role === 'parent';
  // An approved week is closed to children; a parent replaces it only after a second tap.
  const locked = target.week?.status === 'approved';
  const loaded = slots.length >= 28;
  const apply = async () => {
    if (!pick) return;
    if (locked && !confirm) { setConfirm(true); return; }
    const status = mode === 'current' || locked ? 'approved' : 'proposed';
    const w = await setWeekFromTemplate(db, { household: me.household_id, startsOn: target.start, template: pick, status, by: me.id, existing: target.week });
    if (status === 'proposed') await voteWeek(db, w, me, 'yes');
    onClose();
  };
  const label = locked ? (confirm ? 'Точно заменить? Замены блюд пропадут' : 'Заменить утверждённую неделю') : mode === 'current' ? `Поставить «${t?.name ?? ''}»` : `Предложить «${t?.name ?? ''}»`;
  return (
    <Sheet title={`Неделя на ${weekLabel(target.start)}`}
      sub={mode === 'current' ? 'Выберите шаблон: меню и список покупок соберутся заново.' : 'Выберите шаблон и предложите семье, родители утвердят.'}
      onClose={onClose}
      actions={locked && !parent ? undefined : <button type="button" className="btn" onClick={apply} disabled={!pick || !loaded}>{label}</button>}>
      {locked && !parent ? <p className="note" style={{ margin: '0 16px 12px' }}>Неделя утверждена. Поменять её могут родители.</p> : null}
      {pick && !loaded ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>Шаблон ещё не загрузился — нужен интернет.</p> : null}
      <div className="tpl-list" role="radiogroup" aria-label="Шаблоны недель">
        {data.templates.map((x) => (
          <button key={x.id} type="button" className="tpl" role="radio" aria-checked={x.id === pick} onClick={() => { setPick(x.id); setConfirm(false); }}>
            <span className="tpl-top"><b>{x.name}{x.household_id ? <span className="tpl-now">наш</span> : null}</b></span>
            <small>{x.note}</small>
          </button>
        ))}
      </div>
      {t ? <h3 className="sh-h">«{t.name}» по дням</h3> : null}
      <div className="day-preview">
        {DAY_SHORT.map((d, i) => {
          const dinner = slots.find((s) => s.day === i && s.meal === 'dinner');
          const lunch = slots.find((s) => s.day === i && s.meal === 'lunch');
          return <div className="row" key={d}><span className="tl-t">{d}</span><span className="row-main"><b>{lineOf(dinner, data.recipes)}</b><small>{lineOf(lunch, data.recipes)}</small></span></div>;
        })}
      </div>
    </Sheet>
  );
}
