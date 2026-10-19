import { useEffect, useState } from 'react';
import { signedUrls } from '../../lib/media';
import { API_URL } from '../../lib/baseUrl';

// Links are signed for one address of the base; a phone that switched to the site's address
// asks for new ones instead of reusing links to the direct one.
const KEY = `fa.avatar-urls:${API_URL}`;
const OLD_KEY = 'fa.avatar-urls';
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
    try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Entry>; localStorage.removeItem(OLD_KEY); } catch { cache = {}; }
  }
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(read())); } catch { /* storage unavailable */ }
}

// For tests: a fake signer and a fresh read of the remembered links.
export function setAvatarSigner(s: Signer) {
  signer = s;
  cache = null;
}

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const paths = [...batch.keys()];
  // In parts of 40: a screen of recipe photos would make one answer too large for a fragile connection.
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 40) {
    try { for (const [k, v] of await signer(paths.slice(i, i + 40), SIGN_FOR_S)) urls.set(k, v); } catch { /* offline: a remembered link or the letter */ }
  }
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

// Photos of recipes, wishes and goals live in the same bucket and use the same remembered links.
export const usePhotoUrl = useAvatarUrl;
