import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Sheet from './Sheet';
import Icon from '../shell/Icon';
import type { LocalDb, Recipe, Week, WeekTemplate } from '../../data/db';
import { MEAL_LABEL, MEALS } from './week';
import { getMealTimes } from '../../lib/mealTimes';
import { replaceDay } from './actions';
import { lineOf } from './SlotSheet';
import { Locked } from './MealSheet';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

export default function DaySheet({ db, week, day, recipes, templates, editable, onPropose, onClose }: {
  db: LocalDb; week: Week; day: number; recipes: Map<string, Recipe>; templates: WeekTemplate[]; editable: boolean; onPropose: () => void; onClose: () => void;
}) {
  const [tpl, setTpl] = useState(templates.find((t) => t.id !== week.template_id)?.id ?? templates[0]?.id);
  const [src, setSrc] = useState(day);
  const slots = useLiveQuery(() => (tpl ? db.template_slots.where('template_id').equals(tpl).filter((s) => s.day === src).toArray() : []), [db, tpl, src]) ?? [];
  if (!editable) {
    return <Sheet title={`Заменить ${DAY_ACC[day]} целиком`} onClose={onClose} actions={<Locked onPropose={onPropose} />}>{null}</Sheet>;
  }
  const apply = async () => { await replaceDay(db, week, day, slots); onClose(); };
  return (
    <Sheet title={`Заменить ${DAY_ACC[day]} целиком`} sub="Возьмите любой день из любой недели." onClose={onClose}
      actions={<button type="button" className="btn" onClick={apply} disabled={slots.length !== 4}><Icon name="swap" />Поставить на {DAY_ACC[day]}</button>}>
      <div className="col-chips sheet-chips" role="group" aria-label="Неделя">
        {templates.map((t) => <button key={t.id} type="button" aria-pressed={t.id === tpl} onClick={() => setTpl(t.id)}>{t.name}</button>)}
      </div>
      <div className="days sheet-days" role="group" aria-label="День недели">
        {DAY_SHORT.map((d, i) => <button key={d} type="button" className="day" aria-pressed={i === src} onClick={() => setSrc(i)}>{d}</button>)}
      </div>
      <div className="day-preview">
        {MEALS.map((m) => (
          <div className="row" key={m}><span className="tl-t">{getMealTimes()[m]}</span><span className="row-main"><b>{lineOf(slots.find((s) => s.meal === m), recipes)}</b><small>{MEAL_LABEL[m]}</small></span></div>
        ))}
      </div>
    </Sheet>
  );
}
