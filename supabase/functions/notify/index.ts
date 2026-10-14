// Sends Web Push for a week proposal, a dish offer, a shop trip or a new story. Called by a database trigger
// with { table, id }; re-reads the row itself, so a forged call can only repeat a real event once.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { compose, eventVersion, isStale, verbFor, type Ev } from '../_shared/messages.ts';
import { sendPush } from '../_shared/webpush.ts';

const TABLES = ['weeks', 'dish_offers', 'shop_trips', 'stories'];

// The new secret key when the project has one, the legacy service role key otherwise.
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    // Any current secret key works; after a rotation the new key may carry another name.
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key;
  } catch { /* fall back below */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

Deno.serve(async (req) => {
  const { table, id } = await req.json().catch(() => ({}));
  if (!TABLES.includes(table) || typeof id !== 'string') return Response.json({ skipped: 'bad request' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
  // Read the event first, then claim it: junk ids never reach the log, and each version is pushed once.
  const { data: row } = await db.from(table).select('*').eq('id', id).maybeSingle();
  if (!row) return Response.json({ skipped: 'no row' });
  if (isStale(table, row)) return Response.json({ skipped: 'stale' });
  const { error: claimed } = await db.from('push_log').insert({ kind: table, ref_id: id, version: eventVersion(table, row) });
  if (claimed) return Response.json({ skipped: 'already sent' });
  const authorId: string = table === 'weeks' ? row.proposed_by : table === 'dish_offers' ? row.from_member : row.member_id;
  const { data: members } = await db.from('members').select('id, name, user_id, kin').eq('household_id', row.household_id).is('deleted_at', null);
  const author = members?.find((m) => m.id === authorId)?.name ?? 'Кто-то';
  let ev: Ev;
  if (table === 'weeks') {
    const { data: t } = await db.from('week_templates').select('name').eq('id', row.template_id).maybeSingle();
    ev = { kind: 'weeks', author, template: t?.name ?? 'своя', startsOn: row.starts_on };
  } else if (table === 'dish_offers') {
    if (row.status !== 'open') return Response.json({ skipped: 'not open' });
    const { data: r } = await db.from('recipes').select('name').eq('id', row.dish_id).maybeSingle();
    ev = { kind: 'dish_offers', author, dish: r?.name ?? 'блюдо', meal: row.meal, onDate: row.on_date, toAll: !row.to_member };
  } else if (table === 'stories') {
    ev = { kind: 'stories', author, verb: verbFor(members?.find((m) => m.id === authorId)?.kin) };
  } else {
    ev = { kind: 'shop_trips', author };
  }
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const msg = compose(ev, today);
  const targets = (members ?? []).filter((m) => m.user_id && m.id !== authorId && (table !== 'dish_offers' || !row.to_member || row.to_member === m.id)).map((m) => m.id);
  if (!targets.length) return Response.json({ sent: 0 });
  const { data: settings } = await db.from('member_settings').select('member_id, notify').in('member_id', targets);
  const quiet = new Map((settings ?? []).map((s) => [s.member_id, s.notify?.quiet !== false]));
  const wanted = targets.filter((t) => (settings ?? []).find((s) => s.member_id === t)?.notify?.[msg.pref] !== false);
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, member_id, p256dh, auth').in('member_id', wanted);
  const vapid = { subject: Deno.env.get('VAPID_SUBJECT')!, publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!, privateJwk: JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!) };
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const status = await sendPush(s, { ...msg, quiet: quiet.get(s.member_id) ?? true }, vapid);
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else if (status < 300) sent += 1;
    } catch { /* one dead endpoint must not stop the rest */ }
  }
  return Response.json({ sent });
});
