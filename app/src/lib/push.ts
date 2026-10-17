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

// Set when someone turns pushes off on this phone, so the start-up refresh does not turn them back on.
// It survives «Сбросить и загрузить заново» (localStorage stays), and turning pushes on clears it.
const OFF_KEY = 'fa.push-off';
const turnedOff = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };
const markOff = (off: boolean) => { try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* storage unavailable */ } };

export async function subscribePush(me: Member, client: Db = supabase): Promise<'on' | 'denied'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  markOff(false);
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  const { error } = await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, household_id: me.household_id, member_id: me.id, p256dh: keys.p256dh, auth: keys.auth });
  if (error) throw new Error(error.message);
  return 'on';
}

export async function unsubscribePush(client: Db = supabase) {
  markOff(true);
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
// A phone that allows notifications but lost its subscription (cleared site data, «Сбросить и загрузить
// заново», a new install) subscribes again: no prompt is needed once the permission is there. Not when
// someone turned pushes off here with the switch in Settings.
export async function refreshPush(me: Member, client: Db = supabase) {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (!existing && turnedOff()) return;
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  await client.from('push_subscriptions').upsert({ endpoint: sub.endpoint, household_id: me.household_id, member_id: me.id, p256dh: keys.p256dh, auth: keys.auth });
}
