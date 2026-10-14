# Stories and Photo Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Family members put a photo in their circle and post Telegram-like stories (photo or video, captions and emoji stickers, 8 reactions) that the family sees for 24 hours.

**Architecture:** One private Supabase Storage bucket `family` with a folder per family; rows in `members.avatar_path`, `stories`, `story_views` guarded by RLS. Media is shrunk on the phone (canvas for photos, Mediabunny/WebCodecs for video) before upload and shown through signed URLs. Captions are JSON overlays drawn over a 9:16 frame, so they stay editable. Stories data lives outside the Dexie sync engine: a `StoriesProvider` reads it online, reloads after each sync and on its own Realtime channel, and tidies expired stories on start.

**Tech Stack:** React 19, TypeScript, supabase-js 2 (Storage, RPC, Realtime), Mediabunny (video), Vitest + Testing Library, PGlite for RLS tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-10-15-stories-avatars-design.md`

## Global Constraints

- Free Supabase: 1 GB files, 5 GB uncached + 5 GB cached egress, 50 MB per file, no server image transforms.
- Stories live 24 hours; then row and file are deleted (files only through the Storage API, never by SQL).
- Video: up to 30 s (longer is cut to the first 30 s), 720p on the short side, about 1.5 Mbit/s; original sent only if the phone cannot convert and it is ≤ 30 s and ≤ 50 MB, otherwise «Этот телефон не может сжать видео. Снимите до 30 секунд».
- Photo: ≤ 1080 px long side, JPEG. Avatar: 256×256 JPEG at `<household>/avatars/<member>/<time>.jpg`.
- Reactions, exactly: ❤️ 😂 😍 😮 😢 🔥 👍 👏 (one per person per story, can change or remove).
- Viewers and reactions are shown to the author only.
- Only the family sees stories; Dima's avatar is set by parents.
- Signed URLs: stories 6 h, avatars 7 days.
- UI copy in Russian; code comments in plain English; no new lint warnings (baseline 18).
- The app must keep working before the owner runs `db push`: missing tables or columns hide the feature, they never break a screen.

## Review Focus

- A phone opened before the migration is applied (tables missing) — Home, Settings and sync must behave as today, with no story badge. Test in Task 5.
- An upload on a slow mobile link (several MB taking more than 15 s) — must not be aborted by the 15 s silence timeout. Test in Task 1.
- A story that expires while the viewer or Home is open — it disappears from rings within a minute and the viewer skips it without a crash. Test in Task 5 (`liveStories`).
- A picked file that is neither a photo nor a video, or a photo the browser cannot decode — the composer closes with a clear message instead of hanging. Test in Task 8.
- An avatar link that stopped working (expired or offline) — the circle falls back to the letter. Test in Task 2.

---

### Task 1: Storage foundation

**Files:**
- Modify: `supabase/tests/bootstrap.sql` (append storage stand-in)
- Create: `supabase/migrations/20261015000200_family_media.sql`
- Modify: `app/src/lib/supabase.ts` (`timedFetch` upload window)
- Create: `app/src/lib/media.ts`
- Test: `app/tests/db/media.test.ts`, `app/src/lib/supabase.test.ts` (add a case)

**Interfaces:**
- Produces: bucket `family`; `members.avatar_path text`; RPC `set_avatar(p_member uuid, p_path text) returns text` (old path); `media.ts`: `BUCKET = 'family'`, `uploadFile(path: string, body: Blob, contentType: string): Promise<void>`, `signedUrls(paths: string[], seconds: number): Promise<Map<string, string>>`, `removeFiles(paths: string[]): Promise<void>`, `listFiles(folder: string): Promise<Array<{ name: string; created_at: string }>>`.

- [ ] **Step 1: Append the storage stand-in to the test bootstrap**

```sql
-- Test-only stand-in for Supabase Storage: buckets, objects with RLS on, and the path helper.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  created_at timestamptz default now(),
  metadata jsonb
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
```

- [ ] **Step 2: Write the failing DB test** `app/tests/db/media.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000e1';
const MAMA = '00000000-0000-0000-0000-0000000000e2';
const SON = '00000000-0000-0000-0000-0000000000e3';
const STRANGER = '00000000-0000-0000-0000-0000000000e4';
let db: PGlite;
let hh: string;
let other: string;
const ids: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const put = (u: string, name: string) => asUser(db, u, "insert into storage.objects (bucket_id, name, owner_id) values ('family', $1, $2)", [name, u]);

describe('family media bucket', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, MAMA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const invite = async (role: string) => (await rows<{ c: string }>(PAPA, 'select public.create_invite($1, $2::public.member_role) as c', [hh, role]))[0].c;
    await asUser(db, MAMA, "select public.accept_invite($1, 'Оля', '#E0457B', 'mother')", [await invite('parent')]);
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [await invite('child')]);
    await asUser(db, PAPA, "insert into public.members (household_id, name, color, role, portion) values ($1, 'Дима', '#F2A900', 'child', 0.5)", [hh]);
    other = (await rows<{ id: string }>(STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB') as id"))[0].id;
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) ids[r.name] = r.id;
  });

  it('lets the family post into its own folder and read it, and keeps other families out', async () => {
    await put(SON, `${hh}/stories/a.jpg`);
    expect(await rows(MAMA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/a.jpg` }]);
    expect(await rows(STRANGER, 'select name from storage.objects')).toEqual([]);
    await expect(put(STRANGER, `${hh}/stories/b.jpg`)).rejects.toThrow();
    await expect(put(SON, `${other}/stories/c.jpg`)).rejects.toThrow();
  });

  it('lets a person put only their own avatar, and a parent anyone\'s in the family', async () => {
    await put(SON, `${hh}/avatars/${ids['Тёма']}/1.jpg`);
    await expect(put(SON, `${hh}/avatars/${ids['Оля']}/1.jpg`)).rejects.toThrow();
    await put(MAMA, `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await expect(put(SON, `${hh}/other/1.jpg`)).rejects.toThrow();
  });

  it('lets the owner of a file or a parent (for avatars) delete it', async () => {
    await put(MAMA, `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await put(MAMA, `${hh}/stories/m.jpg`);
    await asUser(db, SON, 'delete from storage.objects');
    expect((await rows(PAPA, 'select name from storage.objects order by name')).length).toBe(2);
    await asUser(db, PAPA, "delete from storage.objects where name like '%/avatars/%'");
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/m.jpg` }]);
    await asUser(db, MAMA, 'delete from storage.objects');
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([]);
  });

  it('sets an avatar path for oneself or, as a parent, for others but the owner, and returns the old one', async () => {
    const set = (u: string, m: string, p: string | null) => rows<{ old: string | null }>(u, 'select public.set_avatar($1, $2) as old', [m, p]);
    expect(await set(SON, ids['Тёма'], `${hh}/avatars/${ids['Тёма']}/1.jpg`)).toEqual([{ old: null }]);
    expect(await set(SON, ids['Тёма'], `${hh}/avatars/${ids['Тёма']}/2.jpg`)).toEqual([{ old: `${hh}/avatars/${ids['Тёма']}/1.jpg` }]);
    await expect(set(SON, ids['Оля'], `${hh}/avatars/${ids['Оля']}/1.jpg`)).rejects.toThrow(/not_allowed/);
    await expect(set(SON, ids['Тёма'], `${hh}/avatars/${ids['Оля']}/3.jpg`)).rejects.toThrow(/bad_path/);
    await set(MAMA, ids['Дима'], `${hh}/avatars/${ids['Дима']}/1.jpg`);
    await expect(set(MAMA, ids['Андрей'], `${hh}/avatars/${ids['Андрей']}/1.jpg`)).rejects.toThrow(/not_allowed/);
    expect(await set(SON, ids['Тёма'], null)).toEqual([{ old: `${hh}/avatars/${ids['Тёма']}/2.jpg` }]);
    expect(await rows(PAPA, 'select avatar_path from public.members where id = $1', [ids['Тёма']])).toEqual([{ avatar_path: null }]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd app && npx vitest run tests/db/media.test.ts`
Expected: FAIL (`relation "storage.buckets" ... ` resolves now, but `function public.set_avatar does not exist` / inserts not rejected).

- [ ] **Step 4: Write the migration** `supabase/migrations/20261015000200_family_media.sql`

```sql
-- Photos and videos of the family live in one private bucket, one folder per family:
-- <household>/avatars/<member>/<time>.jpg and <household>/stories/<story>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family', 'family', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

alter table public.members add column avatar_path text;

create policy "family media: family reads" on storage.objects for select to authenticated
  using (bucket_id = 'family' and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h));

create policy "family media: members add" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and (
      (storage.foldername(name))[2] = 'stories'
      or ((storage.foldername(name))[2] = 'avatars' and (
        (storage.foldername(name))[3] in (select id::text from public.members where user_id = auth.uid() and deleted_at is null)
        or public.is_parent(((storage.foldername(name))[1])::uuid)))
    )
  );

create policy "family media: owner or parent removes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'family'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and (owner_id = auth.uid()::text
      or ((storage.foldername(name))[2] = 'avatars' and public.is_parent(((storage.foldername(name))[1])::uuid)))
  );

-- Who may change a circle photo: the person, or a parent for anyone but the owner.
-- Returns the previous path so the app removes that file through the Storage API.
create function public.set_avatar(p_member uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare m public.members; old text;
begin
  select * into m from public.members where id = p_member and deleted_at is null;
  if not found then raise exception 'member_not_found'; end if;
  if not (m.user_id = auth.uid() or (public.is_parent(m.household_id) and not m.is_owner)) then raise exception 'not_allowed'; end if;
  if p_path is not null and p_path not like m.household_id::text || '/avatars/' || m.id::text || '/%' then raise exception 'bad_path'; end if;
  old := m.avatar_path;
  update public.members set avatar_path = p_path, updated_at = now() where id = p_member;
  return old;
end $$;

revoke execute on function public.set_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(uuid, text) to authenticated;
```

- [ ] **Step 5: Run the DB test**

Run: `cd app && npx vitest run tests/db/media.test.ts tests/db/family.test.ts tests/db/profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Failing test for the upload window** — add to `app/src/lib/supabase.test.ts`

```ts
it('gives an upload more than the usual silence before the answer', async () => {
  vi.useFakeTimers();
  let aborted = false;
  const base = vi.fn((_i: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_r, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }));
  const f = timedFetch(15_000, base as unknown as typeof fetch);
  const body = new FormData();
  body.append('', new Blob(['x']));
  f('https://x/storage/v1/object/family/a.jpg', { method: 'POST', body }).catch(() => {});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(aborted).toBe(false);
  f('https://x/rest/v1/weeks', { method: 'POST', body: '{}' }).catch(() => {});
  await vi.advanceTimersByTimeAsync(16_000);
  expect(aborted).toBe(true);
  vi.useRealTimers();
});
```

Run: `cd app && npx vitest run src/lib/supabase.test.ts` — Expected: FAIL (first expectation, aborted after 15 s).

- [ ] **Step 7: Give uploads a longer window in `timedFetch`**

In `app/src/lib/supabase.ts`, above `timedFetch`:

```ts
// An upload sends its body before any answer can come; on a slow mobile link a few megabytes
// take longer than the usual silence limit.
const UPLOAD_MS = 180_000;
const isUpload = (init: RequestInit) => init.body instanceof Blob || init.body instanceof FormData || init.body instanceof ArrayBuffer;
```

Inside the returned function, replace the uses of `ms` with `limit`, declared first:

```ts
    const limit = isUpload(init) ? Math.max(ms, UPLOAD_MS) : ms;
```

(both in `arm()`'s `setTimeout(..., limit)` and in the message `Math.round(limit / 1000)`).

Run: `cd app && npx vitest run src/lib/supabase.test.ts` — Expected: PASS.

- [ ] **Step 8: Storage helpers** `app/src/lib/media.ts`

```ts
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
  return new Map(data.filter((d) => d.path && d.signedUrl && !d.error).map((d) => [d.path!, d.signedUrl]));
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
```

Run: `cd app && npx tsc -b` — Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add supabase/tests/bootstrap.sql supabase/migrations/20261015000200_family_media.sql app/src/lib/supabase.ts app/src/lib/supabase.test.ts app/src/lib/media.ts app/tests/db/media.test.ts
git commit -m "feat: add a private family media bucket and avatar paths"
```

---

### Task 2: Show photo avatars

**Files:**
- Modify: `app/src/features/family/useFamily.ts` (Member type, mapping)
- Create: `app/src/features/family/avatarUrls.ts`, `app/src/features/family/AvatarFace.tsx`
- Modify: `app/src/features/home/HomePage.tsx`, `app/src/features/settings/Settings.tsx`, `app/src/features/ideas/OfferRow.tsx`, `app/src/styles/components.css`
- Test: `app/src/features/family/avatarUrls.test.ts`, `app/src/features/family/AvatarFace.test.tsx`

**Interfaces:**
- Consumes: `signedUrls` from Task 1.
- Produces: `Member.avatar_path?: string | null`; `avatarUrl(path: string, now?: number): Promise<string | null>`; `useAvatarUrl(path: string | null | undefined): string | null`; `setAvatarSigner(s)` (tests); `<AvatarFace member={{ name, avatar_path }} />` renders `<img>` or the first letter, meant to sit inside an existing `.av` element.

- [ ] **Step 1: Failing tests**

`app/src/features/family/avatarUrls.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarUrl, setAvatarSigner } from './avatarUrls';

describe('avatar links', () => {
  beforeEach(() => localStorage.clear());

  it('asks for all links of a screen in one request and reuses them', async () => {
    const signer = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://cdn/${p}?t=1`])));
    setAvatarSigner(signer);
    const [a, b] = await Promise.all([avatarUrl('h/avatars/m1/1.jpg'), avatarUrl('h/avatars/m2/1.jpg')]);
    expect(a).toBe('https://cdn/h/avatars/m1/1.jpg?t=1');
    expect(b).toBe('https://cdn/h/avatars/m2/1.jpg?t=1');
    expect(signer).toHaveBeenCalledTimes(1);
    await avatarUrl('h/avatars/m1/1.jpg');
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('keeps showing a remembered link when the network is down', async () => {
    setAvatarSigner(async (paths) => new Map(paths.map((p) => [p, 'https://cdn/old'])));
    await avatarUrl('h/avatars/m1/1.jpg', Date.now());
    setAvatarSigner(async () => { throw new Error('offline'); });
    // Nine days later the link is due for renewal, the renewal fails, the old one is still used.
    expect(await avatarUrl('h/avatars/m1/1.jpg', Date.now() + 9 * 86_400_000)).toBe('https://cdn/old');
  });
});
```

`app/src/features/family/AvatarFace.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AvatarFace from './AvatarFace';
import { setAvatarSigner } from './avatarUrls';

describe('AvatarFace', () => {
  it('shows the letter without a photo', () => {
    render(<span className="av"><AvatarFace member={{ name: 'Оля', avatar_path: null }} /></span>);
    expect(screen.getByText('О')).toBeInTheDocument();
  });

  it('shows the photo, and the letter again when the photo fails to load', async () => {
    localStorage.clear();
    setAvatarSigner(async (paths) => new Map(paths.map((p) => [p, `https://cdn/${p}`])));
    const { container } = render(<span className="av"><AvatarFace member={{ name: 'Оля', avatar_path: 'h/avatars/m/1.jpg' }} /></span>);
    const img = await screen.findByRole('presentation');
    expect(img).toHaveAttribute('src', 'https://cdn/h/avatars/m/1.jpg');
    fireEvent.error(img);
    expect(container).toHaveTextContent('О');
  });
});
```

Run: `cd app && npx vitest run src/features/family/avatarUrls.test.ts src/features/family/AvatarFace.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 2: Member field** — in `useFamily.ts` extend the type and the mapping:

```ts
export type Member = { id: string; household_id: string; user_id: string | null; name: string; color: string; role: 'parent' | 'child'; is_owner: boolean; portion: number; kin?: Kin | null; avatar_path?: string | null };
```

and in the `data.map(...)` object add `avatar_path: m.avatar_path ?? null,` after `kin`.

- [ ] **Step 3: Link cache** `app/src/features/family/avatarUrls.ts`

```ts
import { useEffect, useState } from 'react';
import { signedUrls } from '../../lib/media';

const KEY = 'fa.avatar-urls';
const DAY = 86_400_000;
const SIGN_FOR_S = 7 * 86_400;
type Entry = { url: string; until: number };
type Signer = (paths: string[], seconds: number) => Promise<Map<string, string>>;

let cache: Record<string, Entry> | null = null;
let signer: Signer = signedUrls;
let queue = new Map<string, Array<(url: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function read(): Record<string, Entry> {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Entry>; } catch { cache = {}; }
  }
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(read())); } catch { /* storage unavailable */ }
}

// For tests: a fake signer and a clean cache.
export function setAvatarSigner(s: Signer) {
  signer = s;
  cache = null;
}

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const paths = [...batch.keys()];
  let urls = new Map<string, string>();
  try { urls = await signer(paths, SIGN_FOR_S); } catch { /* offline: a remembered link or the letter */ }
  const c = read();
  const until = Date.now() + SIGN_FOR_S * 1000;
  for (const p of paths) {
    const u = urls.get(p);
    if (u) c[p] = { url: u, until };
    for (const done of batch.get(p)!) done(u ?? c[p]?.url ?? null);
  }
  write();
}

// A link is reused while it has more than a day left. The same address lets a phone without
// network show the photo from the browser cache.
export function avatarUrl(path: string, now = Date.now()): Promise<string | null> {
  const hit = read()[path];
  if (hit && hit.until - now > DAY) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    queue.set(path, [...(queue.get(path) ?? []), resolve]);
    timer ??= setTimeout(flush, 0);
  });
}

export function useAvatarUrl(path: string | null | undefined): string | null {
  const [got, setGot] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    avatarUrl(path).then((url) => { if (live) setGot({ path, url }); });
    return () => { live = false; };
  }, [path]);
  if (!path) return null;
  return got?.path === path ? got.url : read()[path]?.url ?? null;
}
```

- [ ] **Step 4: The face** `app/src/features/family/AvatarFace.tsx`

```tsx
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
```

CSS, after `.av.sm` in `components.css`:

```css
.av > img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
```

- [ ] **Step 5: Use it** — replace the letter inside member circles:
  - `HomePage.tsx` header avatar: `{me.name.slice(0, 1)}` → `<AvatarFace member={me} />`; family chips `{m.name.slice(0, 1)}` → `<AvatarFace member={m} />`.
  - `Settings.tsx` profile `.av.lg` and both family-list `.av.sm` spans: same replacement.
  - `OfferRow.tsx`: the `.av.sm` letter of the sender → `<AvatarFace member={from} />` when `from` exists (keep the current fallback text otherwise).
  - Import: `import AvatarFace from '../family/AvatarFace';`. The colour picker keeps letters: it previews a colour, and the photo circle sits right above it in the same sheet (Task 3).

- [ ] **Step 6: Run tests**

Run: `cd app && npx vitest run src/features/family src/features/home src/features/settings src/features/ideas && npx tsc -b && npm run lint`
Expected: PASS; lint warnings 18.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat: show member photos in their circles, falling back to the letter"
```

---

### Task 3: Pick and crop a photo for a circle

**Files:**
- Create: `app/src/lib/image.ts`, `app/src/features/family/AvatarPicker.tsx`
- Modify: `app/src/features/family/api.ts` (`setAvatar`, `addProfileWithoutSignIn` returns id), `app/src/features/settings/Settings.tsx` (PersonSheet), `app/src/styles/components.css`
- Test: `app/src/lib/image.test.ts`, `app/src/features/settings/Settings.test.tsx` (add a case)

**Interfaces:**
- Consumes: `uploadFile`, `removeFiles` (Task 1); `useAvatarUrl`, `AvatarFace` (Task 2).
- Produces: `image.ts`: `type AvatarCrop = { x: number; y: number; zoom: number }`, `clampCrop(w, h, c): AvatarCrop`, `cropRect(w, h, c): { sx: number; sy: number; side: number }`, `decodeImage(file: Blob): Promise<ImageBitmap>`, `toJpeg(canvas, quality): Promise<Blob>`, `resizePhoto(file: Blob, maxSide?: number, quality?: number): Promise<{ blob: Blob; width: number; height: number }>`, `cropAvatar(file: Blob, crop: AvatarCrop, size?: number): Promise<Blob>`; `AvatarPicker.tsx`: `type PhotoChoice = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: File; crop: AvatarCrop }`; `api.ts`: `setAvatar(m: Pick<Member, 'id' | 'household_id'>, photo: PhotoChoice): Promise<void>`, `addProfileWithoutSignIn(...): Promise<string>` (new member id).

- [ ] **Step 1: Failing test for crop math** `app/src/lib/image.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { clampCrop, cropRect } from './image';

describe('avatar crop', () => {
  it('cuts the largest centred square at zoom 1', () => {
    expect(cropRect(4000, 3000, { x: 0.5, y: 0.5, zoom: 1 })).toEqual({ sx: 500, sy: 0, side: 3000 });
  });
  it('shrinks the square with zoom and follows the chosen centre', () => {
    expect(cropRect(4000, 3000, { x: 0.25, y: 0.5, zoom: 2 })).toEqual({ sx: 250, sy: 750, side: 1500 });
  });
  it('keeps the square inside the picture', () => {
    expect(cropRect(4000, 3000, { x: 0, y: 1, zoom: 2 })).toEqual({ sx: 0, sy: 1500, side: 1500 });
    expect(clampCrop(4000, 3000, { x: 0, y: 1, zoom: 2 })).toEqual({ x: 0.1875, y: 0.75, zoom: 2 });
  });
});
```

Run: `cd app && npx vitest run src/lib/image.test.ts` — Expected: FAIL.

- [ ] **Step 2: Image helpers** `app/src/lib/image.ts`

```ts
// x/y: the centre of the circle in fractions of the picture; zoom ≥ 1 shrinks the square.
export type AvatarCrop = { x: number; y: number; zoom: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function clampCrop(w: number, h: number, c: AvatarCrop): AvatarCrop {
  const zoom = clamp(c.zoom, 1, 4);
  const side = Math.min(w, h) / zoom;
  return { x: clamp(c.x, side / 2 / w, 1 - side / 2 / w), y: clamp(c.y, side / 2 / h, 1 - side / 2 / h), zoom };
}

export function cropRect(w: number, h: number, c: AvatarCrop) {
  const k = clampCrop(w, h, c);
  const side = Math.min(w, h) / k.zoom;
  return { sx: k.x * w - side / 2, sy: k.y * h - side / 2, side };
}

// Decoded with the camera's rotation applied, so portrait photos stand upright.
export function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

export async function resizePhoto(file: Blob, maxSide = 1080, quality = 0.82) {
  const img = await decodeImage(file);
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * k);
  const height = Math.round(img.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  img.close();
  return { blob: await toJpeg(canvas, quality), width, height };
}

export async function cropAvatar(file: Blob, crop: AvatarCrop, size = 256): Promise<Blob> {
  const img = await decodeImage(file);
  const { sx, sy, side } = cropRect(img.width, img.height, crop);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  img.close();
  return toJpeg(canvas, 0.85);
}
```

Run: `cd app && npx vitest run src/lib/image.test.ts` — Expected: PASS.

- [ ] **Step 3: API** — in `api.ts`:

```ts
import { removeFiles, uploadFile } from '../../lib/media';
import { cropAvatar } from '../../lib/image';
import type { PhotoChoice } from './AvatarPicker';
```

Change `addProfileWithoutSignIn` to return the new id:

```ts
export async function addProfileWithoutSignIn(household: string, name: string, color: string, portion: number, kin: Kin | null = null): Promise<string> {
  const { data, error } = await withKin((k) => supabase.from('members').insert({ household_id: household, name, color, role: 'child', portion, ...(k && kin ? { kin } : {}) }).select('id').single());
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
```

Add:

```ts
// The photo goes up first under a new name; the row then points at it and the old file is removed.
export async function setAvatar(m: Pick<Member, 'id' | 'household_id'>, photo: PhotoChoice) {
  if (photo.kind === 'keep') return;
  let path: string | null = null;
  if (photo.kind === 'new') {
    path = `${m.household_id}/avatars/${m.id}/${Date.now()}.jpg`;
    await uploadFile(path, await cropAvatar(photo.file, photo.crop), 'image/jpeg');
  }
  const { data, error } = await supabase.rpc('set_avatar', { p_member: m.id, p_path: path });
  if (error) {
    if (path) await removeFiles([path]).catch(() => {});
    throw new Error(error.message);
  }
  const old = data as string | null;
  if (old && old !== path) await removeFiles([old]).catch(() => {});
}
```

In `family/invite.ts` `TEXT` add `not_allowed: 'Это фото может поменять только сам человек или родитель.'` and `bad_path: 'Не получилось сохранить фото. Попробуйте ещё раз.'`.

- [ ] **Step 4: The picker** `app/src/features/family/AvatarPicker.tsx`

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import AvatarFace from './AvatarFace';
import { memberColor } from './colors';
import { clampCrop, type AvatarCrop } from '../../lib/image';

export type PhotoChoice = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: File; crop: AvatarCrop };

const VIEW = 200;

// The circle shows what will be saved: drag to move the picture, the slider to zoom.
export default function AvatarPicker({ name, color, avatarPath, value, onChange }: {
  name: string; color: string; avatarPath: string | null | undefined; value: PhotoChoice; onChange: (p: PhotoChoice) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (value.kind !== 'new') return;
    const url = URL.createObjectURL(value.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setSize(null);
    onChange({ kind: 'new', file, crop: { x: 0.5, y: 0.5, zoom: 1 } });
  };
  const crop = value.kind === 'new' ? value.crop : null;
  const set = (c: AvatarCrop) => { if (value.kind === 'new' && size) onChange({ ...value, crop: clampCrop(size.w, size.h, c) }); };
  const scale = size && crop ? (VIEW * crop.zoom) / Math.min(size.w, size.h) : 1;
  const down = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!drag.current || !crop || !size) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    set({ ...crop, x: crop.x - dx / (size.w * scale), y: crop.y - dy / (size.h * scale) });
  };

  return (
    <div className="avatar-pick">
      {value.kind === 'new' && src ? (
        <>
          <div className="crop" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
            <img src={src} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={size && crop ? { width: size.w * scale, height: size.h * scale, left: VIEW / 2 - crop.x * size.w * scale, top: VIEW / 2 - crop.y * size.h * scale } : { visibility: 'hidden' }} />
          </div>
          <label className="field">Приблизить
            <input type="range" min={1} max={4} step={0.01} value={crop?.zoom ?? 1} onChange={(e) => crop && set({ ...crop, zoom: Number(e.target.value) })} />
          </label>
        </>
      ) : (
        <span className="av xl" style={{ ['--c' as string]: memberColor(color) }} aria-hidden="true">
          {value.kind === 'remove' ? name.slice(0, 1) : <AvatarFace member={{ name, avatar_path: avatarPath }} />}
        </span>
      )}
      <div className="btns">
        <label className="btn soft sm">Выбрать фото<input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>
        {value.kind === 'new' || (avatarPath && value.kind === 'keep') ? (
          <button type="button" className="btn soft sm" onClick={() => onChange(value.kind === 'new' && !avatarPath ? { kind: 'keep' } : { kind: 'remove' })}>Убрать фото</button>
        ) : null}
      </div>
    </div>
  );
}
```

CSS (append to `components.css`):

```css
/* Circle photo: the chosen picture moves under a round window of the size it will be shown. */
.avatar-pick { display: grid; justify-items: center; gap: 10px; margin: 4px 0 8px; }
.avatar-pick .field { width: 100%; }
.av.xl { width: 96px; height: 96px; font-size: 36px; }
.crop { position: relative; width: 200px; height: 200px; border-radius: 50%; overflow: hidden; touch-action: none; cursor: grab; background: color-mix(in oklab, var(--k-ink) 8%, var(--k-card)); }
.crop img { position: absolute; max-width: none; user-select: none; pointer-events: none; }
```

- [ ] **Step 5: PersonSheet and Settings** — in `Settings.tsx`:
  - `PersonSheet` gets props `avatarPath?: string | null` and passes a 4th argument to `onSave(name, color, kin, photo: PhotoChoice)`. Add `const [photo, setPhoto] = useState<PhotoChoice>({ kind: 'keep' });`, render `<AvatarPicker name={name || ' '} color={color} avatarPath={avatarPath} value={photo} onChange={setPhoto} />` as the first child of the form, and include `photo.kind !== 'keep'` in `keepOnBackdrop`.
  - Profile save: `await updateMyProfile(name, color, kin); await setAvatar(me, photo); reload();`.
  - Member save: `await updateMember(sheet, name, color, kin); await setAvatar(sheet, photo); reload();`.
  - Toddler save: `const id = await addProfileWithoutSignIn(me.household_id, name.trim(), color, 0.5, kin); await setAvatar({ id, household_id: me.household_id }, photo); reload();`.
  - Pass `avatarPath={me.avatar_path}` / `avatarPath={sheet.avatar_path}`; the toddler sheet passes nothing.
  - Imports: `setAvatar` from `../family/api`, `AvatarPicker, { type PhotoChoice }` from `../family/AvatarPicker`.

- [ ] **Step 6: Settings test** — in `Settings.test.tsx` add `setAvatar: vi.fn(() => Promise.resolve())` and `addProfileWithoutSignIn: vi.fn(() => Promise.resolve('d2'))` to the api mock, stub `URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();` in `beforeEach`, and add:

```tsx
it('saves a new circle photo with the profile', async () => {
  render(<MemoryRouter><Settings me={son} members={[papa, son]} reload={vi.fn()} /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Выбрать фото'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Сын' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(setAvatar).toHaveBeenCalledWith(son, { kind: 'new', file, crop: { x: 0.5, y: 0.5, zoom: 1 } });
});
```

Update the toddler test expectation to `addProfileWithoutSignIn` returning `'d2'` and `setAvatar` called with `({ id: 'd2', household_id: 'h' }, { kind: 'keep' })`.

Run: `cd app && npx vitest run src/features/settings src/features/family src/lib && npx tsc -b && npm run lint`
Expected: PASS; lint 18.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat: let people choose and crop a photo for their circle"
```

---

### Task 4: Stories in the database

**Files:**
- Create: `supabase/migrations/20261015000300_stories.sql`
- Test: `app/tests/db/stories.test.ts`

**Interfaces:**
- Produces: tables `stories(id, household_id, member_id, kind, path, width, height, duration_ms, overlays, created_at, expires_at)` and `story_views(story_id, member_id, household_id, viewed_at, reaction)`; `my_member_in(h uuid) returns uuid`; RPC `drop_expired_stories() returns int`; `member_settings.notify.stories` default true.

- [ ] **Step 1: Failing DB test** `app/tests/db/stories.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createDb } from './harness';

const PAPA = '00000000-0000-0000-0000-0000000000f1';
const SON = '00000000-0000-0000-0000-0000000000f2';
const STRANGER = '00000000-0000-0000-0000-0000000000f3';
let db: PGlite;
let hh: string;
const m: Record<string, string> = {};

const rows = async <T>(u: string | null, sql: string, p: unknown[] = []) => (await asUser(db, u, sql, p)).rows as T[];
const post = async (u: string, id: string, member: string) => asUser(db, u,
  "insert into public.stories (id, household_id, member_id, kind, path, width, height) values ($1, $2, $3, 'photo', $4, 1080, 1920)",
  [id, hh, member, `${hh}/stories/${id}.jpg`]);
const S1 = '00000000-0000-0000-0000-00000000aa01';
const S2 = '00000000-0000-0000-0000-00000000aa02';

describe('stories', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    db = await createDb();
    for (const id of [PAPA, SON, STRANGER]) await addUser(db, id);
    hh = (await rows<{ id: string }>(PAPA, "select public.create_household('Губанчуки', 'Андрей', '#2F6FDB', 'father') as id"))[0].id;
    const code = (await rows<{ c: string }>(PAPA, "select public.create_invite($1, 'child') as c", [hh]))[0].c;
    await asUser(db, SON, "select public.accept_invite($1, 'Тёма', '#1FA463', 'son')", [code]);
    await asUser(db, STRANGER, "select public.create_household('Чужие', 'Пётр', '#2F6FDB')");
    for (const r of await rows<{ id: string; name: string }>(PAPA, 'select id, name from public.members')) m[r.name] = r.id;
  });

  it('shows a story to the family only, and only while it lives', async () => {
    await post(SON, S1, m['Тёма']);
    expect(await rows(PAPA, 'select id from public.stories')).toEqual([{ id: S1 }]);
    expect(await rows(STRANGER, 'select id from public.stories')).toEqual([]);
    await db.query("update public.stories set expires_at = now() - interval '1 minute'");
    expect(await rows(PAPA, 'select id from public.stories')).toEqual([]);
  });

  it('lets a person post only as themselves, into their family folder, without choosing the lifetime', async () => {
    await expect(post(SON, S1, m['Андрей'])).rejects.toThrow();
    await expect(asUser(db, SON, "insert into public.stories (household_id, member_id, kind, path, width, height) values ($1, $2, 'photo', 'elsewhere/x.jpg', 1, 1)", [hh, m['Тёма']])).rejects.toThrow();
    await expect(asUser(db, SON, "insert into public.stories (household_id, member_id, kind, path, width, height, expires_at) values ($1, $2, 'photo', $3, 1, 1, now() + interval '9 days')", [hh, m['Тёма'], `${hh}/stories/x.jpg`])).rejects.toThrow();
  });

  it('lets only the author change captions or delete, and never the file path', async () => {
    await post(SON, S1, m['Тёма']);
    await asUser(db, PAPA, `update public.stories set overlays = '[{"id":"a"}]'`);
    expect(await rows(SON, 'select overlays from public.stories')).toEqual([{ overlays: [] }]);
    await asUser(db, SON, `update public.stories set overlays = '[{"id":"a"}]'`);
    expect(await rows(SON, 'select overlays from public.stories')).toEqual([{ overlays: [{ id: 'a' }] }]);
    await expect(asUser(db, SON, "update public.stories set path = 'x'")).rejects.toThrow();
    await asUser(db, PAPA, 'delete from public.stories');
    expect((await rows(SON, 'select id from public.stories')).length).toBe(1);
    await asUser(db, SON, 'delete from public.stories');
    expect(await rows(SON, 'select id from public.stories')).toEqual([]);
  });

  it('records a view and one reaction per person, only for oneself', async () => {
    await post(SON, S1, m['Тёма']);
    const view = (u: string, member: string, reaction: string | null) => asUser(db, u,
      'insert into public.story_views (story_id, member_id, household_id, reaction) values ($1, $2, $3, $4) on conflict (story_id, member_id) do update set reaction = excluded.reaction',
      [S1, member, hh, reaction]);
    await view(PAPA, m['Андрей'], null);
    await view(PAPA, m['Андрей'], '❤️');
    await expect(view(PAPA, m['Тёма'], '😂')).rejects.toThrow();
    await expect(view(PAPA, m['Андрей'], '🤡')).rejects.toThrow();
    expect(await rows(SON, 'select member_id, reaction from public.story_views')).toEqual([{ member_id: m['Андрей'], reaction: '❤️' }]);
    expect(await rows(STRANGER, 'select * from public.story_views')).toEqual([]);
  });

  it('removes only expired stories of one\'s own family, and lets the family delete their files', async () => {
    await post(SON, S1, m['Тёма']);
    await post(PAPA, S2, m['Андрей']);
    for (const [u, id] of [[SON, S1], [PAPA, S2]]) await asUser(db, u, "insert into storage.objects (bucket_id, name, owner_id) values ('family', $1, $2)", [`${hh}/stories/${id}.jpg`, u]);
    await db.query('update public.stories set expires_at = now() - interval \'1 minute\' where id = $1', [S1]);
    expect(await rows(STRANGER, 'select public.drop_expired_stories() as n')).toEqual([{ n: 0 }]);
    expect(await rows(PAPA, 'select public.drop_expired_stories() as n')).toEqual([{ n: 1 }]);
    await asUser(db, PAPA, 'delete from storage.objects');
    expect(await rows(PAPA, 'select name from storage.objects')).toEqual([{ name: `${hh}/stories/${S2}.jpg` }]);
    await asUser(db, SON, 'delete from storage.objects');
    expect((await rows(PAPA, 'select name from storage.objects')).length).toBe(1);
  });

  it('turns story pushes on for everyone by default', async () => {
    expect(await rows(PAPA, "select notify->>'stories' as s from public.member_settings where member_id = $1", [m['Тёма']])).toEqual([{ s: 'true' }]);
  });
});
```

Run: `cd app && npx vitest run tests/db/stories.test.ts` — Expected: FAIL (`relation "public.stories" does not exist`).

- [ ] **Step 2: Migration** `supabase/migrations/20261015000300_stories.sql`

```sql
-- Stories: a photo or a video with editable captions that the family sees for 24 hours.
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  path text not null unique,
  width int not null check (width > 0),
  height int not null check (height > 0),
  duration_ms int check (duration_ms is null or duration_ms between 0 and 31000),
  overlays jsonb not null default '[]' check (jsonb_typeof(overlays) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index stories_household on public.stories (household_id, expires_at);

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  reaction text check (reaction in ('❤️', '😂', '😍', '😮', '😢', '🔥', '👍', '👏')),
  primary key (story_id, member_id)
);

-- The signed-in person's member row in a family.
create function public.my_member_in(h uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where household_id = h and user_id = auth.uid() and deleted_at is null
$$;

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

create policy "family sees live stories" on public.stories for select to authenticated
  using (household_id in (select public.my_household_ids()) and expires_at > now());
create policy "author posts" on public.stories for insert to authenticated
  with check (member_id = public.my_member_in(household_id) and path like household_id::text || '/stories/%');
create policy "author edits captions" on public.stories for update to authenticated
  using (member_id = public.my_member_in(household_id)) with check (member_id = public.my_member_in(household_id));
create policy "author deletes" on public.stories for delete to authenticated
  using (member_id = public.my_member_in(household_id));

create policy "family sees views" on public.story_views for select to authenticated
  using (household_id in (select public.my_household_ids()));
create policy "own view" on public.story_views for insert to authenticated
  with check (member_id = public.my_member_in(household_id)
    and household_id = (select s.household_id from public.stories s where s.id = story_id));
create policy "own reaction" on public.story_views for update to authenticated
  using (member_id = public.my_member_in(household_id)) with check (member_id = public.my_member_in(household_id));

-- Lifetime and file path are not the client's to choose or change.
revoke all on public.stories, public.story_views from anon;
revoke insert, update on public.stories, public.story_views from authenticated;
grant insert (id, household_id, member_id, kind, path, width, height, duration_ms, overlays) on public.stories to authenticated;
grant update (overlays) on public.stories to authenticated;
grant insert (story_id, member_id, household_id, reaction) on public.story_views to authenticated;
grant update (reaction) on public.story_views to authenticated;

-- Whoever opens the app first after a story expired removes it; the app then removes the files.
create function public.drop_expired_stories() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.stories where household_id in (select public.my_household_ids()) and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.drop_expired_stories() from public, anon;
grant execute on function public.drop_expired_stories() to authenticated;
revoke execute on function public.my_member_in(uuid) from public, anon;
grant execute on function public.my_member_in(uuid) to authenticated;

-- A story file without a live story (expired or never posted) may be removed by anyone in the family.
create policy "family media: dead story files go" on storage.objects for delete to authenticated
  using (
    bucket_id = 'family' and (storage.foldername(name))[2] = 'stories'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and not exists (select 1 from public.stories s where s.path = storage.objects.name)
  );

alter table public.member_settings alter column notify set default '{"requests":true,"offers":true,"votes":true,"shop":false,"quiet":true,"stories":true}';
update public.member_settings set notify = notify || '{"stories":true}' where not (notify ? 'stories');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stories, public.story_views;
  end if;
  if exists (select 1 from pg_proc where proname = 'notify_push') then
    create trigger stories_notify after insert on public.stories for each row execute function public.notify_push();
  end if;
end $$;
```

- [ ] **Step 3: Run DB tests**

Run: `cd app && npx vitest run tests/db`
Expected: PASS (all DB files, including the cleanup script test).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261015000300_stories.sql app/tests/db/stories.test.ts
git commit -m "feat: store family stories and their views for 24 hours"
```

---

### Task 5: Stories data layer

**Files:**
- Create: `app/src/features/stories/types.ts`, `app/src/features/stories/storiesApi.ts`, `app/src/features/stories/order.ts`, `app/src/features/stories/storiesContext.ts`, `app/src/features/stories/StoriesProvider.tsx`
- Modify: `app/src/app/App.tsx` (wrap screens in the provider)
- Test: `app/src/features/stories/order.test.ts`, `app/src/features/stories/StoriesProvider.test.tsx`

**Interfaces:**
- Consumes: `signedUrls`, `removeFiles`, `listFiles`, `uploadFile` (Task 1); `Member`.
- Produces:
  - `types.ts`: `REACTIONS`, `type Reaction`, `TEXT_COLORS`, `type TextStyle = 'plain' | 'box' | 'glass'`, `type Overlay`, `type Story`, `type StoryView`, `type Prepared = { blob: Blob; kind: 'photo' | 'video'; width: number; height: number; durationMs: number | null; trimmed: boolean }`.
  - `storiesApi.ts`: `loadStories(h): Promise<{ stories: Story[]; views: StoryView[] } | 'missing' | null>`, `postStory(me, prepared, overlays): Promise<Story>`, `saveOverlays(story, overlays)`, `deleteStory(story)`, `markViewed(story, me)`, `setReaction(story, me, reaction | null)`, `cleanupStories(h, now?)`, `storyUrls(stories): Promise<Map<string, string>>`.
  - `order.ts`: `liveStories(stories, now)`, `seenBy(views, meId): Set<string>`, `ringOf(memberId, stories, seen, meId): 'unseen' | 'seen' | 'none'`, `groupsFrom(order: string[], stories, startId, seen: Set<string>, meId: string): Array<{ memberId: string; stories: Story[] }>`, `firstUnseen(list, seen): number`, `step(pos: { g: number; i: number }, dir: 1 | -1, groups): { g: number; i: number } | null`, `ago(iso, now): string`.
  - `storiesContext.ts`: `StoriesContext`, `useStories()` returning `StoriesCtx = { available: boolean; ringOf(memberId: string): Ring; openViewer(memberId: string): void; compose(): void }`.
  - `StoriesProvider.tsx`: `<StoriesProvider me members>` — loads, reloads on `useSync().syncedAt`, on its own Realtime channel and every minute; tidies on start; owns the viewer and composer layers (Tasks 6 and 8 fill them in).

- [ ] **Step 1: Types** `app/src/features/stories/types.ts`

```ts
export const REACTIONS = ['❤️', '😂', '😍', '😮', '😢', '🔥', '👍', '👏'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const TEXT_COLORS = ['#FFFFFF', '#111111', '#C92A62', '#F2A900', '#1FA463', '#2F6FDB', '#8E5CF7', '#FF7A45'];
export type TextStyle = 'plain' | 'box' | 'glass';

// x, y: centre in fractions of the 9:16 frame; scale: size in fractions of its width; rotation in degrees.
export type Overlay =
  | { id: string; type: 'text'; text: string; x: number; y: number; scale: number; rotation: number; color: string; style: TextStyle }
  | { id: string; type: 'emoji'; char: string; x: number; y: number; scale: number; rotation: number };

export type Story = {
  id: string; household_id: string; member_id: string; kind: 'photo' | 'video'; path: string;
  width: number; height: number; duration_ms: number | null; overlays: Overlay[]; created_at: string; expires_at: string;
};
export type StoryView = { story_id: string; member_id: string; viewed_at: string; reaction: Reaction | null };
export type Prepared = { blob: Blob; kind: 'photo' | 'video'; width: number; height: number; durationMs: number | null; trimmed: boolean };
```

- [ ] **Step 2: Failing test for ordering** `app/src/features/stories/order.test.ts`

```ts
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
  it('steps through a person\'s stories and on to the next person, and ends after the last', () => {
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
```

Run: `cd app && npx vitest run src/features/stories/order.test.ts` — Expected: FAIL.

- [ ] **Step 3: Ordering** `app/src/features/stories/order.ts`

```ts
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
```

Run: `cd app && npx vitest run src/features/stories/order.test.ts` — Expected: PASS.

- [ ] **Step 4: API** `app/src/features/stories/storiesApi.ts`

```ts
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
  await supabase.from('story_views').upsert({ story_id: story.id, member_id: me.id, household_id: story.household_id }, { onConflict: 'story_id,member_id', ignoreDuplicates: true });
}

export async function setReaction(story: Story, me: Member, reaction: Reaction | null) {
  const { error } = await supabase.from('story_views').upsert({ story_id: story.id, member_id: me.id, household_id: story.household_id, reaction }, { onConflict: 'story_id,member_id' });
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
```

- [ ] **Step 5: Context** `app/src/features/stories/storiesContext.ts`

```ts
import { createContext, useContext } from 'react';
import type { Ring } from './order';

export type StoriesCtx = { available: boolean; ringOf: (memberId: string) => Ring; openViewer: (memberId: string) => void; compose: () => void };

// Without the provider (tests, screens before sign-in) stories are simply absent.
export const StoriesContext = createContext<StoriesCtx>({ available: false, ringOf: () => 'none', openViewer: () => {}, compose: () => {} });
export const useStories = () => useContext(StoriesContext);
```

- [ ] **Step 6: Failing provider test** `app/src/features/stories/StoriesProvider.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../family/useFamily';
import { useStories } from './storiesContext';

const api = vi.hoisted(() => ({ result: 'missing' as unknown }));
vi.mock('./storiesApi', () => ({
  loadStories: vi.fn(async () => api.result),
  cleanupStories: vi.fn(async () => {}),
  storyUrls: vi.fn(async () => new Map()),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() } }));

const me: Member = { id: 'me', household_id: 'h', user_id: 'u', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
function Probe() {
  const st = useStories();
  return <p>{st.available ? `есть: ${st.ringOf('son')}` : 'нет сторис'}</p>;
}

describe('StoriesProvider', () => {
  it('hides stories while the database has no stories table', async () => {
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><Probe /></StoriesProvider>);
    await waitFor(() => expect(screen.getByText('нет сторис')).toBeInTheDocument());
  });

  it('rings a member with a fresh story', async () => {
    api.result = { stories: [{ id: 's', household_id: 'h', member_id: 'son', kind: 'photo', path: 'h/stories/s.jpg', width: 1, height: 1, duration_ms: null, overlays: [], created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() }], views: [] };
    const { default: StoriesProvider } = await import('./StoriesProvider');
    render(<StoriesProvider me={me} members={[me]}><Probe /></StoriesProvider>);
    expect(await screen.findByText('есть: unseen')).toBeInTheDocument();
  });
});
```

Run: `cd app && npx vitest run src/features/stories/StoriesProvider.test.tsx` — Expected: FAIL.

- [ ] **Step 7: Provider** `app/src/features/stories/StoriesProvider.tsx`

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useSync } from '../../data/SyncProvider';
import type { Member } from '../family/useFamily';
import { cleanupStories, loadStories } from './storiesApi';
import { liveStories, ringOf, seenBy } from './order';
import { StoriesContext } from './storiesContext';
import type { Story, StoryView } from './types';

export default function StoriesProvider({ me, members, children }: { me: Member; members: Member[]; children: ReactNode }) {
  const { syncedAt } = useSync();
  const h = me.household_id;
  const [data, setData] = useState<{ stories: Story[]; views: StoryView[] } | null>(null);
  const [available, setAvailable] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [viewer, setViewer] = useState<string | null>(null);
  const [draft, setDraft] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const r = await loadStories(h).catch(() => null);
    if (r === 'missing') { setAvailable(false); return; }
    if (r) { setAvailable(true); setData(r); }
  }, [h]);

  useEffect(() => { reload(); }, [reload, syncedAt]);
  useEffect(() => { cleanupStories(h).catch(() => {}); }, [h]);
  // Rings follow the clock: a story that turns 24 hours old leaves within a minute.
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);
  // Its own channel: before the migration the tables are unknown, and that must not break family sync.
  useEffect(() => {
    const channel = supabase.channel(`stories-${h}`);
    for (const table of ['stories', 'story_views']) {
      channel.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `household_id=eq.${h}` } as never, () => { reload(); });
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [h, reload]);

  const live = useMemo(() => liveStories(data?.stories ?? [], now), [data, now]);
  const seen = useMemo(() => seenBy(data?.views ?? [], me.id), [data, me.id]);
  const value = useMemo(() => ({
    available,
    ringOf: (memberId: string) => ringOf(memberId, live, seen, me.id),
    openViewer: (memberId: string) => setViewer(memberId),
    // Runs inside the tap, so the phone lets the file picker open.
    compose: () => input.current?.click(),
  }), [available, live, seen, me.id]);

  return (
    <StoriesContext.Provider value={value}>
      {children}
      <input ref={input} type="file" accept="image/*,video/*" hidden aria-label="Файл для сторис"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setDraft(f); }} />
      {/* Task 6 renders the viewer for `viewer`, Task 8 the composer for `draft`. */}
      {viewer && draft === null ? null : null}
    </StoriesContext.Provider>
  );
}
```

(The last line is replaced in Tasks 6 and 8; `members` is used there.)

- [ ] **Step 8: Mount it** — in `App.tsx`, inside `SyncProvider`, wrap the `<div className="screen">…</div>` and `<TabBar … />` in `<StoriesProvider me={me} members={fam.members}>…</StoriesProvider>` (import `StoriesProvider from '../features/stories/StoriesProvider'`).

Run: `cd app && npx vitest run src/features/stories src/app && npx tsc -b && npm run lint`
Expected: PASS; lint 18 (if the placeholder line trips `no-unused-vars` for `members`, prefix it `_members` until Task 6).

- [ ] **Step 9: Commit**

```bash
git add app/src
git commit -m "feat: load family stories and work out who has new ones"
```

---

### Task 6: Rings on Home and the story viewer

**Files:**
- Create: `app/src/features/home/FamilyRow.tsx`, `app/src/features/stories/StoryFrame.tsx`, `app/src/features/stories/StoryViewer.tsx`, `app/src/features/stories/inkOn.ts`
- Modify: `app/src/features/home/HomePage.tsx`, `app/src/features/stories/StoriesProvider.tsx`, `app/src/styles/components.css`
- Test: `app/src/features/home/FamilyRow.test.tsx`, `app/src/features/stories/StoryViewer.test.tsx`

**Interfaces:**
- Consumes: `useStories`, order helpers, `storyUrls`, `markViewed`, `setReaction` (Task 5), `AvatarFace` (Task 2).
- Produces: `<FamilyRow me members />`; `<StoryFrame kind src overlays videoRef? onReady? children? />`; `<OverlayView o onPointerDown? selected? />` (exported from `StoryFrame.tsx`); `inkOn(hex): '#111111' | '#FFFFFF'`; `<StoryViewer groups start me members views urls now onViewed onReact onClose onOwn />` where `onOwn: { viewers(story): void; edit(story): void; remove(story): void; more(): void }`.

- [ ] **Step 1: Failing tests**

`app/src/features/home/FamilyRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import FamilyRow from './FamilyRow';
import { StoriesContext } from '../stories/storiesContext';
import type { Member } from '../family/useFamily';

const me: Member = { id: 'me', household_id: 'h', user_id: 'u1', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1, kin: 'mother' };
const son: Member = { ...me, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false, kin: 'son' };
const papa: Member = { ...me, id: 'papa', user_id: 'u3', name: 'Андрей', is_owner: false, kin: 'father' };

describe('FamilyRow', () => {
  it('puts me first with a «+», rings a person with a new story and opens it', async () => {
    const openViewer = vi.fn();
    const compose = vi.fn();
    const ring = (id: string) => (id === 'son' ? 'unseen' : id === 'papa' ? 'seen' : 'none') as const;
    render(<MemoryRouter><StoriesContext.Provider value={{ available: true, ringOf: ring, openViewer, compose }}><FamilyRow me={me} members={[papa, me, son]} /></StoriesContext.Provider></MemoryRouter>);
    const chips = screen.getAllByRole('button');
    expect(chips[0]).toHaveAccessibleName('Добавить сторис');
    await userEvent.click(chips[0]);
    expect(compose).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Тёма, новая сторис' }));
    expect(openViewer).toHaveBeenCalledWith('son');
    expect(screen.getByRole('button', { name: 'Андрей, сторис' })).toBeInTheDocument();
  });

  it('keeps plain circles when stories are not available', () => {
    render(<MemoryRouter><FamilyRow me={me} members={[me, son]} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /сторис/ })).toBeNull();
    expect(screen.getByText('Тёма')).toBeInTheDocument();
  });
});
```

`app/src/features/stories/StoryViewer.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StoryViewer from './StoryViewer';
import type { Member } from '../family/useFamily';
import type { Story } from './types';

const me: Member = { id: 'me', household_id: 'h', user_id: 'u1', name: 'Аня', color: '#E0457B', role: 'parent', is_owner: true, portion: 1 };
const son: Member = { ...me, id: 'son', user_id: 'u2', name: 'Тёма', role: 'child', is_owner: false };
const NOW = new Date('2026-10-15T20:00:00Z');
const st = (id: string, member: string, text = ''): Story => ({ id, household_id: 'h', member_id: member, kind: 'photo', path: `h/stories/${id}.jpg`, width: 1080, height: 1920, duration_ms: null,
  overlays: text ? [{ id: 't', type: 'text', text, x: 0.5, y: 0.5, scale: 0.08, rotation: 0, color: '#FFFFFF', style: 'plain' }] : [], created_at: '2026-10-15T18:00:00Z', expires_at: '2026-10-16T18:00:00Z' });

function show(over: Partial<Parameters<typeof StoryViewer>[0]> = {}) {
  const props = {
    groups: [{ memberId: 'son', stories: [st('a', 'son', 'Привет'), st('b', 'son')] }], start: { g: 0, i: 0 }, me, members: [me, son], views: [],
    urls: new Map([['h/stories/a.jpg', 'blob:a'], ['h/stories/b.jpg', 'blob:b']]), now: NOW,
    onViewed: vi.fn(), onReact: vi.fn(), onClose: vi.fn(), onOwn: { viewers: vi.fn(), edit: vi.fn(), remove: vi.fn(), more: vi.fn() }, ...over,
  };
  render(<StoryViewer {...props} />);
  return props;
}

describe('StoryViewer', () => {
  it('shows the story with its caption, who and when, and marks it seen once the photo is shown', () => {
    const p = show();
    expect(screen.getByRole('dialog', { name: 'Сторис: Тёма' })).toBeInTheDocument();
    expect(screen.getByText('Привет')).toBeInTheDocument();
    expect(screen.getByText('2 ч назад')).toBeInTheDocument();
    fireEvent.load(screen.getByTestId('story-media'));
    expect(p.onViewed).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('goes on after six seconds and closes after the last story', () => {
    vi.useFakeTimers();
    const p = show();
    fireEvent.load(screen.getByTestId('story-media'));
    act(() => { vi.advanceTimersByTime(6100); });
    expect(screen.queryByText('Привет')).toBeNull();
    fireEvent.load(screen.getByTestId('story-media'));
    act(() => { vi.advanceTimersByTime(6100); });
    expect(p.onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends a reaction and takes it back with a second tap', async () => {
    const p = show({ views: [{ story_id: 'a', member_id: 'me', viewed_at: '', reaction: '🔥' }] });
    await userEvent.click(screen.getByRole('button', { name: 'Реакция ❤️' }));
    expect(p.onReact).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), '❤️');
    await userEvent.click(screen.getByRole('button', { name: 'Реакция 🔥' }));
    expect(p.onReact).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), null);
  });

  it('shows the author views and actions instead of reactions', () => {
    show({ groups: [{ memberId: 'me', stories: [st('a', 'me')] }], views: [{ story_id: 'a', member_id: 'son', viewed_at: '', reaction: '❤️' }] });
    expect(screen.queryByRole('button', { name: 'Реакция ❤️' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Посмотрели: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить надписи' })).toBeInTheDocument();
  });
});
```

Run: `cd app && npx vitest run src/features/home/FamilyRow.test.tsx src/features/stories/StoryViewer.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Contrast helper** `app/src/features/stories/inkOn.ts`

```ts
// Text colour that reads on a plate of the given colour.
export function inkOn(hex: string): '#111111' | '#FFFFFF' {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? '#111111' : '#FFFFFF';
}
```

- [ ] **Step 3: Frame** `app/src/features/stories/StoryFrame.tsx`

```tsx
import type { PointerEvent, ReactNode, Ref } from 'react';
import type { Overlay } from './types';
import { inkOn } from './inkOn';

export function OverlayView({ o, selected, onPointerDown }: { o: Overlay; selected?: boolean; onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void }) {
  const style = { left: `${o.x * 100}%`, top: `${o.y * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`, fontSize: `${o.scale * 100}cqw` };
  if (o.type === 'emoji') return <div className={`sf-item emoji${selected ? ' on' : ''}`} style={style} onPointerDown={onPointerDown}>{o.char}</div>;
  const plate = o.style === 'box' ? { background: o.color, color: inkOn(o.color) } : { color: o.color };
  return <div className={`sf-item t-${o.style}${selected ? ' on' : ''}`} style={{ ...style, ...plate }} onPointerDown={onPointerDown}>{o.text}</div>;
}

// Always 9:16, so captions sit in the same place on every phone. The picture fits inside whole;
// for a photo the free space is filled with a blurred copy of it.
export default function StoryFrame({ kind, src, overlays, videoRef, onReady, children }: {
  kind: 'photo' | 'video'; src: string | null; overlays: Overlay[]; videoRef?: Ref<HTMLVideoElement>; onReady?: () => void; children?: ReactNode;
}) {
  return (
    <div className="sf">
      {src && kind === 'photo' ? (
        <>
          <img className="sf-bg" src={src} alt="" aria-hidden="true" />
          <img className="sf-media" data-testid="story-media" src={src} alt="" onLoad={onReady} />
        </>
      ) : null}
      {src && kind === 'video' ? <video className="sf-media" data-testid="story-media" ref={videoRef} src={src} playsInline preload="auto" onLoadedData={onReady} /> : null}
      {overlays.map((o) => <OverlayView key={o.id} o={o} />)}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Viewer** `app/src/features/stories/StoryViewer.tsx`

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Icon from '../shell/Icon';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import type { Member } from '../family/useFamily';
import StoryFrame from './StoryFrame';
import { ago, step, type Group } from './order';
import { REACTIONS, type Reaction, type Story, type StoryView } from './types';

const PHOTO_MS = 6000;
const HOLD_MS = 220;

type Own = { viewers: (s: Story) => void; edit: (s: Story) => void; remove: (s: Story) => void; more: () => void };

export default function StoryViewer({ groups, start, me, members, views, urls, now, onViewed, onReact, onClose, onOwn }: {
  groups: Group[]; start: { g: number; i: number }; me: Member; members: Member[]; views: StoryView[]; urls: Map<string, string>; now: Date;
  onViewed: (s: Story) => void; onReact: (s: Story, r: Reaction | null) => void; onClose: () => void; onOwn: Own;
}) {
  const [pos, setPos] = useState(start);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout>; held: boolean } | null>(null);
  const group = groups[pos.g];
  const story = group?.stories[pos.i];
  const author = members.find((m) => m.id === group?.memberId);
  const mine = story?.member_id === me.id;
  const myReaction = views.find((v) => v.story_id === story?.id && v.member_id === me.id)?.reaction ?? null;
  const seenCount = views.filter((v) => v.story_id === story?.id && v.member_id !== me.id).length;

  const go = (dir: 1 | -1) => {
    const next = step(pos, dir, groups);
    if (!next) { onClose(); return; }
    if (next.g !== pos.g || next.i !== pos.i) { setPos(next); setReady(false); setProgress(0); }
  };

  // Seen once it is actually on screen.
  useEffect(() => { if (ready && story && !mine) onViewed(story); }, [ready, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Photos run on a clock; videos report their own time.
  useEffect(() => {
    if (!ready || paused || !story || story.kind !== 'photo') return;
    const startAt = Date.now() - progress * PHOTO_MS;
    const t = window.setInterval(() => {
      const p = (Date.now() - startAt) / PHOTO_MS;
      if (p >= 1) { window.clearInterval(t); go(1); } else setProgress(p);
    }, 50);
    return () => window.clearInterval(t);
  }, [ready, paused, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = video.current;
    if (!v || !ready || story?.kind !== 'video') return;
    if (paused) { v.pause(); return; }
    v.muted = muted;
    // Sound first; a phone that refuses plays it silent and shows the sound button.
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  }, [ready, paused, muted, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story || !author) return null;

  const down = (e: PointerEvent) => {
    const t = setTimeout(() => { if (press.current) { press.current.held = true; setPaused(true); } }, HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t, held: false };
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.t);
    if (p.held) { setPaused(false); return; }
    if (e.clientY - p.y > 80) { onClose(); return; }
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <div className="story-layer" role="dialog" aria-modal="true" aria-label={`Сторис: ${author.name}`}>
      <StoryFrame kind={story.kind} src={urls.get(story.path) ?? null} overlays={story.overlays} videoRef={video} onReady={() => setReady(true)}>
        {story.kind === 'video' ? null : null}
        <div className="sv-tap" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; setPaused(false); }} />
        <div className="sv-top">
          <div className="sv-bars">
            {group.stories.map((s, i) => <i key={s.id}><b style={{ width: `${i < pos.i ? 100 : i === pos.i ? progress * 100 : 0}%` }} /></i>)}
          </div>
          <div className="sv-who">
            <span className="av sm" style={{ ['--c' as string]: memberColor(author.color) }} aria-hidden="true"><AvatarFace member={author} /></span>
            <b>{author.name}</b><small>{ago(story.created_at, now)}</small>
            <button type="button" className="sv-x" aria-label="Закрыть" onClick={onClose}><Icon name="x" /></button>
          </div>
        </div>
        {muted && story.kind === 'video' ? <button type="button" className="sv-sound" onClick={() => setMuted(false)}>🔇 Включить звук</button> : null}
      </StoryFrame>
      {mine ? (
        <div className="sv-bottom">
          <button type="button" className="sv-pill" aria-label={`Посмотрели: ${seenCount}`} onClick={() => onOwn.viewers(story)}>👁 {seenCount}</button>
          <button type="button" className="sv-pill" onClick={() => onOwn.edit(story)}>Изменить надписи</button>
          <button type="button" className="sv-pill" onClick={onOwn.more}>Ещё сторис</button>
          <button type="button" className="sv-pill" aria-label="Удалить сторис" onClick={() => onOwn.remove(story)}>Удалить</button>
        </div>
      ) : (
        <div className="sv-bottom sv-react" role="group" aria-label="Реакции">
          {REACTIONS.map((r) => (
            <button key={r} type="button" aria-label={`Реакция ${r}`} aria-pressed={myReaction === r} onClick={() => onReact(story, myReaction === r ? null : r)}>{r}</button>
          ))}
        </div>
      )}
    </div>
  );
}
```

For videos, add on the `<video>` (through StoryFrame) progress: in the viewer, after `useRef`, add an effect that subscribes to `timeupdate`/`ended` of `video.current` when `story.kind === 'video'`:

```tsx
  useEffect(() => {
    const v = video.current;
    if (!v || story?.kind !== 'video') return;
    const tick = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
    const end = () => go(1);
    v.addEventListener('timeupdate', tick);
    v.addEventListener('ended', end);
    return () => { v.removeEventListener('timeupdate', tick); v.removeEventListener('ended', end); };
  }, [story?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps
```

and remove the placeholder `{story.kind === 'video' ? null : null}` line.

- [ ] **Step 5: CSS** (append to `components.css`)

```css
/* Stories: full-screen black layer, a 9:16 frame, captions sized from the frame width. */
.story-layer { position: fixed; inset: 0; z-index: 70; display: grid; grid-template-rows: 1fr auto; justify-items: center; background: #000; color: #FFFFFF; touch-action: none; }
.story-layer .sheet-backdrop { z-index: 75; }
.story-layer .sheet { z-index: 76; }
.sf { position: relative; align-self: center; width: min(100vw, calc((100dvh - 72px) * 9 / 16)); aspect-ratio: 9 / 16; overflow: hidden; container-type: inline-size; background: #000; }
.sf-bg { position: absolute; inset: -10%; width: 120%; height: 120%; object-fit: cover; filter: blur(24px) brightness(0.55); }
.sf-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.sf-item { position: absolute; max-width: 90cqw; white-space: pre-wrap; text-align: center; font: 800 1em/1.15 var(--font); user-select: none; touch-action: none; }
.sf-item.t-plain { text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55); }
.sf-item.t-box, .sf-item.t-glass { padding: 0.15em 0.45em; border-radius: 0.35em; }
.sf-item.t-glass { background: rgba(0, 0, 0, 0.45); }
.sf-item.on { outline: 2px dashed rgba(255, 255, 255, 0.8); outline-offset: 6px; }
.sv-tap { position: absolute; inset: 0; }
.sv-top { position: absolute; left: 0; right: 0; top: 0; padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 24px; background: linear-gradient(rgba(0, 0, 0, 0.45), transparent); }
.sv-bars { display: flex; gap: 4px; }
.sv-bars i { flex: 1; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.35); overflow: hidden; }
.sv-bars b { display: block; height: 100%; background: #FFFFFF; }
.sv-who { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 14px; }
.sv-who small { color: rgba(255, 255, 255, 0.75); }
.sv-x { margin-left: auto; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: none; color: #FFFFFF; cursor: pointer; }
.sv-sound { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(0, 0, 0, 0.55); color: #FFFFFF; font: 600 14px var(--font); }
.sv-bottom { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: 100%; padding: 12px 10px calc(12px + env(safe-area-inset-bottom, 0px)); }
.sv-react button { width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.12); font-size: 24px; cursor: pointer; }
.sv-react button[aria-pressed="true"] { background: rgba(255, 255, 255, 0.85); transform: scale(1.12); }
.sv-pill { min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.14); color: #FFFFFF; font: 600 14px var(--font); cursor: pointer; }
.fam { position: relative; }
.fam .av { position: relative; }
.fam.ring-unseen .av { box-shadow: 0 0 0 3px var(--k-bg), 0 0 0 6px var(--k-primary); }
.fam.ring-seen .av { box-shadow: 0 0 0 3px var(--k-bg), 0 0 0 5px var(--k-rule); }
.fam-plus { position: absolute; right: -2px; bottom: -2px; width: 22px; height: 22px; display: grid; place-items: center; border: 2px solid var(--k-bg); border-radius: 50%; background: var(--k-primary); color: var(--k-primary-ink); }
.fam-plus .ic { width: 14px; height: 14px; }
```

- [ ] **Step 6: Family row** `app/src/features/home/FamilyRow.tsx` — moves the row out of HomePage:

```tsx
import { Link } from 'react-router-dom';
import Icon from '../shell/Icon';
import AvatarFace from '../family/AvatarFace';
import { memberColor } from '../family/colors';
import { kinLine } from '../family/kin';
import type { Member } from '../family/useFamily';
import { useStories } from '../stories/storiesContext';

// Me first, like «Моя история» in Telegram; a ring shows who has a story.
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
      {me.role === 'parent' && members.length < 4 ? (
        <Link className="fam fam-add" to="/settings"><span className="av" aria-hidden="true"><Icon name="plus" /></span><b>Позвать</b><small>ссылкой</small></Link>
      ) : null}
    </div>
  );
}
```

In `HomePage.tsx` replace the whole `<div className="family" …>…</div>` block with `<FamilyRow me={me} members={members} />` and drop imports that become unused.

- [ ] **Step 7: Viewer in the provider** — in `StoriesProvider.tsx` replace the placeholder line with:

```tsx
      {viewer && data ? (
        <ViewerHost me={me} members={members} startId={viewer} stories={live} views={data.views} now={now}
          onClose={() => setViewer(null)} onChanged={reload} onCompose={() => { setViewer(null); input.current?.click(); }} />
      ) : null}
```

and add below the provider in the same file:

```tsx
function ViewerHost({ me, members, startId, stories, views, now, onClose, onChanged, onCompose }: {
  me: Member; members: Member[]; startId: string; stories: Story[]; views: StoryView[]; now: Date; onClose: () => void; onChanged: () => void; onCompose: () => void;
}) {
  const order = [me.id, ...members.filter((m) => m.id !== me.id).map((m) => m.id)];
  const [groups] = useState(() => groupsFrom(order, stories, startId, seenBy(views, me.id), me.id));
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  const [myViews, setMyViews] = useState(views);
  useEffect(() => { setMyViews(views); }, [views]);
  useEffect(() => { storyUrls(groups.flatMap((g) => g.stories)).then(setUrls).catch(() => setUrls(new Map())); }, [groups]);
  if (!urls || !groups.length) return null;
  const seen = seenBy(views, me.id);
  const start = { g: 0, i: groups[0].memberId === me.id ? 0 : firstUnseen(groups[0].stories, seen) };
  return (
    <StoryViewer groups={groups} start={start} me={me} members={members} views={myViews} urls={urls} now={now} onClose={onClose}
      onViewed={(s) => { markViewed(s, me).catch(() => {}); }}
      onReact={(s, r) => {
        setMyViews((v) => [...v.filter((x) => !(x.story_id === s.id && x.member_id === me.id)), { story_id: s.id, member_id: me.id, viewed_at: new Date().toISOString(), reaction: r }]);
        setReaction(s, me, r).then(onChanged).catch(() => {});
      }}
      onOwn={{ viewers: () => {}, edit: () => {}, remove: () => {}, more: onCompose }} />
  );
}
```

Imports to add: `StoryViewer`, `groupsFrom, firstUnseen` from `./order`, `markViewed, setReaction, storyUrls` from `./storiesApi`. (Task 8 fills `viewers`, `edit`, `remove`.)

- [ ] **Step 8: Run tests**

Run: `cd app && npx vitest run src/features/home src/features/stories && npx tsc -b && npm run lint`
Expected: PASS; lint 18.

- [ ] **Step 9: Commit**

```bash
git add app/src
git commit -m "feat: ring family circles with new stories and show them full screen"
```

---

### Task 7: Editor state and gesture maths

**Files:**
- Create: `app/src/features/stories/editorState.ts`, `app/src/features/stories/gestures.ts`
- Test: `app/src/features/stories/editorState.test.ts`, `app/src/features/stories/gestures.test.ts`

**Interfaces:**
- Consumes: `Overlay`, `TextStyle`, `TEXT_COLORS` (Task 5).
- Produces:
  - `editorState.ts`: `type EditorState = { items: Overlay[]; selected: string | null; editing: string | null }`, `type EditorAction = { t: 'add-text' } | { t: 'add-emoji'; char: string } | { t: 'patch'; id: string; patch: Partial<Overlay> } | { t: 'remove'; id: string } | { t: 'select'; id: string | null } | { t: 'edit'; id: string } | { t: 'done' }`, `editor(state, action): EditorState`, `initialEditor(items: Overlay[]): EditorState`, `EMOJIS: string[]` (48).
  - `gestures.ts`: `type Pt = { x: number; y: number }`, `moved(o, dx, dy, frame: { w: number; h: number })`, `pinched(o, a0, b0, a1, b1)`, `overTrash(p: Pt, frame: { w: number; h: number }): boolean`.

- [ ] **Step 1: Failing tests**

`editorState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { editor, initialEditor } from './editorState';

describe('story editor', () => {
  it('adds a caption in the middle and opens it for typing', () => {
    const s = editor(initialEditor([]), { t: 'add-text' });
    expect(s.items).toEqual([expect.objectContaining({ type: 'text', text: '', x: 0.5, y: 0.5, color: '#FFFFFF', style: 'plain' })]);
    expect(s.editing).toBe(s.items[0].id);
  });
  it('drops a caption left empty when typing is done', () => {
    let s = editor(initialEditor([]), { t: 'add-text' });
    s = editor(s, { t: 'done' });
    expect(s.items).toEqual([]);
  });
  it('keeps a typed caption, changes it, and removes it', () => {
    let s = editor(initialEditor([]), { t: 'add-text' });
    const id = s.items[0].id;
    s = editor(s, { t: 'patch', id, patch: { text: 'Привет' } });
    s = editor(s, { t: 'done' });
    expect(s.items[0]).toMatchObject({ text: 'Привет' });
    s = editor(s, { t: 'patch', id, patch: { color: '#C92A62', style: 'box' } });
    expect(s.items[0]).toMatchObject({ color: '#C92A62', style: 'box' });
    s = editor(s, { t: 'remove', id });
    expect(s.items).toEqual([]);
  });
  it('places a sticker selected and above the rest', () => {
    const s = editor(editor(initialEditor([]), { t: 'add-emoji', char: '🎉' }), { t: 'add-emoji', char: '🔥' });
    expect(s.items.map((o) => (o.type === 'emoji' ? o.char : ''))).toEqual(['🎉', '🔥']);
    expect(s.selected).toBe(s.items[1].id);
  });
});
```

`gestures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { moved, overTrash, pinched } from './gestures';
import type { Overlay } from './types';

const o: Overlay = { id: 'a', type: 'emoji', char: '🔥', x: 0.5, y: 0.5, scale: 0.2, rotation: 0 };
const frame = { w: 360, h: 640 };

describe('sticker gestures', () => {
  it('moves by the finger, in frame fractions, and stays inside the frame', () => {
    expect(moved(o, 36, -64, frame)).toMatchObject({ x: 0.6, y: 0.4 });
    expect(moved(o, 1000, 1000, frame)).toMatchObject({ x: 1, y: 1 });
  });
  it('scales by the change of distance and turns by the change of angle between two fingers', () => {
    const p = pinched(o, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 });
    expect(p.scale).toBeCloseTo(0.4);
    expect(p.rotation).toBeCloseTo(90);
  });
  it('keeps a sticker from growing past the frame or vanishing', () => {
    expect(pinched(o, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }).scale).toBe(1.5);
    expect(pinched(o, { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }).scale).toBe(0.04);
  });
  it('knows when a dragged sticker is over the bin at the bottom centre', () => {
    expect(overTrash({ x: 180, y: 600 }, frame)).toBe(true);
    expect(overTrash({ x: 40, y: 600 }, frame)).toBe(false);
    expect(overTrash({ x: 180, y: 300 }, frame)).toBe(false);
  });
});
```

Run: `cd app && npx vitest run src/features/stories/editorState.test.ts src/features/stories/gestures.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementation**

`gestures.ts`:

```ts
import type { Overlay } from './types';

export type Pt = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export function moved<T extends Overlay>(o: T, dx: number, dy: number, frame: { w: number; h: number }): T {
  return { ...o, x: clamp(o.x + dx / frame.w, 0, 1), y: clamp(o.y + dy / frame.h, 0, 1) };
}

// a0/b0: the two fingers when the pinch began, a1/b1: now; o is the item as it was at the start.
export function pinched<T extends Overlay>(o: T, a0: Pt, b0: Pt, a1: Pt, b1: Pt): T {
  const k = dist(a1, b1) / Math.max(1, dist(a0, b0));
  return { ...o, scale: clamp(o.scale * k, 0.04, 1.5), rotation: o.rotation + angle(a1, b1) - angle(a0, b0) };
}

export const overTrash = (p: Pt, frame: { w: number; h: number }) => p.y > frame.h - 96 && Math.abs(p.x - frame.w / 2) < 64;
```

`editorState.ts`:

```ts
import type { Overlay } from './types';

export type EditorState = { items: Overlay[]; selected: string | null; editing: string | null };
export type EditorAction =
  | { t: 'add-text' } | { t: 'add-emoji'; char: string } | { t: 'patch'; id: string; patch: Partial<Overlay> }
  | { t: 'remove'; id: string } | { t: 'select'; id: string | null } | { t: 'edit'; id: string } | { t: 'done' };

export const EMOJIS = [
  '😂', '😍', '🥰', '😎', '🤩', '😜', '🤔', '😴', '😋', '🥳', '😱', '🙈',
  '❤️', '🔥', '✨', '🎉', '👍', '👏', '💪', '🙏', '👀', '💯', '⭐', '🌈',
  '☀️', '🌧️', '❄️', '🍂', '🌸', '🎄', '🎂', '🍕', '🍔', '🍝', '🍰', '☕',
  '🏠', '🚗', '⚽', '🎮', '📚', '🎵', '🐶', '🐱', '👶', '👨‍👩‍👦', '🛒', '💤',
];

const id = () => Math.random().toString(36).slice(2, 10);
export const initialEditor = (items: Overlay[]): EditorState => ({ items, selected: null, editing: null });

export function editor(s: EditorState, a: EditorAction): EditorState {
  switch (a.t) {
    case 'add-text': {
      const o: Overlay = { id: id(), type: 'text', text: '', x: 0.5, y: 0.5, scale: 0.08, rotation: 0, color: '#FFFFFF', style: 'plain' };
      return { items: [...s.items, o], selected: o.id, editing: o.id };
    }
    case 'add-emoji': {
      const o: Overlay = { id: id(), type: 'emoji', char: a.char, x: 0.5, y: 0.45, scale: 0.2, rotation: 0 };
      return { items: [...s.items, o], selected: o.id, editing: null };
    }
    case 'patch':
      return { ...s, items: s.items.map((o) => (o.id === a.id ? ({ ...o, ...a.patch } as Overlay) : o)) };
    case 'remove':
      return { items: s.items.filter((o) => o.id !== a.id), selected: null, editing: null };
    case 'select':
      return { ...s, selected: a.id };
    case 'edit':
      return { ...s, selected: a.id, editing: a.id };
    case 'done': {
      const items = s.items.filter((o) => o.type !== 'text' || o.text.trim());
      return { items, selected: null, editing: null };
    }
  }
}
```

Run: `cd app && npx vitest run src/features/stories` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/features/stories
git commit -m "feat: add the story editor state and sticker gestures"
```

---

### Task 8: Composer, caption editing and own-story actions

**Files:**
- Create: `app/src/features/stories/StoryEditor.tsx`, `app/src/features/stories/prepare.ts`, `app/src/features/stories/ViewersSheet.tsx`
- Modify: `app/src/features/stories/StoriesProvider.tsx`, `app/src/styles/components.css`
- Test: `app/src/features/stories/StoryEditor.test.tsx`, `app/src/features/stories/prepare.test.ts`

**Interfaces:**
- Consumes: `editor`, `EMOJIS`, `moved`, `pinched`, `overTrash` (Task 7); `StoryFrame`, `OverlayView` (Task 6); `postStory`, `saveOverlays`, `deleteStory` (Task 5); `resizePhoto` (Task 3); `Sheet` (`../menu/Sheet`); `useToast`.
- Produces: `prepare.ts`: `kindOf(file: File): 'photo' | 'video' | null`, `preparePhoto(file): Promise<Prepared>`, `MAX_VIDEO_S = 30`, `MAX_FILE = 52_428_800`, `videoDecision({ canConvert, durationS, size }): 'convert' | 'original' | 'refuse'`, `prepareVideo(file, onProgress): Promise<Prepared>` (Task 9 fills it; here it throws `video_later`); `<StoryEditor kind src initial status publishLabel error onPublish onClose />`; `<ViewersSheet story views members onClose />`.

- [ ] **Step 1: Failing tests**

`prepare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kindOf, videoDecision } from './prepare';

describe('preparing a story file', () => {
  it('tells photos from videos and refuses anything else', () => {
    expect(kindOf(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe('photo');
    expect(kindOf(new File([''], 'a.mov', { type: 'video/quicktime' }))).toBe('video');
    expect(kindOf(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
  });
  it('shrinks a video when the phone can, sends a short light original when it cannot, refuses the rest', () => {
    expect(videoDecision({ canConvert: true, durationS: 95, size: 300e6 })).toBe('convert');
    expect(videoDecision({ canConvert: false, durationS: 28, size: 40e6 })).toBe('original');
    expect(videoDecision({ canConvert: false, durationS: 45, size: 20e6 })).toBe('refuse');
    expect(videoDecision({ canConvert: false, durationS: 20, size: 60e6 })).toBe('refuse');
  });
});
```

`StoryEditor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StoryEditor from './StoryEditor';

describe('StoryEditor', () => {
  it('adds a caption and a sticker and publishes them', async () => {
    const onPublish = vi.fn(async () => {});
    render(<StoryEditor kind="photo" src="blob:x" initial={[]} status="" publishLabel="Опубликовать" error="" onPublish={onPublish} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Надпись' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Текст надписи' }), 'Привет');
    await userEvent.click(screen.getByRole('button', { name: 'Цвет #C92A62' }));
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await userEvent.click(screen.getByRole('button', { name: 'Наклейка' }));
    await userEvent.click(screen.getByRole('button', { name: '🎉' }));
    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(onPublish).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', text: 'Привет', color: '#C92A62' }),
      expect.objectContaining({ type: 'emoji', char: '🎉' }),
    ]);
  });

  it('asks before throwing away a story with captions', async () => {
    const onClose = vi.fn();
    render(<StoryEditor kind="photo" src="blob:x" initial={[{ id: 'a', type: 'emoji', char: '🔥', x: 0.5, y: 0.5, scale: 0.2, rotation: 0 }]} status="" publishLabel="Опубликовать" error="" onPublish={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Выйти без публикации' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows why a file cannot be posted', () => {
    render(<StoryEditor kind="photo" src={null} initial={[]} status="" publishLabel="Опубликовать" error="Этот файл не фото и не видео." onPublish={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Этот файл не фото и не видео.');
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
  });
});
```

Run: `cd app && npx vitest run src/features/stories/prepare.test.ts src/features/stories/StoryEditor.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Preparation** `app/src/features/stories/prepare.ts`

```ts
import { resizePhoto } from '../../lib/image';
import type { Prepared } from './types';

export const MAX_VIDEO_S = 30;
export const MAX_FILE = 52_428_800;

export function kindOf(file: File): 'photo' | 'video' | null {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

export function videoDecision(p: { canConvert: boolean; durationS: number; size: number }): 'convert' | 'original' | 'refuse' {
  if (p.canConvert) return 'convert';
  return p.durationS <= MAX_VIDEO_S + 0.5 && p.size <= MAX_FILE ? 'original' : 'refuse';
}

export async function preparePhoto(file: File): Promise<Prepared> {
  const r = await resizePhoto(file, 1080, 0.82);
  return { blob: r.blob, kind: 'photo', width: r.width, height: r.height, durationMs: null, trimmed: false };
}

// Filled in by Task 9.
export async function prepareVideo(_file: File, _onProgress: (p: number) => void): Promise<Prepared> {
  throw new Error('video_later');
}
```

- [ ] **Step 3: Editor** `app/src/features/stories/StoryEditor.tsx`

```tsx
import { useReducer, useRef, useState, type PointerEvent } from 'react';
import Icon from '../shell/Icon';
import Sheet from '../menu/Sheet';
import StoryFrame, { OverlayView } from './StoryFrame';
import { EMOJIS, editor, initialEditor } from './editorState';
import { moved, overTrash, pinched, type Pt } from './gestures';
import { TEXT_COLORS, type Overlay, type TextStyle } from './types';

const STYLES: TextStyle[] = ['plain', 'box', 'glass'];
const STYLE_NAME: Record<TextStyle, string> = { plain: 'Без фона', box: 'На плашке', glass: 'На тёмном' };

type Drag = { id: string; start: Overlay; pts: Map<number, Pt>; first: Map<number, Pt>; moved: boolean };

export default function StoryEditor({ kind, src, initial, status, publishLabel, error, onPublish, onClose }: {
  kind: 'photo' | 'video'; src: string | null; initial: Overlay[]; status: string; publishLabel: string; error: string;
  onPublish: (items: Overlay[]) => Promise<void>; onClose: () => void;
}) {
  const [s, dispatch] = useReducer(editor, initial, initialEditor);
  const [emoji, setEmoji] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [trash, setTrash] = useState<'off' | 'shown' | 'hot'>('off');
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const editing = s.items.find((o) => o.id === s.editing);

  const box = () => { const r = frame.current!.getBoundingClientRect(); return { r, w: r.width, h: r.height }; };
  const down = (o: Overlay) => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    if (drag.current?.id === o.id) {
      drag.current.pts.set(e.pointerId, p);
      drag.current.first = new Map(drag.current.pts);
      drag.current.start = o;
      return;
    }
    drag.current = { id: o.id, start: o, pts: new Map([[e.pointerId, p]]), first: new Map([[e.pointerId, p]]), moved: false };
    dispatch({ t: 'select', id: o.id });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { r, w, h } = box();
    const keys = [...d.pts.keys()];
    if (keys.length >= 2) {
      const [a, b] = keys;
      dispatch({ t: 'patch', id: d.id, patch: pinched(d.start, d.first.get(a)!, d.first.get(b)!, d.pts.get(a)!, d.pts.get(b)!) });
      d.moved = true;
      return;
    }
    const f = d.first.get(keys[0])!;
    const p = d.pts.get(keys[0])!;
    if (Math.hypot(p.x - f.x, p.y - f.y) > 6) d.moved = true;
    if (!d.moved) return;
    dispatch({ t: 'patch', id: d.id, patch: moved(d.start, p.x - f.x, p.y - f.y, { w, h }) });
    setTrash(overTrash({ x: p.x - r.left, y: p.y - r.top }, { w, h }) ? 'hot' : 'shown');
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.pts.delete(e.pointerId);
    if (d.pts.size) { d.first = new Map(d.pts); d.start = s.items.find((o) => o.id === d.id) ?? d.start; return; }
    drag.current = null;
    const o = s.items.find((x) => x.id === d.id);
    if (trash === 'hot') dispatch({ t: 'remove', id: d.id });
    else if (!d.moved && o?.type === 'text') dispatch({ t: 'edit', id: d.id });
    setTrash('off');
  };

  const publish = async () => { setBusy(true); try { await onPublish(s.items); } finally { setBusy(false); } };
  const close = () => (s.items.length && !leaving ? setLeaving(true) : onClose());

  return (
    <div className="story-layer se" role="dialog" aria-modal="true" aria-label="Новая сторис">
      <div ref={frame} className="se-frame" onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => dispatch({ t: 'select', id: null })}>
        <StoryFrame kind={kind} src={src} overlays={[]}>
          {s.items.map((o) => (o.id === s.editing ? null : <OverlayView key={o.id} o={o} selected={o.id === s.selected} onPointerDown={down(o)} />))}
          {kind === 'video' && src ? null : null}
        </StoryFrame>
        {trash !== 'off' ? <span className={`se-trash${trash === 'hot' ? ' hot' : ''}`} aria-hidden="true">🗑</span> : null}
      </div>
      <div className="se-tools">
        <button type="button" className="sv-x" aria-label="Закрыть" onClick={close}><Icon name="x" /></button>
        <button type="button" className="sv-pill" aria-label="Надпись" onClick={() => dispatch({ t: 'add-text' })}>Aa</button>
        <button type="button" className="sv-pill" aria-label="Наклейка" onClick={() => setEmoji(true)}>☺</button>
      </div>
      <div className="sv-bottom se-bottom">
        {error ? <p className="se-error" role="alert">{error}</p> : null}
        <button type="button" className="btn se-publish" disabled={busy || !!error || !src} onClick={publish}>{busy && status ? status : publishLabel}</button>
      </div>
      {editing && editing.type === 'text' ? (
        <div className="se-type">
          <textarea aria-label="Текст надписи" autoFocus value={editing.text} maxLength={200}
            style={editing.style === 'box' ? { color: '#111111', background: editing.color } : { color: editing.color }}
            onChange={(e) => dispatch({ t: 'patch', id: editing.id, patch: { text: e.target.value } })} />
          <div className="se-colors">
            {TEXT_COLORS.map((c) => <button key={c} type="button" aria-label={`Цвет ${c}`} aria-pressed={editing.color === c} style={{ background: c }} onClick={() => dispatch({ t: 'patch', id: editing.id, patch: { color: c } })} />)}
          </div>
          <div className="se-row">
            <button type="button" className="sv-pill" onClick={() => dispatch({ t: 'patch', id: editing.id, patch: { style: STYLES[(STYLES.indexOf(editing.style) + 1) % STYLES.length] } })}>{STYLE_NAME[editing.style]}</button>
            <button type="button" className="sv-pill" onClick={() => dispatch({ t: 'done' })}>Готово</button>
          </div>
        </div>
      ) : null}
      {emoji ? (
        <Sheet title="Наклейки" onClose={() => setEmoji(false)}>
          <div className="se-emojis">
            {EMOJIS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { dispatch({ t: 'add-emoji', char: c }); setEmoji(false); }}>{c}</button>)}
          </div>
        </Sheet>
      ) : null}
      {leaving ? (
        <Sheet title="Выйти без публикации?" sub="Надписи и наклейки пропадут." onClose={() => setLeaving(false)}
          actions={<div className="btns fill"><button type="button" className="btn soft" onClick={() => setLeaving(false)}>Остаться</button><button type="button" className="btn" onClick={onClose}>Выйти без публикации</button></div>}>
          <span />
        </Sheet>
      ) : null}
    </div>
  );
}
```

Remove the placeholder line `{kind === 'video' && src ? null : null}` (videos play muted on loop in the editor via StoryFrame — add `useEffect` that calls `play()` on the frame's video with `muted = true; loop = true` once Task 9 lands; for now StoryFrame shows the first frame).

CSS (append):

```css
.se { grid-template-rows: 1fr auto; }
.se-frame { position: relative; align-self: center; touch-action: none; }
.se-tools { position: fixed; top: calc(8px + env(safe-area-inset-top, 0px)); left: 8px; right: 8px; display: flex; gap: 8px; align-items: center; }
.se-tools .sv-x { margin-left: 0; margin-right: auto; }
.se-tools .sv-pill { min-width: 44px; font-size: 17px; }
.se-trash { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%; background: rgba(0, 0, 0, 0.5); font-size: 26px; transition: transform 150ms var(--ease); }
.se-trash.hot { transform: translateX(-50%) scale(1.25); background: var(--k-urgent); }
.se-bottom { flex-direction: column; align-items: stretch; max-width: 420px; }
.se-publish { width: 100%; }
.se-error { margin: 0 0 8px; text-align: center; color: #FFD7D7; font-size: 14px; }
.se-type { position: fixed; inset: 0; z-index: 72; display: grid; align-content: center; justify-items: center; gap: 14px; padding: 24px; background: rgba(0, 0, 0, 0.6); }
.se-type textarea { width: min(92vw, 420px); min-height: 90px; padding: 10px 14px; border: 0; border-radius: 14px; background: transparent; font: 800 28px/1.2 var(--font); text-align: center; resize: none; outline: none; }
.se-colors { display: flex; gap: 10px; }
.se-colors button { width: 30px; height: 30px; border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer; }
.se-colors button[aria-pressed="true"] { transform: scale(1.2); border-color: #FFFFFF; }
.se-row { display: flex; gap: 10px; }
.se-emojis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 0 12px 16px; }
.se-emojis button { height: 52px; border: 0; border-radius: 12px; background: none; font-size: 30px; cursor: pointer; }
```

- [ ] **Step 4: Viewers sheet** `app/src/features/stories/ViewersSheet.tsx`

```tsx
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
              <span style={{ fontSize: 22 }} aria-label={v.reaction ? `реакция ${v.reaction}` : undefined}>{v.reaction ?? ''}</span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 5: Wire the composer and own actions in `StoriesProvider.tsx`**

Add state and the composer host:

```tsx
  const [edit, setEdit] = useState<Story | null>(null);
```

Replace the `draft` handling by rendering, after the viewer block:

```tsx
      {draft ? <ComposerHost me={me} file={draft} onDone={() => { setDraft(null); reload(); }} /> : null}
      {edit ? <CaptionHost story={edit} onDone={() => { setEdit(null); reload(); }} /> : null}
```

In `ViewerHost` props add `onEdit: (s: Story) => void` and pass from the provider `onEdit={(s) => { setViewer(null); setEdit(s); }}`; fill `onOwn`:

```tsx
      onOwn={{
        viewers: (s) => setWatch(s),
        edit: onEdit,
        remove: (s) => setDoomed(s),
        more: onCompose,
      }}
```

with, inside `ViewerHost`, `const [watch, setWatch] = useState<Story | null>(null); const [doomed, setDoomed] = useState<Story | null>(null); const toast = useToast();` and after `<StoryViewer …/>` (wrap both in a fragment):

```tsx
      {watch ? <ViewersSheet story={watch} views={myViews} members={members} onClose={() => setWatch(null)} /> : null}
      {doomed ? (
        <Sheet title="Удалить сторис?" sub="Её больше никто не увидит." onClose={() => setDoomed(null)}
          actions={<div className="btns fill"><button type="button" className="btn soft" onClick={() => setDoomed(null)}>Оставить</button>
            <button type="button" className="btn" onClick={async () => { try { await deleteStory(doomed); toast({ text: 'Сторис удалена' }); onChanged(); onClose(); } catch { toast({ text: 'Не получилось удалить. Проверьте интернет.' }); } }}>Удалить</button></div>}>
          <span />
        </Sheet>
      ) : null}
```

Composer host (same file):

```tsx
function ComposerHost({ me, file, onDone }: { me: Member; file: File; onDone: () => void }) {
  const kind = kindOf(file);
  const toast = useToast();
  const [src] = useState(() => (kind ? URL.createObjectURL(file) : null));
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(kind ? '' : 'Этот файл не фото и не видео.');
  const job = useRef<Promise<Prepared> | null>(null);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  // The file is shrunk while captions are being added.
  useEffect(() => {
    if (!kind) return;
    job.current = kind === 'photo' ? preparePhoto(file) : prepareVideo(file, setProgress);
    job.current.catch((e: Error) => setError(e.message === 'refuse' ? 'Этот телефон не может сжать видео. Снимите до 30 секунд.' : kind === 'photo' ? 'Не получилось открыть фото.' : 'Не получилось подготовить видео.'));
  }, [file, kind]);
  const publish = async (items: Overlay[]) => {
    if (!navigator.onLine) { setError('Нет интернета. Сторис отправится, когда нажмёте «Опубликовать» снова.'); return; }
    try {
      const p = await job.current!;
      await postStory(me, p, items);
      toast({ text: p.trimmed ? 'Сторис выложена. Видео обрезано до 30 секунд.' : 'Сторис выложена' });
      onDone();
    } catch {
      setError('Не получилось отправить. Проверьте интернет и нажмите «Опубликовать» снова.');
    }
  };
  const status = kind === 'video' && progress < 1 ? `Готовим видео… ${Math.round(progress * 100)}%` : 'Отправляем…';
  return <StoryEditor kind={kind ?? 'photo'} src={src} initial={[]} status={status} publishLabel="Опубликовать" error={error} onPublish={publish} onClose={onDone} />;
}

function CaptionHost({ story, onDone }: { story: Story; onDone: () => void }) {
  const toast = useToast();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { storyUrls([story]).then((m) => setSrc(m.get(story.path) ?? null)).catch(() => setError('Нет интернета.')); }, [story]);
  const save = async (items: Overlay[]) => {
    try { await saveOverlays(story, items); toast({ text: 'Надписи сохранены' }); onDone(); } catch { setError('Не получилось сохранить. Проверьте интернет.'); }
  };
  return <StoryEditor kind={story.kind} src={src} initial={story.overlays} status="Сохраняем…" publishLabel="Сохранить" error={error} onPublish={save} onClose={onDone} />;
}
```

Imports: `useToast` from `../shell/toastContext`, `Sheet` from `../menu/Sheet`, `StoryEditor`, `ViewersSheet`, `kindOf, preparePhoto, prepareVideo` from `./prepare`, `postStory, saveOverlays, deleteStory` from `./storiesApi`, `type Overlay, type Prepared` from `./types`.

When the composer reports «Сторис выложена», `ComposerHost` errors from `prepareVideo` with `video_later` show «Не получилось подготовить видео.» until Task 9.

- [ ] **Step 6: Run tests**

Run: `cd app && npx vitest run src/features/stories && npx tsc -b && npm run lint`
Expected: PASS; lint 18.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat: post photo stories with captions and stickers, edit captions, see viewers"
```

---

### Task 9: Video stories

**Files:**
- Modify: `app/package.json` (add `mediabunny`), `app/src/features/stories/prepare.ts`, `app/src/features/stories/StoryEditor.tsx` (loop preview)
- Test: `app/src/features/stories/prepare.test.ts` (add a case with a mocked library)

**Interfaces:**
- Consumes: `videoDecision`, `MAX_VIDEO_S`, `Prepared`.
- Produces: real `prepareVideo(file, onProgress): Promise<Prepared>`; throws `Error('refuse')` when the decision is `refuse`.

- [ ] **Step 1: Install**

Run: `cd app && npm install mediabunny`
Check the export names this plan uses exist: `grep -o "export { [^}]*" node_modules/mediabunny/dist/modules/src/index.d.ts | tr ',' '\n' | grep -E "Input$|ALL_FORMATS|BlobSource|Output$|Mp4OutputFormat|BufferTarget|Conversion$|QUALITY_LOW"`
Expected: all eight names listed. If `QUALITY_LOW` is missing, use the lowest `QUALITY_*` constant the package exports.

- [ ] **Step 2: Failing test** — add to `prepare.test.ts`:

```ts
import { vi } from 'vitest';

const conv = vi.hoisted(() => ({ valid: true, discarded: [] as Array<{ track: { type: string }; reason: string }>, duration: 42 }));
vi.mock('mediabunny', () => {
  class Input { constructor(public o: unknown) {} computeDuration = async () => conv.duration; getPrimaryVideoTrack = async () => ({ getDisplayWidth: async () => 1080, getDisplayHeight: async () => 1920 }); }
  class Output { target = { buffer: new ArrayBuffer(8) }; constructor(public o: unknown) {} }
  const Conversion = { init: vi.fn(async (o: unknown) => ({ o, isValid: conv.valid, discardedTracks: conv.discarded, onProgress: null as null | ((p: number) => void), execute: async function () { this.onProgress?.(1); } })) };
  return { Input, Output, Conversion, ALL_FORMATS: [], BlobSource: class { constructor(public f: unknown) {} }, Mp4OutputFormat: class { constructor(public o: unknown) {} }, BufferTarget: class {}, QUALITY_LOW: 'low' };
});

describe('prepareVideo', () => {
  it('cuts a long video to 30 seconds at 720p and says it was cut', async () => {
    const { prepareVideo } = await import('./prepare');
    const p = await prepareVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }), () => {});
    expect(p).toMatchObject({ kind: 'video', width: 720, height: 1280, durationMs: 30_000, trimmed: true });
    const { Conversion } = await import('mediabunny');
    expect(Conversion.init).toHaveBeenCalledWith(expect.objectContaining({ trim: { start: 0, end: 30 }, video: expect.objectContaining({ width: 720, height: 1280 }) }));
  });

  it('refuses a long video the phone cannot shrink', async () => {
    conv.valid = false;
    conv.duration = 50;
    const { prepareVideo } = await import('./prepare');
    await expect(prepareVideo(new File(['x'], 'v.mp4', { type: 'video/mp4' }), () => {})).rejects.toThrow('refuse');
    conv.valid = true;
  });
});
```

Run: `cd app && npx vitest run src/features/stories/prepare.test.ts` — Expected: FAIL (`video_later`).

- [ ] **Step 3: Implementation** — replace `prepareVideo` in `prepare.ts`:

```ts
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// Mediabunny (WebCodecs) re-encodes on the phone: 720p on the short side, low bitrate, first 30 s.
// Loaded only when a video is picked, so the app itself stays light.
export async function prepareVideo(file: File, onProgress: (p: number) => void): Promise<Prepared> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  const durationS = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('no_video');
  const w0 = await track.getDisplayWidth();
  const h0 = await track.getDisplayHeight();
  const k = Math.min(1, 720 / Math.min(w0, h0));
  const width = even(w0 * k);
  const height = even(h0 * k);
  const end = Math.min(durationS, MAX_VIDEO_S);
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input, output,
    video: { width, height, fit: 'fill', codec: 'avc', quality: mb.QUALITY_LOW },
    audio: { codec: 'aac' },
    trim: { start: 0, end },
  });
  // A dropped sound track counts as «cannot convert»: a silent copy of a family video is worse than the original.
  const lost = conversion.discardedTracks.some((d) => d.reason !== 'discarded_by_user');
  const decision = videoDecision({ canConvert: conversion.isValid && !lost, durationS, size: file.size });
  if (decision === 'refuse') throw new Error('refuse');
  if (decision === 'original') {
    onProgress(1);
    return { blob: file, kind: 'video', width: w0, height: h0, durationMs: Math.round(durationS * 1000), trimmed: false };
  }
  conversion.onProgress = (p: number) => onProgress(Math.min(0.99, p));
  await conversion.execute();
  onProgress(1);
  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  return { blob: new Blob([buffer], { type: 'video/mp4' }), kind: 'video', width, height, durationMs: Math.round(end * 1000), trimmed: durationS > MAX_VIDEO_S + 0.5 };
}
```

If `tsc` rejects `fastStart` or `codec: 'avc'`, check `node_modules/mediabunny/dist/modules/src/output-format.d.ts` / `conversion.d.ts` and use the names declared there.

The original-file path stores `video/quicktime` files as `.mp4` with content type `video/mp4`; Safari and Chrome both play iPhone H.264 `.mov` content under that type.

- [ ] **Step 4: Loop the video in the editor** — in `StoryEditor.tsx`, pass a `videoRef` to `StoryFrame` and add:

```tsx
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = video.current; if (v) { v.muted = true; v.loop = true; v.play().catch(() => {}); } }, [src]);
```

(import `useEffect`; remove the placeholder line.)

- [ ] **Step 5: Run tests**

Run: `cd app && npx vitest run src/features/stories && npx tsc -b && npm run lint && npm run build`
Expected: PASS; lint 18; the build output lists a separate `mediabunny` chunk (dynamic import).

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src
git commit -m "feat: shrink story videos on the phone before sending"
```

---

### Task 10: Push about a new story

**Files:**
- Modify: `supabase/functions/_shared/messages.ts`, `supabase/functions/notify/index.ts`, `app/src/features/settings/NotifyCard.tsx`
- Test: `app/tests/push/messages.test.ts` (add cases), `app/src/features/settings/NotifyCard.test.tsx` (add a case)

**Interfaces:**
- Consumes: `stories` table and trigger (Task 4), `members.kin`.
- Produces: `Ev` variant `{ kind: 'stories'; author: string; verb: 'выложила' | 'выложил' | null }`; `compose` → `{ title, body, url: '/', pref: 'stories', tag }`; `isStale('stories', row)` true after one hour; `verbFor(kin): 'выложила' | 'выложил' | null`.

- [ ] **Step 1: Failing tests** — in `app/tests/push/messages.test.ts`:

```ts
it('announces a story with the verb that fits who posted it', () => {
  expect(compose({ kind: 'stories', author: 'Мама', verb: 'выложила' }, '2026-10-15')).toMatchObject({ title: 'Мама выложила сторис', url: '/', pref: 'stories' });
  expect(compose({ kind: 'stories', author: 'Тёма', verb: null }, '2026-10-15').title).toBe('Новая сторис от Тёма');
  expect(verbFor('son')).toBe('выложил');
  expect(verbFor('grandmother')).toBe('выложила');
  expect(verbFor(null)).toBeNull();
});
it('does not push a story that reached the server an hour late', () => {
  const now = Date.parse('2026-10-15T20:00:00Z');
  expect(isStale('stories', { created_at: '2026-10-15T18:30:00Z' }, now)).toBe(true);
  expect(isStale('stories', { created_at: '2026-10-15T19:30:00Z' }, now)).toBe(false);
});
```

(import `verbFor` alongside `compose`, `isStale`.)

In `NotifyCard.test.tsx` add:

```tsx
it('has a switch for stories', async () => {
  render(<NotifyCard me={me} />);
  expect(await screen.findByRole('switch', { name: 'Сторис' })).toBeInTheDocument();
});
```

Run: `cd app && npx vitest run tests/push src/features/settings/NotifyCard.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Messages** — in `messages.ts`:

```ts
  | { kind: 'stories'; author: string; verb: 'выложила' | 'выложил' | null };
```

added to `Ev`, and:

```ts
const FEMALE = ['mother', 'daughter', 'grandmother'];
const MALE = ['father', 'son', 'grandfather'];
export const verbFor = (kin: string | null | undefined): 'выложила' | 'выложил' | null =>
  FEMALE.includes(kin ?? '') ? 'выложила' : MALE.includes(kin ?? '') ? 'выложил' : null;
```

In `compose`, before the final `return`:

```ts
  if (e.kind === 'stories') {
    return { title: e.verb ? `${e.author} ${e.verb} сторис` : `Новая сторис от ${e.author}`, body: 'Она исчезнет через сутки.', url: '/', pref: 'stories', tag: `story-${e.author}` };
  }
```

In `isStale` add: `if (table === 'stories') return now - Date.parse(String(row.created_at)) > 3600 * 1000;`

- [ ] **Step 3: Function** — in `notify/index.ts`: `const TABLES = ['weeks', 'dish_offers', 'shop_trips', 'stories'];`; the author line becomes

```ts
  const authorId: string = table === 'weeks' ? row.proposed_by : table === 'dish_offers' ? row.from_member : row.member_id;
```

(unchanged: `stories.member_id` is the author); select `kin` with members: `.select('id, name, user_id, kin')`; add the branch:

```ts
  } else if (table === 'stories') {
    ev = { kind: 'stories', author, verb: verbFor(members?.find((m) => m.id === authorId)?.kin) };
  } else {
```

and import `verbFor`.

- [ ] **Step 4: Switch** — in `NotifyCard.tsx` `ROWS` add after `offers`: `['stories', 'Сторис', 'когда кто-то выложил новую'],`.

Run: `cd app && npx vitest run tests/push src/features/settings && npx tsc -b && npm run lint`
Expected: PASS; lint 18.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions app/tests/push app/src/features/settings
git commit -m "feat: push the family when someone posts a story"
```

---

### Task 11: End-to-end checks on the live project

Runs after the owner applies the migrations (`npx supabase db push`) and deploys the function (`npx supabase functions deploy notify --no-verify-jwt`).

**Files:**
- Create: `app/e2e/stories.spec.ts`
- Modify: `app/e2e/shots.spec.ts` (screens of the composer and viewer)

**Interfaces:**
- Consumes: `familyOfTwo`, `tab` from `e2e/family.ts`; UI names from Tasks 3, 6, 8.

- [ ] **Step 1: Spec** `app/e2e/stories.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';
import { familyOfTwo } from './family.ts';

// A real JPEG drawn by the browser itself, so the phone-side decoding is exercised for real.
async function jpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => new Promise<string>((done) => {
    const c = Object.assign(document.createElement('canvas'), { width: 600, height: 800 });
    const g = c.getContext('2d')!;
    g.fillStyle = '#C92A62';
    g.fillRect(0, 0, 600, 800);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => done(String(r.result).split(',')[1]); r.readAsDataURL(b!); }, 'image/jpeg', 0.9);
  }));
  return Buffer.from(b64, 'base64');
}

test('mom posts a photo story with a caption, the son opens it and reacts, mom sees who watched', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await mom.page.getByRole('button', { name: 'Добавить сторис' }).click();
  await mom.page.getByLabel('Файл для сторис').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await jpeg(mom.page) });
  await mom.page.getByRole('button', { name: 'Надпись' }).click();
  await mom.page.getByRole('textbox', { name: 'Текст надписи' }).fill('Привет из кухни');
  await mom.page.getByRole('button', { name: 'Готово' }).click();
  await mom.page.getByRole('button', { name: 'Наклейка' }).click();
  await mom.page.getByRole('button', { name: '🎉' }).click();
  await mom.page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(mom.page.getByText('Сторис выложена')).toBeVisible();

  await son.page.reload();
  await son.page.getByRole('button', { name: 'Мама, новая сторис' }).click();
  await expect(son.page.getByText('Привет из кухни')).toBeVisible();
  await son.page.getByRole('button', { name: 'Реакция ❤️' }).click();
  await son.page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(son.page.getByRole('button', { name: 'Мама, сторис' })).toBeVisible();

  await mom.page.reload();
  await mom.page.getByRole('button', { name: 'Ваши сторис' }).click();
  await mom.page.getByRole('button', { name: 'Посмотрели: 1' }).click();
  await expect(mom.page.getByRole('dialog', { name: 'Кто посмотрел' })).toContainText('Сын');
  await expect(mom.page.getByLabel('реакция ❤️')).toBeVisible();
  await mom.close();
  await son.close();
});

test('a video story is shrunk on the phone and plays for the family', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  // A two-second clip recorded from a canvas in the page itself, handed to the picker as a file.
  await mom.page.getByRole('button', { name: 'Добавить сторис' }).click();
  await mom.page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
    const g = c.getContext('2d')!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.start();
    for (let i = 0; i < 60; i += 1) { g.fillStyle = `hsl(${i * 6} 80% 50%)`; g.fillRect(0, 0, 640, 360); await new Promise((r) => setTimeout(r, 33)); }
    rec.stop();
    await new Promise((r) => { rec.onstop = r; });
    const file = new File(parts, 'clip.webm', { type: 'video/webm' });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Файл для сторис"]')!;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await mom.page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(mom.page.getByText(/Сторис выложена/)).toBeVisible({ timeout: 60_000 });
  await son.page.reload();
  await son.page.getByRole('button', { name: 'Мама, новая сторис' }).click();
  await expect.poll(() => son.page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await mom.close();
  await son.close();
});

test('a new circle photo reaches the other phone', async ({ browser }) => {
  const { mom, son } = await familyOfTwo(browser);
  await mom.page.getByRole('link', { name: 'Настройки и профиль' }).click();
  await mom.page.getByRole('button', { name: 'Изменить' }).click();
  await mom.page.getByLabel('Выбрать фото').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await jpeg(mom.page) });
  await mom.page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(mom.page.getByText('Профиль сохранён')).toBeVisible();
  await son.page.reload();
  await expect(son.page.getByRole('group', { name: 'Семья' }).locator('img').first()).toBeVisible();
  await mom.close();
  await son.close();
});
```

- [ ] **Step 2: Run**

Run: `cd app && npm run e2e`
Expected: the existing 3 scenarios and the 3 new ones pass.

- [ ] **Step 3: Screens** — in `shots.spec.ts`, after `10-son-home`, post a photo story from mom with a caption (same steps as above), shoot `19-story-editor` before publishing, `20-home-ring` on the son's Home, `21-story-viewer` after he opens it. Run with `SHOTS_DIR=<dir>` and look at the three shots.

- [ ] **Step 4: Commit**

```bash
git add app/e2e
git commit -m "test: cover stories, video stories and circle photos end to end"
```
