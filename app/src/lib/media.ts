import { supabase } from './supabase';

// Photos and videos of a family: one private bucket, a folder per family.
export const BUCKET = 'family';

export async function uploadFile(path: string, body: Blob, contentType: string) {
  // Files never change once written (a new photo gets a new name), so phones may cache them for a day.
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, cacheControl: '86400', upsert: false });
  if (error) throw new Error(error.message);
}

export async function signedUrls(paths: string[], seconds: number): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, seconds);
  if (error || !data) return new Map();
  const out = new Map<string, string>();
  for (const d of data) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  return out;
}

export async function removeFiles(paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

export async function listFiles(folder: string): Promise<Array<{ name: string; created_at: string }>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error || !data) return [];
  return data.filter((f) => f.id).map((f) => ({ name: `${folder}/${f.name}`, created_at: f.created_at ?? '' }));
}
