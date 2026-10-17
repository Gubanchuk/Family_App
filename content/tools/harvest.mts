// Drafts for new base recipes from recipe pages: reads each page's schema.org Recipe with the same code as
// «Заполнить по ссылке», matches its products to content/ingredients.json and finds its photo.
// The draft is raw material, not a recipe: steps must be rewritten in our own words, amounts checked,
// Dima's level set. Drafts hold the sites' text, so content/harvest/ is not committed.
// Usage: node content/tools/harvest.mts <file with one URL per line> <out.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readRecipe, safeUrl } from '../../supabase/functions/_shared/recipePage.ts';
import { matchLine } from '../../app/src/features/ideas/recipeMatch.ts';

type Vocab = { item: string; unit: string; dept: string; group: string; pieceWeight: number | null; pantry: boolean };
const root = new URL('../../', import.meta.url);
const vocab = (JSON.parse(readFileSync(new URL('content/ingredients.json', root), 'utf8')) as Vocab[])
  .map((v) => ({ item: v.item, unit: v.unit, dept: v.dept, grp: v.group, piece_weight: v.pieceWeight, piece_name: null, pantry: v.pantry }));
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

function imageOf(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[] = [JSON.parse(m[1].trim())];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) { stack.push(...n); continue; }
        if (!n || typeof n !== 'object') continue;
        const o = n as Record<string, unknown>;
        if ([o['@type']].flat().includes('Recipe')) {
          const img = [o.image].flat()[0] as unknown;
          const u = typeof img === 'string' ? img : (img as { url?: string } | undefined)?.url;
          if (u) return u;
        }
        stack.push(o['@graph'], o.mainEntity);
      }
    } catch { /* next block */ }
  }
  return html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ?? null;
}

async function one(raw: string) {
  const url = safeUrl(raw);
  if (!url) return { url: raw, error: 'bad url' };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
    const html = new TextDecoder(charset).decode(buf);
    const r = readRecipe(html, url);
    if (!r) return { url: raw, error: 'no recipe markup' };
    const ingredients = r.ingredients.map((line) => ({ line, ...(matchLine(line, vocab) ?? { item: null }) }));
    return {
      url: raw, site: r.site, name: r.name, servings: r.servings, minutes: r.minutes, image: imageOf(html),
      ingredients, unmatched: ingredients.filter((i) => !i.item).map((i) => i.line), sourceSteps: r.steps,
    };
  } catch (e) {
    return { url: raw, error: String(e) };
  }
}

const [list, out] = process.argv.slice(2);
const urls = readFileSync(list, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const results = [];
for (let i = 0; i < urls.length; i += 6) results.push(...(await Promise.all(urls.slice(i, i + 6).map(one))));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(results, null, 2));
const ok = results.filter((r) => !('error' in r));
console.log(`${ok.length} of ${results.length} read; ${results.filter((r) => 'error' in r).map((r) => `${r.url}: ${(r as { error: string }).error}`).join('\n')}`);
