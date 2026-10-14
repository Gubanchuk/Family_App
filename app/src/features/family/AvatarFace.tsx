import { useState } from 'react';
import { useAvatarUrl } from './avatarUrls';

// What sits inside a member circle: their photo, or the first letter while there is none,
// it has not loaded, or its link stopped working.
export default function AvatarFace({ member }: { member: { name: string; avatar_path?: string | null } }) {
  const url = useAvatarUrl(member.avatar_path);
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) return <img src={url} alt="" draggable={false} onError={() => setBroken(url)} />;
  return <>{member.name.slice(0, 1)}</>;
}
