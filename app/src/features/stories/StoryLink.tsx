import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStories, type StoriesCtx } from './storiesContext';

// A push about a new story opens the app at /?story=<member id>. The list kept on the phone may predate that
// story, so unless it already shows one unseen, the next list from the server decides; a story that is gone opens
// nothing. The parameter is replaced away, so Back and a reload do not open the story again.
export default function StoryLink() {
  const [params, setParams] = useSearchParams();
  const stories = useStories();
  const id = params.get('story');
  const waitingOn = useRef<StoriesCtx | null>(null);
  useEffect(() => {
    if (!id) { waitingOn.current = null; return; }
    const ring = stories.ringOf(id);
    if (ring !== 'unseen') {
      waitingOn.current ??= stories;
      if (waitingOn.current === stories) return;
    }
    waitingOn.current = null;
    setParams((p) => { const next = new URLSearchParams(p); next.delete('story'); return next; }, { replace: true });
    if (ring !== 'none') stories.openViewer(id);
  }, [id, stories, setParams]);
  return null;
}
