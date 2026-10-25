// «Помощник»: passes a member's conversation to Claude and answers with the model's reply as it came. The
// phone runs the tools itself and sends their results with the next request. Deployed with JWT checks on.
// Also checks a product typed in by hand (mode check_product). Spec: docs/superpowers/specs/2026-10-25-assistant-design.md
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { costUsd, DAILY_LIMIT_USD, type Usage } from '../_shared/assistant.ts';
import {
  buildChatRequest, buildCheckRequest, classifyError, jwtSub, MAX_BODY_BYTES, moscowDayStart, readCheck, stripThinking,
  validateBody, type Reply, type Role,
} from '../_shared/assistantRequest.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

// The new secret key when the project has one, the legacy service role key otherwise.
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key;
  } catch { /* fall back below */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

// Before the usage migration is applied there is no table and no sum: no limit and no record.
const notThere = (e: { code?: string } | null) => !!e && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '');
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer({ error: 'method' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return answer({ error: 'bad_request' }, 400);
  const body = validateBody(await req.text().catch(() => ''));
  if (!body) return answer({ error: 'bad_request' }, 400);

  // The caller's own member row: the family sees all its members, so the row is picked by the token's user.
  // The same token goes to the database, which checks its signature.
  const authorization = req.headers.get('Authorization') ?? '';
  const userId = jwtSub(authorization);
  if (!userId) return answer({ error: 'not_member' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: rows } = await db.from('members').select('id, household_id, role').eq('user_id', userId).is('deleted_at', null).limit(1);
  const me = rows?.[0] as { id: string; household_id: string; role: string } | undefined;
  if (!me) return answer({ error: 'not_member' });
  // Anything but a parent gets the child's tools.
  const role: Role = me.role === 'parent' ? 'parent' : 'child';

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
  const spent = await admin.rpc('assistant_spent', { p_household: me.household_id, p_since: moscowDayStart(new Date()) });
  const counting = !notThere(spent.error);
  if (spent.error && counting) {
    console.error('assistant: reading the day spend failed:', spent.error.message);
    return answer({ error: 'failed' });
  }
  if (counting && Number(spent.data) >= DAILY_LIMIT_USD) return answer({ error: 'daily_limit' });

  // Best effort: a lost record must not cost the person their answer.
  const record = async (u: Usage) => {
    if (!counting) return;
    try {
      const { error } = await admin.from('assistant_usage').insert({
        household_id: me.household_id, member_id: me.id, cost_usd: costUsd(u), input_tokens: u.input_tokens, output_tokens: u.output_tokens,
        cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      });
      if (error && !notThere(error)) console.error('assistant: usage not recorded:', error.message);
    } catch (e) {
      console.error('assistant: usage not recorded:', reason(e));
    }
  };

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  try {
    if (body.mode === 'check_product') {
      const reply: Reply = await client.messages.create(buildCheckRequest(body.product) as never);
      await record(reply.usage);
      return answer(readCheck(reply));
    }
    let reply: Reply;
    try {
      reply = await client.beta.messages.create(buildChatRequest(body.messages, role) as never);
    } catch (e) {
      if (classifyError(e) !== 'strip_thinking') throw e;
      // Thinking bound to another prefix (new instructions or tools): one retry without it.
      console.error('assistant: retrying without thinking blocks:', reason(e));
      reply = await client.beta.messages.create(buildChatRequest(stripThinking(body.messages), role) as never);
    }
    await record(reply.usage);
    if (reply.stop_reason === 'refusal') return answer({ error: 'refusal' });
    return answer({ content: reply.content, stop_reason: reply.stop_reason });
  } catch (e) {
    const kind = classifyError(e);
    if (kind === 'busy') return answer({ error: kind });
    console.error('assistant: Claude request failed:', reason(e));
    return answer({ error: kind === 'no_credit' ? kind : 'failed' });
  }
});
