import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import type { LocalDb, WeekTemplate } from '../../data/db';
import type { Member } from '../family/useFamily';
import type { useMenu } from './useMenu';
import { setWeekFromTemplate, voteWeek, weekListStats } from './weekActions';
import { products, weekLabel } from './week';
import { lineOf } from './SlotSheet';
import { templateCosts } from './templateCost';
import { rub } from '../shop/build';
import { useToast } from '../shell/toastContext';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
// The choice of no template: an empty week where dishes are picked only for the days that need them.
const NONE = 'none';
const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

// Without a choice yet, the template of the week's season comes first.
function seasonal(templates: WeekTemplate[], start: string): string | undefined {
  const season = SEASON[Number(start.slice(5, 7)) - 1];
  return (templates.find((t) => t.season.includes(season)) ?? templates[0])?.id;
}

export default function WeekSheet({ db, mode, me, data, onClose }: { db: LocalDb; mode: 'current' | 'next'; me: Member; data: NonNullable<ReturnType<typeof useMenu>>; onClose: () => void }) {
  const target = mode === 'current' ? data.current : data.next;
  const toast = useToast();
  // Until someone taps a template the default follows the data: templates may still be downloading when the sheet opens.
  const [picked, setPick] = useState<string>();
  const pick = picked ?? target.week?.template_id ?? seasonal(data.templates, target.start);
  const slots = useLiveQuery(() => (pick && pick !== NONE ? db.template_slots.where('template_id').equals(pick).toArray() : []), [db, pick]) ?? [];
  const costs = useLiveQuery(() => templateCosts(db), [db]);
  const [confirm, setConfirm] = useState(false);
  const t = data.templates.find((x) => x.id === pick);
  const first = seasonal(data.templates, target.start);
  const ordered = [...data.templates].sort((a, b) => Number(b.id === first) - Number(a.id === first));
  const parent = me.role === 'parent';
  // An approved week is closed to children; a parent replaces it only after a second tap.
  const locked = target.week?.status === 'approved';
  const loaded = pick === NONE || slots.length >= 28;
  const apply = async () => {
    if (!pick) return;
    if (locked && !confirm) { setConfirm(true); return; }
    const status = mode === 'current' || locked ? 'approved' : 'proposed';
    const w = await setWeekFromTemplate(db, { household: me.household_id, startsOn: target.start, template: pick === NONE ? null : pick, status, by: me.id, existing: target.week });
    if (status === 'proposed') {
      await voteWeek(db, w, me, 'yes');
      toast({ text: `${pick === NONE ? 'Пустая неделя' : `Неделя «${t?.name ?? ''}»`} предложена. Семья проголосует, родители утвердят.` });
    } else if (pick === NONE) {
      toast({ text: 'Пустая неделя стоит. Нажмите на приём в нужный день и выберите блюдо.' });
    } else {
      const s = await weekListStats(db, w.id);
      toast({ text: `Неделя «${t?.name ?? ''}» стоит. Список покупок: ${s.count} ${products(s.count)} ≈\u00A0${rub(s.cost)}`, action: { label: 'К покупкам', to: '/shop' } });
    }
    onClose();
  };
  const name = pick === NONE ? 'пустую неделю' : `неделю «${t?.name ?? ''}»`;
  const label = locked ? (confirm ? 'Точно заменить? Замены блюд пропадут' : 'Заменить утверждённую неделю') : mode === 'current' ? `Поставить ${name}` : `Предложить ${name}`;
  const sub = mode === 'next' ? 'Выберите шаблон и предложите семье, родители утвердят.'
    : target.week ? 'Меню и список покупок соберутся заново.' : 'Меню и список покупок соберутся сами.';
  return (
    <Sheet title={`Неделя на ${weekLabel(target.start)}`} sub={sub} onClose={onClose}
      actions={locked && !parent ? undefined : <button type="button" className="btn" onClick={apply} disabled={!pick || !loaded}>{label}</button>}>
      {locked && !parent ? <p className="note" style={{ margin: '0 16px 12px' }}>Неделя утверждена. Поменять её могут родители.</p> : null}
      {pick && !loaded ? <p className="note" role="status" style={{ margin: '0 16px 12px' }}>Шаблон ещё не загрузился — нужен интернет.</p> : null}
      <div className="tpl-list" role="radiogroup" aria-label="Шаблоны недель">
        {ordered.map((x) => (
          <div key={x.id} className="tpl-item">
            <button type="button" className="tpl" role="radio" aria-checked={x.id === pick} onClick={() => { setPick(x.id); setConfirm(false); }}>
              <span className="tpl-top"><b>{x.name}{x.household_id ? <span className="tpl-now">наш</span> : null}</b>
                {costs?.has(x.id) ? <span className="tpl-cost">≈&nbsp;{rub(Math.round(costs.get(x.id)! / 100) * 100)} на неделю</span> : null}</span>
              <small>{x.note}</small>
            </button>
            {/* The picked template opens its days right under it, so the choice is made by the dishes. */}
            {x.id === pick && loaded ? (
              <div className="day-preview" role="group" aria-label={`«${x.name}» по дням: ужин и обед`}>
                {DAY_SHORT.map((d, i) => {
                  const dinner = slots.find((s) => s.day === i && s.meal === 'dinner');
                  const lunch = slots.find((s) => s.day === i && s.meal === 'lunch');
                  return <div className="row" key={d}><span className="tl-t">{d}</span><span className="row-main"><b>{lineOf(dinner, data.recipes)}</b><small>{lineOf(lunch, data.recipes)}</small></span></div>;
                })}
              </div>
            ) : null}
          </div>
        ))}
        <div className="tpl-item">
          <button type="button" className="tpl" role="radio" aria-checked={pick === NONE} onClick={() => { setPick(NONE); setConfirm(false); }}>
            <span className="tpl-top"><b>Без шаблона</b></span>
            <small>Пустая неделя: блюда только на нужные дни, в покупки — только для них.</small>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
