import { supabase } from '../../lib/supabase';
import type { AssistantError } from '../../../../supabase/functions/_shared/assistant';
import type { ApiReply, Block, ChatBody } from './types';

type Invoke = (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }>;

// The model may think for a while before it answers, and the reply comes in one piece. The client's fetch
// gives up after 15 s of silence, but allows 3 minutes for an upload: sending the JSON as a Blob takes that road.
const invokeFn: Invoke = (name, opts) =>
  supabase.functions.invoke(name, { body: new Blob([JSON.stringify(opts.body)], { type: 'application/json' }) }) as Promise<{ data: unknown; error: unknown }>;

const CODES: AssistantError[] = ['not_member', 'bad_request', 'daily_limit', 'no_credit', 'busy', 'refusal', 'failed'];
const known = (x: unknown): AssistantError | null => (CODES.includes(x as AssistantError) ? (x as AssistantError) : null);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

async function fromError(error: unknown): Promise<AssistantError | 'network'> {
  const e = error as { name?: string; context?: { status?: number; json?: () => Promise<unknown> } };
  // An answer that came back with a non-2xx status: our function's code if it sent one, else by the status.
  if (e?.name === 'FunctionsHttpError' && e.context) {
    try {
      const body = await e.context.json?.();
      const code = isObject(body) ? known(body.error) : null;
      if (code) return code;
    } catch { /* not JSON */ }
    return [429, 503, 529].includes(e.context.status ?? 0) ? 'busy' : 'failed';
  }
  // Nothing came back at all: no network, a dropped connection, a relay that could not reach the function.
  return 'network';
}

// One request to the assistant function: the model's reply, or why there is none.
export async function callAssistant(body: ChatBody, invoke: Invoke = invokeFn): Promise<ApiReply> {
  try {
    const { data, error } = await invoke('assistant', { body });
    if (error) return { error: await fromError(error) };
    if (!isObject(data)) return { error: 'network' };
    if ('error' in data) return { error: known(data.error) ?? 'failed' };
    if (!Array.isArray(data.content) || !data.content.every((b) => isObject(b) && typeof b.type === 'string')) return { error: 'failed' };
    return { content: data.content as Block[], stop_reason: typeof data.stop_reason === 'string' ? data.stop_reason : null };
  } catch {
    return { error: 'network' };
  }
}

// A product typed in by hand: does its price and unit look like a real shop's? null when there is no answer
// (no network, no credit): the check is a hint, never a gate.
export async function checkProduct(product: { title: string; unit: string; price: number | null; dept: string }, invoke: Invoke = invokeFn): Promise<{ ok: boolean; note: string } | null> {
  try {
    const { data, error } = await invoke('assistant', { body: { mode: 'check_product', product } });
    if (error || !isObject(data) || typeof data.ok !== 'boolean') return null;
    return { ok: data.ok, note: typeof data.note === 'string' ? data.note.slice(0, 200) : '' };
  } catch {
    return null;
  }
}
