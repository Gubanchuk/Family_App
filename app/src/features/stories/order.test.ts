import { describe, expect, it } from 'vitest';
import { ago, firstUnseen, groupsFrom, liveStories, ringOf, seenBy, step } from './order';
import type { Story } from './types';

const s = (id: string, member: string, created: string, expires = '2026-10-16T12:00:00Z'): Story => ({
  id, household_id: 'h', member_id: member, kind: 'photo', path: `h/stories/${id}.jpg`, width: 1, height: 1, duration_ms: null, overlays: [], created_at: created, expires_at: expires,
});
const NOW = new Date('2026-10-15T20:00:00Z');
const all = [s('a1', 'mama', '2026-10-15T09:00:00Z'), s('a2', 'mama', '2026-10-15T10:00:00Z'), s('b1', 'son', '2026-10-15T11:00:00Z'), s('old', 'son', '2026-10-14T09:00:00Z', '2026-10-15T09:00:00Z')];

describe('story order', () => {
  it('drops stories whose day is over', () => {
    expect(liveStories(all, NOW).map((x) => x.id)).toEqual(['a1', 'a2', 'b1']);
  });
  it('rings a person with a story I have not seen, greys one I have, and never rings my own as new', () => {
    const live = liveStories(all, NOW);
    const seen = seenBy([{ story_id: 'a1', member_id: 'me', viewed_at: '', reaction: null }], 'me');
    expect(ringOf('mama', live, seen, 'me')).toBe('unseen');
    expect(ringOf('mama', live, new Set(['a1', 'a2']), 'me')).toBe('seen');
    expect(ringOf('papa', live, seen, 'me')).toBe('none');
    expect(ringOf('son', live, new Set(), 'son')).toBe('seen');
  });
  it('starts from the tapped person, then goes on to the others with unseen stories, oldest story first', () => {
    const g = groupsFrom(['me', 'mama', 'son', 'papa'], liveStories(all, NOW), 'son', new Set(), 'me');
    expect(g.map((x) => [x.memberId, x.stories.map((y) => y.id)])).toEqual([['son', ['b1']], ['mama', ['a1', 'a2']]]);
    expect(groupsFrom(['me', 'mama', 'son'], liveStories(all, NOW), 'son', new Set(['a1', 'a2']), 'me').map((x) => x.memberId)).toEqual(['son']);
    expect(firstUnseen(g[1].stories, new Set(['a1']))).toBe(1);
    expect(firstUnseen(g[1].stories, new Set(['a1', 'a2']))).toBe(0);
  });
  it("steps through a person's stories and on to the next person, and ends after the last", () => {
    const g = groupsFrom(['mama', 'son'], liveStories(all, NOW), 'mama', new Set(), 'me');
    expect(step({ g: 0, i: 0 }, 1, g)).toEqual({ g: 0, i: 1 });
    expect(step({ g: 0, i: 1 }, 1, g)).toEqual({ g: 1, i: 0 });
    expect(step({ g: 1, i: 0 }, 1, g)).toBeNull();
    expect(step({ g: 1, i: 0 }, -1, g)).toEqual({ g: 0, i: 1 });
    expect(step({ g: 0, i: 0 }, -1, g)).toEqual({ g: 0, i: 0 });
  });
  it('says how long ago', () => {
    expect(ago('2026-10-15T19:59:40Z', NOW)).toBe('только что');
    expect(ago('2026-10-15T19:35:00Z', NOW)).toBe('25 мин назад');
    expect(ago('2026-10-15T15:00:00Z', NOW)).toBe('5 ч назад');
  });
});
