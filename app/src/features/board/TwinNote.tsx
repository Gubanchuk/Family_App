import type { Member } from '../family/useFamily';
import { rub } from '../shop/build';
import { memberName, type Twin } from './boardMath';

// Points at the wish or goal that already keeps a piggy bank for the same thing.
export default function TwinNote({ twin, kind, me, members, onOpen }: {
  twin: Twin; kind: 'wish' | 'goal'; me: Member; members: Member[]; onOpen?: (id: string) => void;
}) {
  const whose = twin.owner_id === me.id ? '' : ` (${twin.owner_id ? memberName(members, twin.owner_id) : 'семья'})`;
  const sum = twin.total ? `${rub(twin.saved)} из ${rub(twin.total)}` : rub(twin.saved);
  return (
    <div className="twin-note" role="note">
      <p>Уже есть {kind === 'goal' ? 'цель' : 'хотелка'} «{twin.title}»{whose}: в копилке {sum}. Чтобы копилка была одна, копите в ней.</p>
      {onOpen ? <button type="button" className="btn soft sm" onClick={() => onOpen(twin.id)}>{kind === 'goal' ? 'Открыть цель' : 'Открыть хотелку'}</button> : null}
    </div>
  );
}
