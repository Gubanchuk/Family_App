import Icon from '../shell/Icon';

// The row opens the recipe; replacing has its own button so a look never turns into a change.
export default function MealRow({ name, label, time, extra, note, onOpen, onReplace }: {
  name: string; label: string; time: string; extra: string[]; note?: string; onOpen: () => void; onReplace?: () => void;
}) {
  return (
    <div className="row meal-row">
      <button type="button" className="row-btn" onClick={onOpen} aria-label={`${label}: ${[name, ...extra].join(', ')}.${note ? ` Диме: ${note}.` : ''}`}>
        <span className="row-main">
          <b>{name}</b>
          <small>{label} · {time}{extra.length ? ` · ${extra.join(', ')}` : ''}</small>
          {note ? <small className="dima-note">Диме: {note}</small> : null}
        </span>
        {onReplace ? null : <Icon name="chev" className="chev" />}
      </button>
      {onReplace ? <button type="button" className="more" aria-label={`Заменить ${label.toLowerCase()}`} onClick={onReplace}>Заменить</button> : null}
    </div>
  );
}
