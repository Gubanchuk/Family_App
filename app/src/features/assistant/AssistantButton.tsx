import { Link } from 'react-router-dom';
import Icon from '../shell/Icon';
import type { Screen } from './suggestions';

// The round button in a section's header: the same conversation, with questions for this section.
export default function AssistantButton({ from }: { from: Screen }) {
  return (
    <Link className="round-btn ask-btn" to={`/assistant?from=${from}`} aria-label="Спросить помощника">
      <Icon name="spark" />
    </Link>
  );
}
