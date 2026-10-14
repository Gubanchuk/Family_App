import Sheet from '../menu/Sheet';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import type { Story, StoryView } from './types';

export default function ViewersSheet({ story, views, members, onClose }: { story: Story; views: StoryView[]; members: Member[]; onClose: () => void }) {
  const list = views.filter((v) => v.story_id === story.id && v.member_id !== story.member_id);
  return (
    <Sheet title="Кто посмотрел" sub={list.length ? undefined : 'Пока никто.'} onClose={onClose}>
      <div style={{ margin: '0 16px 16px' }}>
        {list.map((v) => {
          const m = members.find((x) => x.id === v.member_id);
          if (!m) return null;
          return (
            <div className="row" key={v.member_id}>
              <span className="av sm" style={{ ['--c' as string]: memberColor(m.color) }} aria-hidden="true"><AvatarFace member={m} /></span>
              <span className="row-main"><b>{m.name}</b></span>
              {v.reaction ? <span style={{ fontSize: 22 }} role="img" aria-label={`реакция ${v.reaction}`}>{v.reaction}</span> : null}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
