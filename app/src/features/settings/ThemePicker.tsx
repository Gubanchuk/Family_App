import { useEffect, useState } from 'react';
import Icon from '../shell/Icon';
import { getThemeChoice, isDarkNow, setThemeChoice, watchSystemTheme, type ThemeChoice } from '../../lib/theme';

export default function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice());
  const [dark, setDark] = useState(isDarkNow());
  useEffect(() => watchSystemTheme(() => setDark(isDarkNow())), []);

  const pick = (c: ThemeChoice) => {
    setThemeChoice(c);
    setChoice(c);
    setDark(isDarkNow());
  };
  const auto = choice === 'auto';
  const card = (t: 'light' | 'dark', label: string, icon: string) => {
    const on = dark === (t === 'dark');
    return (
      <button type="button" role="radio" aria-checked={on} className={`tp ${auto ? 'auto' : ''}`} onClick={() => pick(t)}>
        <span className={`tp-mini ${t}`} aria-hidden="true"><i /><b /><b /></span>
        <span className="tp-l"><Icon name={icon} />{label}{auto && on ? <small>авто</small> : null}</span>
      </button>
    );
  };
  return (
    <section className="card">
      <div className="card-h"><h2>Тема</h2></div>
      <div className="theme-pick" role="radiogroup" aria-label="Тема">
        {card('light', 'День', 'sun')}
        {card('dark', 'Ночь', 'moon')}
      </div>
      <div className="row">
        <span className="row-main"><b>Как в телефоне</b><small>сама переключится вечером, если так настроен телефон</small></span>
        <button type="button" className="switch" role="switch" aria-checked={auto} aria-label="Тема как в телефоне"
          onClick={() => pick(auto ? (dark ? 'dark' : 'light') : 'auto')}><i /></button>
      </div>
    </section>
  );
}
