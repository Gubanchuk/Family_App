import { useNavigate } from 'react-router-dom';
import Icon from '../shell/Icon';

// Home's way in: a bar that opens the conversation, with the keyboard ready. Typing happens there, not here,
// so a half-typed question never sits on Home unsent.
export default function AskCard() {
  const navigate = useNavigate();
  return (
    <button type="button" className="card ask-card ask-open" onClick={() => navigate('/assistant?from=home', { state: { focus: true } })}>
      <Icon name="spark" />
      <span className="ask-open-t"><b>Спросить помощника</b><small>про еду, покупки, дела или что угодно по дому</small></span>
      <Icon name="chev" />
    </button>
  );
}
