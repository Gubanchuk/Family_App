import type { Member } from '../family/useFamily';

// Who sees a wish or a thing to buy: null is the whole family, a list names who besides its author (the
// server always shows a record to its author). Whoever edits it keeps seeing it: seenToSave adds them.
// Only members who sign in can be chosen.
export default function SeenBy({ me, members, author, value, onChange }: {
  me: Member; members: Member[]; author: string; value: string[] | null; onChange: (v: string[] | null) => void;
}) {
  const others = members.filter((m) => m.id !== me.id && m.id !== author && m.user_id);
  const chosen = (value ?? []).filter((id) => id !== me.id);
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const authorName = members.find((m) => m.id === author)?.name;
  const onlyUs = me.id === author ? 'Только я' : `Только я и ${authorName ?? 'автор'}`;
  const hidden = value ? others.filter((m) => !chosen.includes(m.id)).map((m) => m.name) : [];
  return (
    <fieldset className="kin-pick">
      <legend>Кто видит</legend>
      <div className="picks">
        <button type="button" className="pick" aria-pressed={value === null} onClick={() => onChange(null)}>Вся семья</button>
        {others.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={chosen.includes(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
        <button type="button" className="pick" aria-pressed={!!value && chosen.length === 0} onClick={() => onChange([])}>{onlyUs}</button>
      </div>
      {value && hidden.length ? <p className="note" style={{ margin: '8px 0 0' }}>{`${hidden.length > 1 ? 'Не увидят' : 'Не увидит'}: ${hidden.join(', ')}`}</p> : null}
    </fieldset>
  );
}

// What is stored: the chosen people, plus the person editing when that is not the author.
export function seenToSave(value: string[] | null, me: Member, author: string): string[] | null {
  if (value === null) return null;
  const list = value.filter((id) => id !== author);
  return me.id !== author && !list.includes(me.id) ? [...list, me.id] : list;
}

// The line on a card that is not for everyone.
export function seenLine(value: string[] | null | undefined, members: Member[]): string | null {
  if (!value) return null;
  // Only the author ever sees a record kept to the author.
  if (!value.length) return 'только вы';
  return `видят: ${value.map((id) => members.find((m) => m.id === id)?.name ?? 'кто-то').join(', ')}`;
}
