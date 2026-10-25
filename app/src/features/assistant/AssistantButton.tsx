import { Link } from 'react-router-dom';
import Icon from '../shell/Icon';
import type { Screen } from './suggestions';

// The labelled pill in a section header: the same conversation, with questions for this section.
export default function AssistantButton({ from }: { from: Screen }) {
  return (
    <Link className="head-pill ask-pill" to={`/assistant?from=${from}`} aria-label="Спросить помощника">
      <Icon name="spark" />Помощник
    </Link>
  );
}
