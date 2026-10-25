// The assistant function's pure parts: checking what the phone sent, building the requests to Claude and
// reading its errors. No Deno or npm imports, so the app's tests cover them too.
import { MODEL, toolsFor, type Usage } from './assistant.ts';
import { CHECK_PROMPT, SYSTEM_PROMPT } from './assistantPrompt.ts';

export type Role = 'parent' | 'child';
export type Block = { type: string; [key: string]: unknown };
export type Message = { role: 'user' | 'assistant'; content: string | Block[] };
export type Product = { title: string; unit: string; price: number | null; dept: string };
export type Body =
  | { mode: 'chat'; messages: Message[]; screen?: string }
  | { mode: 'check_product'; product: Product };
// The part of a model reply the function reads; content goes back to the phone unchanged.
export type Reply = { content: unknown[]; stop_reason: string | null; usage: Usage };

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_MESSAGES = 120;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// What a person's message may carry: their words, a photo, and the phone's tool results.
const USER_BLOCKS = ['text', 'image', 'tool_result'];

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// A photo only as base64 of a common format, so Claude never fetches a link on someone's behalf.
function imageOk(b: Record<string, unknown>): boolean {
  const s = b.source;
  if (!isObject(s) || s.type !== 'base64' || typeof s.media_type !== 'string' || !IMAGE_TYPES.includes(s.media_type)) return false;
  return typeof s.data === 'string' && s.data.length > 0 && Math.floor((s.data.length * 3) / 4) <= MAX_IMAGE_BYTES;
}

function userBlockOk(b: unknown): boolean {
  if (!isObject(b) || typeof b.type !== 'string' || !USER_BLOCKS.includes(b.type)) return false;
  if (b.type === 'image') return imageOk(b);
  if (b.type === 'tool_result' && Array.isArray(b.content)) {
    return b.content.every((c) => isObject(c) && (c.type === 'text' || (c.type === 'image' && imageOk(c))));
  }
  return true;
}

export function validateMessages(x: unknown): Message[] | null {
  if (!Array.isArray(x) || x.length < 1 || x.length > MAX_MESSAGES) return null;
  // The conversation starts with the person and ends with them: a trailing assistant turn is a prefill.
  if (!isObject(x[0]) || x[0].role !== 'user' || !isObject(x[x.length - 1]) || x[x.length - 1].role !== 'user') return null;
  for (const m of x) {
    if (!isObject(m) || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content === 'string') continue;
    if (!Array.isArray(m.content)) return null;
    // The model's own blocks (thinking with its signature, fallback, tool_use) come back as they were sent.
    const ok = m.role === 'user' ? m.content.every(userBlockOk) : m.content.every((b) => isObject(b) && typeof b.type === 'string');
    if (!ok) return null;
  }
  return x as Message[];
}

function productOk(p: unknown): p is Product {
  return isObject(p) && typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 200
    && typeof p.unit === 'string' && p.unit.length <= 20 && typeof p.dept === 'string' && p.dept.length <= 60
    && (p.price === null || (typeof p.price === 'number' && Number.isFinite(p.price) && p.price >= 0));
}

// The raw request text: at most 4 MB, then one of the two modes.
export function validateBody(raw: string): Body | null {
  if (raw.length > MAX_BODY_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  let x: unknown;
  try { x = JSON.parse(raw); } catch { return null; }
  if (!isObject(x)) return null;
  if (x.mode === 'check_product') return productOk(x.product) ? { mode: 'check_product', product: x.product } : null;
  if (x.mode !== 'chat') return null;
  if (x.screen !== undefined && (typeof x.screen !== 'string' || x.screen.length > 40)) return null;
  const messages = validateMessages(x.messages);
  if (!messages) return null;
  return typeof x.screen === 'string' ? { mode: 'chat', messages, screen: x.screen } : { mode: 'chat', messages };
}

// No thinking setting (Opus 5.5 thinks adaptively, and turning it off is an error), no sampling settings.
// The tools and the instructions come first and stay byte-identical, so the cache and the model's
// earlier reasoning stay valid; the top-level breakpoint caches the conversation as it grows.
export function buildChatRequest(messages: Message[], role: Role) {
  return {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: toolsFor(role).map(({ name, description, input_schema }) => ({ name, description, input_schema })),
    messages,
  };
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
  required: ['ok', 'note'],
  additionalProperties: false,
};

export function buildCheckRequest(p: Product) {
  const price = p.price === null ? 'цена не указана' : `цена ${p.price} ₽`;
  return {
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
    system: CHECK_PROMPT,
    messages: [{ role: 'user', content: `Товар: ${p.title.trim()}; единица: ${p.unit || 'не указана'}; ${price}; отдел: ${p.dept || 'не указан'}.` }],
  };
}

// The check's JSON answer; anything unreadable counts as «looks fine», so a hiccup never blocks a product.
export function readCheck(reply: Pick<Reply, 'content' | 'stop_reason'>): { ok: boolean; note: string } {
  const fine = { ok: true, note: '' };
  if (reply.stop_reason === 'refusal') return fine;
  const text = reply.content.find((b): b is { type: 'text'; text: string } => isObject(b) && b.type === 'text' && typeof b.text === 'string');
  if (!text) return fine;
  try {
    const x = JSON.parse(text.text) as unknown;
    return isObject(x) && typeof x.ok === 'boolean' && typeof x.note === 'string' ? { ok: x.ok, note: x.note } : fine;
  } catch {
    return fine;
  }
}

// strip_thinking: the conversation's thinking blocks are bound to another prefix (a new system prompt,
// another tool list after a role change); the function retries once without them.
export type ErrorKind = 'no_credit' | 'busy' | 'strip_thinking' | 'failed';

// Classified by shape ({ status, message }), the way the SDK's APIError carries them.
export function classifyError(e: unknown): ErrorKind {
  const { status, message } = (isObject(e) ? e : {}) as { status?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  // A low balance comes as a 400 with «credit balance»; 402 is the API's billing error.
  if (status === 402 || text.includes('credit balance')) return 'no_credit';
  if (status === 429 || status === 529 || text.includes('overloaded')) return 'busy';
  if (status === 400 && text.includes('signature')) return 'strip_thinking';
  return 'failed';
}

// The history without thinking and redacted_thinking blocks; everything else stays in place and in order.
// An assistant turn left empty is dropped: the API refuses empty turns, and two user turns in a row merge.
export function stripThinking(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant' || typeof m.content === 'string') { out.push(m); continue; }
    const content = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    if (content.length) out.push({ ...m, content });
  }
  return out;
}

// Midnight in Moscow (UTC+3 all year) as an ISO instant: the daily limit counts from it.
export function moscowDayStart(now: Date): string {
  const shift = 3 * 3600 * 1000;
  const day = 24 * 3600 * 1000;
  return new Date(Math.floor((now.getTime() + shift) / day) * day - shift).toISOString();
}

// The user id inside the caller's access token. Not trusted by itself: the member lookup sends the same
// token to the database, which checks its signature.
export function jwtSub(authorization: string | null): string | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}
