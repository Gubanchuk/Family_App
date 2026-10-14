import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type Db = Pick<SupabaseClient, 'from'>;
export type MemberSettings = { meal_times: string[]; notify: Record<string, boolean> };

export async function loadMemberSettings(memberId: string, db: Db = supabase): Promise<MemberSettings | null> {
  const { data } = await db.from('member_settings').select('meal_times, notify').eq('member_id', memberId).maybeSingle();
  return (data as MemberSettings | null) ?? null;
}
export async function saveNotify(memberId: string, notify: Record<string, boolean>, db: Db = supabase) {
  const { error } = await db.from('member_settings').update({ notify, updated_at: new Date().toISOString() }).eq('member_id', memberId);
  if (error) throw new Error(error.message);
}
export async function saveMealTimes(memberId: string, times: string[], db: Db = supabase) {
  const { error } = await db.from('member_settings').update({ meal_times: times, updated_at: new Date().toISOString() }).eq('member_id', memberId);
  if (error) throw new Error(error.message);
}
