import type { Story, StoryView } from './types';

export type Ring = 'unseen' | 'seen' | 'none';
export type Group = { memberId: string; stories: Story[] };

export const liveStories = (stories: Story[], now: Date) =>
  stories.filter((s) => Date.parse(s.expires_at) > now.getTime()).sort((a, b) => a.created_at.localeCompare(b.created_at));

export const seenBy = (views: StoryView[], meId: string) => new Set(views.filter((v) => v.member_id === meId).map((v) => v.story_id));

export function ringOf(memberId: string, stories: Story[], seen: Set<string>, meId: string): Ring {
  const own = stories.filter((s) => s.member_id === memberId);
  if (!own.length) return 'none';
  if (memberId === meId) return 'seen';
  return own.some((s) => !seen.has(s.id)) ? 'unseen' : 'seen';
}

// The tapped person first, then everyone after them in the family row (wrapping around) who has
// a story I have not seen. My own stories come only when I tapped my own circle.
export function groupsFrom(order: string[], stories: Story[], startId: string, seen: Set<string>, meId: string): Group[] {
  const at = Math.max(0, order.indexOf(startId));
  const ring = [...order.slice(at), ...order.slice(0, at)];
  return ring
    .map((memberId) => ({ memberId, stories: stories.filter((s) => s.member_id === memberId) }))
    .filter((g) => g.stories.length && (g.memberId === startId || (g.memberId !== meId && g.stories.some((s) => !seen.has(s.id)))));
}

export const firstUnseen = (list: Story[], seen: Set<string>) => Math.max(0, list.findIndex((s) => !seen.has(s.id)));

export function step(pos: { g: number; i: number }, dir: 1 | -1, groups: Group[]): { g: number; i: number } | null {
  if (dir === 1) {
    if (pos.i + 1 < groups[pos.g].stories.length) return { g: pos.g, i: pos.i + 1 };
    return pos.g + 1 < groups.length ? { g: pos.g + 1, i: 0 } : null;
  }
  if (pos.i > 0) return { g: pos.g, i: pos.i - 1 };
  if (pos.g > 0) return { g: pos.g - 1, i: groups[pos.g - 1].stories.length - 1 };
  return { g: 0, i: 0 };
}

export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  return `${Math.floor(min / 60)} ч назад`;
}
