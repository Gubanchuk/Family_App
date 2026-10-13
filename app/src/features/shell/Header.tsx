import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';

export default function Header({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: ReactNode; back?: boolean }) {
  const nav = useNavigate();
  if (back) {
    return (
      <header className="k-head sub">
        <button type="button" className="round-btn" aria-label="Назад" onClick={() => nav(-1)}><Icon name="back" /></button>
        <div><h1>{title}</h1></div>
      </header>
    );
  }
  return (
    <header className="k-head">
      <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      <div className="k-head-r">{action}</div>
    </header>
  );
}
