import { useState } from 'react';
import Sheet from '../menu/Sheet';
import { addDaysIso } from '../menu/week';
import type { Week } from '../../data/db';

const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ALL = [0, 1, 2, 3, 4, 5, 6];

// «вт–вс» for days in a row, «пн, ср, пт» otherwise.
export function daysText(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  const low = (i: number) => SHORT[i].toLowerCase();
  const inRow = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return inRow && d.length > 2 ? `${low(d[0])}–${low(d[d.length - 1])}` : d.map(low).join(', ');
}

// Which days of an approved week its shopping list is built from. Past days of this week are marked,
// and one tap leaves them out.
export default function ListDays({ week, today, onSave }: { week: Week; today: number | null; onSave: (days: number[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>(week.list_days?.length ? week.list_days : ALL);
  const chosen = week.list_days?.length ? week.list_days : null;
  const toggle = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => a - b)));
  return (
    <>
      <section className="week-bar list-days">
        <span className="row-main"><b>{chosen ? `Список на дни: ${daysText(chosen)}` : 'Список на всю неделю'}</b>
          <small>{today !== null && today > 0 && !chosen ? 'Прошедшие дни можно убрать из покупок' : 'Продукты только для этих дней'}</small></span>
        <button type="button" className="btn soft sm" onClick={() => { setDays(week.list_days?.length ? week.list_days : ALL); setOpen(true); }}>Какие дни</button>
      </section>
      {open ? (
        <Sheet title="Из каких дней список" sub="Продукты снятых дней уйдут из покупок. Купленное останется." onClose={() => setOpen(false)}
          actions={<button type="button" className="btn" disabled={!days.length} onClick={async () => { await onSave(days); setOpen(false); }}>Сохранить</button>}>
          <div className="day-picks" role="group" aria-label="Дни недели">
            {ALL.map((d) => (
              <button key={d} type="button" className="pick day-pick" aria-pressed={days.includes(d)} onClick={() => toggle(d)}>
                {SHORT[d]}<b>{Number(addDaysIso(week.starts_on, d).slice(8))}</b><small>{today !== null && d < today ? 'прошёл' : ' '}</small>
              </button>
            ))}
          </div>
          <div className="btns" style={{ margin: '12px 16px 16px' }}>
            {today !== null && today > 0 ? <button type="button" className="btn soft sm" onClick={() => setDays(ALL.filter((d) => d >= today))}>С сегодняшнего дня</button> : null}
            <button type="button" className="btn soft sm" onClick={() => setDays(ALL)}>Вся неделя</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
