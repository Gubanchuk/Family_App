import { supabase } from '../../lib/supabase';
import { listFiles, removeFiles, signedUrls, uploadFile } from '../../lib/media';
import type { Member } from '../family/useFamily';
import type { Overlay, Prepared, Reaction, Story, StoryView } from './types';

const STORY_URL_S = 6 * 3600;
// A file younger than this may belong to a story being posted right now.
const FRESH_MS = 3600_000;

// 'missing' when the database has no stories yet (the migration is not applied): the feature hides.
export async function loadStories(householdId: string): Promise<{ stories: Story[]; views: StoryView[] } | 'missing' | null> {
  const [s, v] = await Promise.all([
    supabase.from('stories').select('*').eq('household_id', householdId).order('created_at'),
    supabase.from('story_views').select('story_id, member_id, viewed_at, reaction').eq('household_id', householdId),
  ]);
  const err = s.error ?? v.error;
  if (err) return err.code === 'PGRST205' || err.code === '42P01' ? 'missing' : null;
  return { stories: (s.data ?? []) as Story[], views: (v.data ?? []) as StoryView[] };
}

export async function postStory(me: Member, p: Prepared, overlays: Overlay[]): Promise<Story> {
  const id = crypto.randomUUID();
  const path = `${me.household_id}/stories/${id}.${p.kind === 'photo' ? 'jpg' : 'mp4'}`;
  await uploadFile(path, p.blob, p.kind === 'photo' ? 'image/jpeg' : 'video/mp4');
  const { data, error } = await supabase.from('stories').insert({
    id, household_id: me.household_id, member_id: me.id, kind: p.kind, path, width: p.width, height: p.height, duration_ms: p.durationMs, overlays,
  }).select('*').single();
  if (error) {
    await removeFiles([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data as Story;
}

export async function saveOverlays(story: Story, overlays: Overlay[]) {
  const { error } = await supabase.from('stories').update({ overlays }).eq('id', story.id);
  if (error) throw new Error(error.message);
}

export async function deleteStory(story: Story) {
  const { error } = await supabase.from('stories').delete().eq('id', story.id);
  if (error) throw new Error(error.message);
  await removeFiles([story.path]).catch(() => {});
}

export async function markViewed(story: Story, me: Member) {
  const { error } = await supabase.from('story_views').upsert({ story_id: story.id, member_id: me.id, household_id: story.household_id }, { onConflict: 'story_id,member_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// The view row is made first (or already exists); only the reaction column may change after that,
// so the reaction goes as an update of that one column rather than an upsert of the whole row.
export async function setReaction(story: Story, me: Member, reaction: Reaction | null) {
  await markViewed(story, me);
  const { error } = await supabase.from('story_views').update({ reaction }).eq('story_id', story.id).eq('member_id', me.id);
  if (error) throw new Error(error.message);
}

export async function storyUrls(stories: Story[]) {
  return signedUrls(stories.map((s) => s.path), STORY_URL_S);
}

// Expired rows go first (the server removes them), then every story file of the family that has
// no live story and is older than an hour.
export async function cleanupStories(householdId: string, now = Date.now()) {
  const { error } = await supabase.rpc('drop_expired_stories');
  if (error) return;
  const files = await listFiles(`${householdId}/stories`);
  const { data } = await supabase.from('stories').select('path').eq('household_id', householdId);
  const live = new Set((data ?? []).map((r) => r.path as string));
  const dead = files.filter((f) => !live.has(f.name) && now - Date.parse(f.created_at) > FRESH_MS).map((f) => f.name);
  await removeFiles(dead).catch(() => {});
}
