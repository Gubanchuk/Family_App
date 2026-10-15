// Sends Web Push for a week proposal, a dish offer, a shop trip, a new story, a request or a payment due. Called by a database trigger
// with { table, id }; re-reads the row itself, so a forged call can only repeat a real event once.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { compose, doneVerbFor, eventVersion, isStale, verbFor, type Ev } from '../_shared/messages.ts';
import { sendPush } from '../_shared/webpush.ts';
import { dueReminders } from '../_shared/due.ts';

const TABLES = ['weeks', 'dish_offers', 'shop_trips', 'stories', 'requests'];

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

// Called once a day by pg_cron: every family's payments due today or in three days, to its parents.
async function paymentsDue(): Promise<Response> {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: payments } = await db.from('payments').select('*').is('deleted_at', null);
  const { data: marks } = await db.from('payment_marks').select('payment_id, month, paid');
  const vapid = { subject: Deno.env.get('VAPID_SUBJECT')!, publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!, privateJwk: JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!) };
  let sent = 0;
  for (const r of dueReminders(payments ?? [], marks ?? [], today)) {
    // One reminder per payment, month and kind, however often the job runs.
    const { error: claimed } = await db.from('push_log').insert({ kind: 'payments_due', ref_id: r.payment.id, version: `${r.month}:${r.kind}` });
    if (claimed) continue;
    const { data: parents } = await db.from('members').select('id').eq('household_id', r.payment.household_id).eq('role', 'parent').is('deleted_at', null).not('user_id', 'is', null);
    const ids = (parents ?? []).map((m) => m.id);
    const { data: settings } = await db.from('member_settings').select('member_id, notify').in('member_id', ids);
    const wanted = ids.filter((id) => (settings ?? []).find((s) => s.member_id === id)?.notify?.payments !== false);
    const msg = compose({ kind: 'payments_due', title: r.payment.title, amount: r.payment.amount, when: r.kind }, today);
    const { data: subs } = await db.from('push_subscriptions').select('endpoint, member_id, p256dh, auth').in('member_id', wanted);
    for (const s of subs ?? []) {
      try {
        const status = await sendPush(s, { ...msg, quiet: false }, vapid);
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else if (status < 300) sent += 1;
      } catch { /* one dead endpoint must not stop the rest */ }
    }
  }
  return Response.json({ sent });
}

Deno.serve(async (req) => {
  const { table, id } = await req.json().catch(() => ({}));
  if (table === 'payments_due') return await paymentsDue();
  if (!TABLES.includes(table) || typeof id !== 'string') return Response.json({ skipped: 'bad request' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
  // Read the event first, then claim it: junk ids never reach the log, and each version is pushed once.
  const { data: row } = await db.from(table).select('*').eq('id', id).maybeSingle();
  if (!row) return Response.json({ skipped: 'no row' });
  if (isStale(table, row)) return Response.json({ skipped: 'stale' });
  const { error: claimed } = await db.from('push_log').insert({ kind: table, ref_id: id, version: eventVersion(table, row) });
  if (claimed) return Response.json({ skipped: 'already sent' });
  // The person the push is about: who asked for a new request, who did it for a done one.
  const authorId: string = table === 'weeks' ? row.proposed_by : table === 'dish_offers' ? row.from_member
    : table === 'requests' ? (row.status === 'done' ? row.to_id : row.from_id) : row.member_id;
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
  } else if (table === 'requests') {
    if (row.status === 'cancelled') return Response.json({ skipped: 'cancelled' });
    ev = { kind: 'requests', author, title: row.title, status: row.status, verb: doneVerbFor(members?.find((m) => m.id === authorId)?.kin) };
  } else if (table === 'stories') {
    ev = { kind: 'stories', author, verb: verbFor(members?.find((m) => m.id === authorId)?.kin) };
  } else {
    ev = { kind: 'shop_trips', author };
  }
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const msg = compose(ev, today);
  const targets = (members ?? []).filter((m) => m.user_id && m.id !== authorId && (table !== 'dish_offers' || !row.to_member || row.to_member === m.id)
    && (table !== 'requests' || m.id === (row.status === 'done' ? row.from_id : row.to_id))).map((m) => m.id);
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
