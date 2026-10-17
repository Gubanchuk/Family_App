import { resizePhoto } from './image';
import { removeFiles, uploadFile } from './media';

// One photo for a family recipe, a wish or a goal, in the family folder of the private bucket.
export type PhotoKind = 'recipes' | 'wishes' | 'goals';
export type PhotoEdit = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: Blob };

type Deps = { upload: (path: string, body: Blob, type: string) => Promise<void>; resize: (f: Blob) => Promise<{ blob: Blob }>; now: () => number };
const real: Deps = { upload: uploadFile, resize: (f) => resizePhoto(f, 1280, 0.8), now: Date.now };

// The photo_path to save with the record: undefined leaves it as it is, null clears it, a string is a new file.
// The file is squeezed on the phone first, so a 5 MB camera shot travels as about 200 KB.
export async function photoPathFor(householdId: string, kind: PhotoKind, id: string, edit: PhotoEdit, deps: Deps = real): Promise<string | null | undefined> {
  if (edit.kind === 'keep') return undefined;
  if (edit.kind === 'remove') return null;
  const { blob } = await deps.resize(edit.file);
  const path = `${householdId}/photos/${kind}/${id}/${deps.now()}.jpg`;
  await deps.upload(path, blob, 'image/jpeg');
  return path;
}

// After the record points at its new photo the old file goes; a failure only leaves a file behind.
export async function dropOldPhoto(old: string | null | undefined, next: string | null | undefined) {
  if (!old || next === undefined || next === old) return;
  try { await removeFiles([old]); } catch { /* the uploader's file stays until someone else removes it */ }
}
