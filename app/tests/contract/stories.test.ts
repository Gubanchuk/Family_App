// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { addUser, asUser, createDb } from '../db/harness';
import type { Member } from '../../src/features/family/useFamily';
import type { Story } from '../../src/features/stories/types';
import { pgClient } from './pgClient';

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../../src/lib/supabase', () => ({ get supabase() { return holder.client; } }));

const PAPA = '00000000-0000-0000-0000-0000000000a1';
const SON = '00000000-0000-0000-0000-0000000000a2';

describe('story views and reactions as the app sends them', { timeout: 120_000 }, () => {
  it('records a view, then a reaction, then a changed and a removed reaction', async () => {
    const pg = await createDb();
    for (const u of [PAPA, SON]) await addUser(pg, u);
    const one = async <T>(u: string, sql: string, p: unknown[] = []) => (await asUser(pg, u, sql, p)).rows[0] as T;
    const hh = (await one<{ id: string }>(PAPA, "select public.create_household('Семья', 'Папа', '#2F6FDB', 'father') as id")).id;
    const code = (await one<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh])).c;
    const sonId = (await one<{ id: string }>(SON, "select public.accept_invite($1, 'Сын', '#1FA463', 'son') as id", [code])).id;
    const papaId = (await one<{ id: string }>(PAPA, 'select id from public.members where user_id = $1', [PAPA])).id;
    const story = await one<Story>(SON, "insert into public.stories (household_id, member_id, kind, path, width, height) values ($1, $2, 'photo', $3, 1, 1) returning *", [hh, sonId, `${hh}/stories/s.jpg`]);
    const papa: Member = { id: papaId, household_id: hh, user_id: PAPA, name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

    holder.client = pgClient(pg, PAPA);
    const { markViewed, setReaction } = await import('../../src/features/stories/storiesApi');
    const reaction = async () => (await one<{ reaction: string | null }>(SON, 'select reaction from public.story_views where member_id = $1', [papaId])).reaction;
    await markViewed(story, papa);
    expect(await reaction()).toBeNull();
    await setReaction(story, papa, '❤️');
    expect(await reaction()).toBe('❤️');
    await setReaction(story, papa, '🔥');
    expect(await reaction()).toBe('🔥');
    await setReaction(story, papa, null);
    expect(await reaction()).toBeNull();
  });
});
