import { Link } from 'react-router-dom';
import Icon from '../shell/Icon';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import { kinLine } from '../family/kin';
import type { Member } from '../family/useFamily';
import { useStories } from '../stories/storiesContext';
import { MEMBER_COLORS } from '../family/api';

// Me first, like «Моя история» in Telegram; a ring shows who has a story.
// No counters on the circles: a number there read as an unread message to everyone and explained nothing.
export default function FamilyRow({ me, members }: { me: Member; members: Member[] }) {
  const st = useStories();
  const order = [me, ...members.filter((m) => m.id !== me.id)];
  return (
    <div className="family" role="group" aria-label="Семья">
      {order.map((m) => {
        const ring = st.available ? st.ringOf(m.id) : 'none';
        const mine = m.id === me.id;
        const body = (
          <>
            <span className="av" aria-hidden="true"><AvatarFace member={m} />{mine && st.available ? <i className="fam-plus"><Icon name="plus" /></i> : null}</span>
            <b>{m.name}</b><small>{kinLine(m)}</small>
          </>
        );
        const style = { ['--c' as string]: memberColor(m.color) };
        if (mine && st.available) {
          return <button type="button" className={`fam ring-${ring}`} key={m.id} style={style} aria-label={ring === 'none' ? 'Добавить сторис' : 'Ваши сторис'} onClick={ring === 'none' ? st.compose : () => st.openViewer(m.id)}>{body}</button>;
        }
        if (ring !== 'none') {
          return <button type="button" className={`fam ring-${ring}`} key={m.id} style={style} aria-label={`${m.name}, ${ring === 'unseen' ? 'новая сторис' : 'сторис'}`} onClick={() => st.openViewer(m.id)}>{body}</button>;
        }
        return <div className="fam" key={m.id} style={style}>{body}</div>;
      })}
      {me.role === 'parent' && members.length < MEMBER_COLORS.length ? (
        <Link className="fam fam-add" to="/settings?to=family"><span className="av" aria-hidden="true"><Icon name="plus" /></span><b>Позвать</b><small>ссылкой</small></Link>
      ) : null}
    </div>
  );
}
