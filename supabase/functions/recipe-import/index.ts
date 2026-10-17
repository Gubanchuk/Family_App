// «Заполнить по ссылке»: downloads a recipe page for a signed-in member and returns the recipe markup
// found in it. Deployed with JWT checks on, so only the app's users can make the server fetch pages.
// Limits: http(s) to public addresses only, 10 seconds, 2 MB, at most 3 redirects, each one checked.
import { readRecipe, safeUrl } from '../_shared/recipePage.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BYTES = 2 * 1024 * 1024;
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

async function fetchPage(start: URL, signal: AbortSignal): Promise<{ html: string; url: URL } | null> {
  let url = start;
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) FamilyApp recipe import', Accept: 'text/html' } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      const checked = next ? safeUrl(new URL(next, url).toString()) : null;
      if (!checked) return null;
      url = checked;
      continue;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    // Most recipe sites are UTF-8; an old windows-1251 page says so in its header.
    const type = res.headers.get('content-type') ?? '';
    const charset = type.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase() ?? 'utf-8';
    let html: string;
    try { html = new TextDecoder(charset).decode(all); } catch { html = new TextDecoder().decode(all); }
    return { html, url };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer({ error: 'method' }, 405);
  let raw = '';
  try { raw = String(((await req.json()) as { url?: unknown }).url ?? ''); } catch { /* empty body */ }
  const url = safeUrl(raw);
  if (!url) return answer({ error: 'bad_url' }, 400);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const page = await fetchPage(url, ctl.signal);
    if (!page) return answer({ error: 'not_read' });
    const recipe = readRecipe(page.html, page.url);
    return recipe ? answer({ recipe }) : answer({ error: 'no_recipe' });
  } catch {
    return answer({ error: 'not_read' });
  } finally {
    clearTimeout(timer);
  }
});
