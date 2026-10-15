import type { Member } from '../family/useFamily';
import { rub } from '../shop/build';
import { canTakeBack } from './boardActions';
import type { Deposit } from './types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const when = (iso?: string) => { if (!iso) return 'только что'; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// Who put how much into the piggy bank, newest first; the author can take a fresh deposit back.
export default function DepositHistory({ me, members, deposits, onTakeBack }: { me: Member; members: Member[]; deposits: Deposit[]; onTakeBack: (d: Deposit) => void }) {
  if (!deposits.length) return null;
  const list = [...deposits].sort((a, b) => String(b.created_at ?? '~').localeCompare(String(a.created_at ?? '~')));
  return (
    <>
      <h3 className="sh-h dep-h">История</h3>
      <ul className="deposits" aria-label="История копилки">
        {list.map((d) => (
          <li className="row" key={d.id}>
            <span className="row-main"><b>{members.find((m) => m.id === d.member_id)?.name ?? 'Кто-то'} · {rub(d.amount)}</b><small>{when(d.created_at)}</small></span>
            {canTakeBack(d, me) ? <button type="button" className="more" aria-label={`Убрать ${rub(d.amount)}`} onClick={() => onTakeBack(d)}>Убрать</button> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
