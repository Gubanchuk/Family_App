import type { Member } from '../family/useFamily';

// Who sees a wish or a thing to buy: null is the whole family, a list names who besides the author,
// an empty list keeps it to the author. Only members who sign in can be chosen.
export default function SeenBy({ me, members, value, onChange }: { me: Member; members: Member[]; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const others = members.filter((m) => m.id !== me.id && m.user_id);
  const toggle = (id: string) => {
    const now = value ?? [];
    onChange(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
  };
  const hidden = value ? others.filter((m) => !value.includes(m.id)).map((m) => m.name) : [];
  return (
    <fieldset className="kin-pick">
      <legend>Кто видит</legend>
      <div className="picks">
        <button type="button" className="pick" aria-pressed={value === null} onClick={() => onChange(null)}>Вся семья</button>
        {others.map((m) => <button key={m.id} type="button" className="pick" aria-pressed={!!value?.includes(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
        <button type="button" className="pick" aria-pressed={!!value && value.length === 0} onClick={() => onChange([])}>Только я</button>
      </div>
      {value && hidden.length ? <p className="note" style={{ margin: '8px 0 0' }}>{value.length ? `${hidden.length > 1 ? 'Не увидят' : 'Не увидит'}: ${hidden.join(', ')}` : 'Увидите только вы'}</p> : null}
    </fieldset>
  );
}

// The line on a card that is not for everyone.
export function seenLine(value: string[] | null | undefined, members: Member[]): string | null {
  if (!value) return null;
  if (!value.length) return 'только вы';
  return `видят: ${value.map((id) => members.find((m) => m.id === id)?.name ?? 'кто-то').join(', ')}`;
}
