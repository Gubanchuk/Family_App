import { MEMBER_COLORS } from './api';
import { COLOR_NAME, sameColor } from './colors';

// The chosen circle shows the person's initial, so the picker doubles as a preview of their avatar.
// Colours other members already have are muted, labelled with the owner and cannot be picked.
export default function ColorPicker({ value, onChange, letter, taken = [] }: { value: string; onChange: (c: string) => void; letter: string; taken?: Array<{ name: string; color: string }> }) {
  return (
    <fieldset className="color-pick">
      <legend>Цвет вашего кружка</legend>
      <div className="color-row">
        {MEMBER_COLORS.map((c) => {
          const owner = taken.find((t) => sameColor(t.color, c));
          const picked = sameColor(c, value);
          return (
            <button key={c} type="button" className="av" style={{ ['--c' as string]: c }} aria-pressed={picked} disabled={!!owner}
              aria-label={`${COLOR_NAME[c] ?? c}${owner ? `, занят: ${owner.name}` : ''}`} onClick={() => onChange(c)}>
              {picked ? letter : owner ? owner.name.slice(0, 1) : ''}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
