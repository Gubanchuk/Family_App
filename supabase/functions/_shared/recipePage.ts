// Reading a recipe out of a web page: the schema.org Recipe markup that recipe sites put in for search
// engines (JSON-LD, or microdata as a fallback). Pure functions, so the app's tests cover them too.

export type PageRecipe = { name: string; servings: number | null; minutes: number | null; ingredients: string[]; steps: string[]; site: string };

// Only public web pages: http(s), no localhost, no private or link-local addresses written as numbers.
// (A host name that resolves to a private address is stopped by Supabase's own egress rules.)
export function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') && !h.includes(':')) return null;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (h.includes(':') && (h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80') || h.startsWith('::ffff:'))) return null;
  return u;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' };
export function clean(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// PT1H30M → 90.
export function isoMinutes(d: unknown): number | null {
  if (typeof d !== 'string') return null;
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i);
  if (!m) return null;
  const n = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return n > 0 ? n : null;
}

function firstNumber(v: unknown): number | null {
  for (const x of Array.isArray(v) ? v : [v]) {
    const m = String(x ?? '').match(/\d+/);
    if (m && Number(m[0]) > 0 && Number(m[0]) <= 99) return Number(m[0]);
  }
  return null;
}

const isRecipe = (o: Record<string, unknown>) => [o['@type']].flat().some((t) => String(t).toLowerCase() === 'recipe');

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x); if (r) return r; } return null; }
  const o = node as Record<string, unknown>;
  if (isRecipe(o)) return o;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) { const r = findRecipe(o[k]); if (r) return r; }
  return null;
}

// Steps come as text, HowToStep objects or HowToSection groups of them. Text with paragraphs or list items
// is split by them; one long plain block by its sentences.
function stepsOf(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === 'string') {
    if (/<\/(p|li|div)>|<br\s*\/?>/i.test(v)) return v.split(/<\/(?:p|li|div)>|<br\s*\/?>/i).map(clean).filter(Boolean);
    const t = clean(v);
    return t.length > 300 ? t.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/).filter(Boolean) : t ? [t] : [];
  }
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  const o = v as Record<string, unknown>;
  if (o.itemListElement) return stepsOf(o.itemListElement);
  const t = o.text ?? o.name ?? o.description;
  return typeof t === 'string' ? stepsOf(t) : [];
}

function fromJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      const r = findRecipe(JSON.parse(m[1].trim()));
      if (r) return r;
    } catch { /* a broken block: try the next one */ }
  }
  return null;
}

// The inner HTML of the element whose opening tag ends at `from`, counting nested tags of the same name.
function inner(html: string, tag: string, from: number): string {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return '';
}

// Microdata: itemprop="..." on elements inside the Recipe item, the value in content="" or in the element.
function fromMicrodata(html: string): Record<string, unknown> | null {
  // Some pages mark the products without declaring the Recipe item; then the whole page is the scope.
  const at = html.search(/itemtype\s*=\s*["'][^"']*schema\.org\/Recipe/i);
  if (at < 0 && !/itemprop\s*=\s*["']recipeIngredient["']/i.test(html)) return null;
  const scope = at < 0 ? html : html.slice(at);
  const all = (prop: string, raw = false) => {
    const out: string[] = [];
    const re = new RegExp(`<(\\w+)[^>]*itemprop\\s*=\\s*["']${prop}["'][^>]*>`, 'gi');
    for (let m = re.exec(scope); m; m = re.exec(scope)) {
      const content = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
      const value = content ? content[1] : inner(scope, m[1], re.lastIndex);
      out.push(raw ? value : clean(value));
    }
    return out.filter((x) => clean(x));
  };
  return { name: all('name')[0], recipeYield: all('recipeYield')[0], totalTime: all('totalTime')[0], cookTime: all('cookTime')[0], recipeIngredient: all('recipeIngredient'), recipeInstructions: all('recipeInstructions', true) };
}

const ingredientsOf = (r: Record<string, unknown> | null) =>
  r ? ([r.recipeIngredient ?? r.ingredients].flat().filter((x) => typeof x === 'string') as string[]).map(clean).filter(Boolean) : [];
const minutesOf = (r: Record<string, unknown> | null) => (r ? isoMinutes(r.totalTime) ?? isoMinutes(r.cookTime) ?? isoMinutes(r.prepTime) : null);
const withAmounts = (list: string[]) => list.filter((x) => /\d/.test(x)).length;

// Both kinds of markup are read and merged: some sites put the name in JSON-LD and the products with
// their amounts only in microdata.
export function readRecipe(html: string, url: URL): PageRecipe | null {
  const ld = fromJsonLd(html);
  const md = fromMicrodata(html);
  if (!ld && !md) return null;
  const name = clean(String(ld?.name ?? md?.name ?? ''));
  const [a, b] = [ingredientsOf(ld), ingredientsOf(md)];
  const ingredients = withAmounts(b) > withAmounts(a) ? b : a.length ? a : b;
  const fromLd = stepsOf(ld?.recipeInstructions);
  // «Шаг 3:» headings are the site's numbering, the editor numbers steps itself.
  const steps = (fromLd.length ? fromLd : stepsOf(md?.recipeInstructions)).map((x) => x.replace(/^шаг\s*\d+\s*[:.]?\s*/i, '')).filter(Boolean);
  if (!name || !ingredients.length) return null;
  return {
    name: name.slice(0, 80),
    servings: firstNumber(ld?.recipeYield) ?? firstNumber(md?.recipeYield),
    minutes: minutesOf(ld) ?? minutesOf(md),
    ingredients: ingredients.slice(0, 60),
    steps: steps.slice(0, 40).map((x) => x.slice(0, 300)),
    site: url.hostname.replace(/^www\./, ''),
  };
}
