import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import AssistantButton from '../assistant/AssistantButton';
import type { Screen } from '../assistant/suggestions';

// ask: the section the assistant button opens the conversation from.
export default function Header({ title, subtitle, action, back, ask }: { title: string; subtitle?: string; action?: ReactNode; back?: boolean; ask?: Screen }) {
  const nav = useNavigate();
  if (back) {
    return (
      <header className="k-head sub">
        <button type="button" className="round-btn" aria-label="Назад" onClick={() => nav(-1)}><Icon name="back" /></button>
        <div><h1>{title}</h1></div>
      </header>
    );
  }
  if (!action && !ask) {
    return (
      <header className="k-head">
        <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      </header>
    );
  }
  // With buttons the title shares their row and the subtitle runs full width under both,
  // so it does not break into a narrow column and every header keeps the same height.
  return (
    <header className="k-head split">
      <h1>{title}</h1>
      <div className="k-head-r">{action}{ask ? <AssistantButton from={ask} /> : null}</div>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}
