import { useState } from 'react';
import type { Member } from '../family/useFamily';
import { rub } from '../shop/build';
import { memberName, type Twin } from './boardMath';

// Points at the wish or goal that already keeps a piggy bank for the same thing. On an open item, the owner
// and the parents can gather both banks into this one (onJoin); it asks once before the other item goes.
export default function TwinNote({ twin, kind, me, members, onOpen, onJoin }: {
  twin: Twin; kind: 'wish' | 'goal'; me: Member; members: Member[]; onOpen?: (id: string) => void; onJoin?: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const what = kind === 'goal' ? 'цель' : 'хотелка';
  const whose = twin.owner_id === me.id ? '' : ` (${twin.owner_id ? memberName(members, twin.owner_id) : 'семья'})`;
  const sum = twin.total ? `${rub(twin.saved)} из ${rub(twin.total)}` : rub(twin.saved);
  if (asking && onJoin) {
    return (
      <div className="twin-note" role="note">
        <p>{twin.saved ? `${rub(twin.saved)} из копилки «${twin.title}» перейдут сюда, а ${what} удалится.` : `Копилка «${twin.title}» пустая, ${what} удалится.`}</p>
        <div className="btns">
          <button type="button" className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await onJoin(); }}>Объединить</button>
          <button type="button" className="btn soft sm" disabled={busy} onClick={() => setAsking(false)}>Отмена</button>
        </div>
      </div>
    );
  }
  return (
    <div className="twin-note" role="note">
      <p>Уже есть {what} «{twin.title}»{whose}: в копилке {sum}. {onJoin ? 'Можно объединить копилки в эту.' : 'Чтобы копилка была одна, копите в ней.'}</p>
      <div className="btns">
        {onJoin ? <button type="button" className="btn sm" onClick={() => setAsking(true)}>Объединить сюда</button> : null}
        {onOpen ? <button type="button" className="btn soft sm" onClick={() => onOpen(twin.id)}>{kind === 'goal' ? 'Открыть цель' : 'Открыть хотелку'}</button> : null}
      </div>
    </div>
  );
}
