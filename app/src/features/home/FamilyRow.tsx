import { Link } from 'react-router-dom';
import Icon from '../shell/Icon';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import { kinLine } from '../family/kin';
import type { Member } from '../family/useFamily';
import { useStories } from '../stories/storiesContext';
import { MEMBER_COLORS } from '../family/api';
import { requestsWord } from '../board/requestText';

// Me first, like «Моя история» in Telegram; a ring shows who has a story,
// a small counter how many open requests wait for the person.
export default function FamilyRow({ me, members, todo }: { me: Member; members: Member[]; todo?: Map<string, number> }) {
  const st = useStories();
  const order = [me, ...members.filter((m) => m.id !== me.id)];
  return (
    <div className="family" role="group" aria-label="Семья">
      {order.map((m) => {
        const ring = st.available ? st.ringOf(m.id) : 'none';
        const mine = m.id === me.id;
        const n = todo?.get(m.id) ?? 0;
        const count = n > 0 ? `, ${requestsWord(n)}` : '';
        const body = (
          <>
            <span className="av" aria-hidden="true"><AvatarFace member={m} />{mine && st.available ? <i className="fam-plus"><Icon name="plus" /></i> : null}{n > 0 ? <i className="fam-count">{n > 9 ? '9+' : n}</i> : null}</span>
            <b>{m.name}</b><small>{kinLine(m)}</small>{n > 0 ? <span className="sr-only">{count}</span> : null}
          </>
        );
        const style = { ['--c' as string]: memberColor(m.color) };
        if (mine && st.available) {
          return <button type="button" className={`fam ring-${ring}`} key={m.id} style={style} aria-label={`${ring === 'none' ? 'Добавить сторис' : 'Ваши сторис'}${count}`} onClick={ring === 'none' ? st.compose : () => st.openViewer(m.id)}>{body}</button>;
        }
        if (ring !== 'none') {
          return <button type="button" className={`fam ring-${ring}`} key={m.id} style={style} aria-label={`${m.name}, ${ring === 'unseen' ? 'новая сторис' : 'сторис'}${count}`} onClick={() => st.openViewer(m.id)}>{body}</button>;
        }
        return <div className="fam" key={m.id} style={style}>{body}</div>;
      })}
      {me.role === 'parent' && members.length < MEMBER_COLORS.length ? (
        <Link className="fam fam-add" to="/settings"><span className="av" aria-hidden="true"><Icon name="plus" /></span><b>Позвать</b><small>ссылкой</small></Link>
      ) : null}
    </div>
  );
}
