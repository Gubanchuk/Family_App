import { KIN_FOR, kinTitle, type Kin } from './kin';
import type { Member } from './useFamily';

// Options follow the role; without a known role every option is offered. A value set earlier
// stays on the list even if the role has changed since.
export default function KinPicker({ value, onChange, role, legend = 'Кто вы в семье' }: {
  value: Kin | null; onChange: (k: Kin) => void; role?: Member['role']; legend?: string;
}) {
  const options = role ? KIN_FOR[role] : [...KIN_FOR.parent, ...KIN_FOR.child];
  const list = value && !options.includes(value) ? [...options, value] : options;
  return (
    <fieldset className="kin-pick">
      <legend>{legend}</legend>
      <div className="picks">
        {list.map((k) => <button key={k} type="button" className="pick" aria-pressed={value === k} onClick={() => onChange(k)}>{kinTitle(k)}</button>)}
      </div>
    </fieldset>
  );
}
