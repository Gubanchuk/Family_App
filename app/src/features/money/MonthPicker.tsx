import { useState } from 'react';
import Icon from '../shell/Icon';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const pad = (n: number) => String(n).padStart(2, '0');

// A month as twelve buttons under a year switch: the browser's own month field is plain text
// on desktop Firefox and Safari («2026-11»).
export default function MonthPicker({ label, value, onChange }: { label: string; value: string; onChange: (month: string) => void }) {
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  // Money shows months up to three years ahead; a later start could not be shown.
  const maxYear = new Date().getFullYear() + 2;
  return (
    <fieldset className="kin-pick">
      <legend>{label}</legend>
      <div className="mp-year">
        <button type="button" className="round-btn" aria-label="Предыдущий год" onClick={() => setYear((y) => y - 1)}><Icon name="back" /></button>
        <b>{year}</b>
        <button type="button" className="round-btn" aria-label="Следующий год" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)}><Icon name="chev" /></button>
      </div>
      <div className="mp-grid">
        {MONTHS.map((m, i) => {
          const key = `${year}-${pad(i + 1)}`;
          return <button key={m} type="button" className="pick" aria-pressed={value === key} aria-label={`${m} ${year}`} onClick={() => onChange(key)}>{m.slice(0, 3)}</button>;
        })}
      </div>
    </fieldset>
  );
}
