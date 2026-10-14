import Icon from '../shell/Icon';

export default function MealRow({ name, label, time, extra, note, onOpen }: { name: string; label: string; time: string; extra: string[]; note?: string; onOpen: () => void }) {
  return (
    <button type="button" className="row meal-row" onClick={onOpen} aria-label={`${label}: ${name}. Заменить`}>
      <span className="row-main">
        <b>{name}</b>
        <small>{label} · {time}{extra.length ? ` · ${extra.join(', ')}` : ''}</small>
        {note ? <small className="dima-note">Диме: {note}</small> : null}
      </span>
      <Icon name="chev" className="chev" />
    </button>
  );
}
