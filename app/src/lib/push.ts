import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Member } from '../features/family/useFamily';

// Public half of the VAPID pair; the private half lives only in Supabase secrets.
export const VAPID_PUBLIC_KEY = 'BMnvC_dyv49HhQ8zOHeDmkQEiT_acsYIYrgnaIGh3JR9nbtM3HenwQi8lj5cqRXpa4zP3HntfxrI05ZZML9cDKA';
type Db = Pick<SupabaseClient, 'from'>;

const toBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export function pushSupport(): 'ok' | 'install-first' | 'unsupported' {
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (has) return 'ok';
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return ios && !window.matchMedia?.('(display-mode: standalone)').matches ? 'install-first' : 'unsupported';
}

export async function subscribePush(me: Member, client: Db = supabase): Promise<'on' | 'denied'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  const { error } = await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, household_id: me.household_id, member_id: me.id, p256dh: keys.p256dh, auth: keys.auth });
  if (error) throw new Error(error.message);
  return 'on';
}

export async function unsubscribePush(client: Db = supabase) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function pushIsOn(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}

// Push services may rotate a subscription's address; re-registering it on start keeps pushes coming.
export async function refreshPush(me: Member, client: Db = supabase) {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const keys = sub.toJSON().keys ?? {};
  await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, household_id: me.household_id, member_id: me.id, p256dh: keys.p256dh, auth: keys.auth });
}
