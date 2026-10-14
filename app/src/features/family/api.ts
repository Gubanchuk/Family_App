import { supabase } from '../../lib/supabase';
import type { Member } from './useFamily';

export const MEMBER_COLORS = ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'];

export async function createHousehold(name: string, myName: string, color: string) {
  const { data, error } = await supabase.rpc('create_household', { p_name: name, p_my_name: myName, p_color: color });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function createInvite(household: string, role: 'parent' | 'child', member?: string) {
  const { data, error } = await supabase.rpc('create_invite', { p_household: household, p_role: role, p_member: member ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function acceptInvite(code: string, myName: string, color: string) {
  const { data, error } = await supabase.rpc('accept_invite', { p_code: code, p_my_name: myName, p_color: color });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addProfileWithoutSignIn(household: string, name: string, color: string, portion: number) {
  const { error } = await supabase.from('members').insert({ household_id: household, name, color, role: 'child', portion });
  if (error) throw new Error(error.message);
}

export async function setRole(member: Member, role: 'parent' | 'child') {
  const { error } = await supabase.rpc('set_member_role', { p_member: member.id, p_role: role });
  if (error) throw new Error(error.message);
}

export type InviteInfo = { family: string; role: 'parent' | 'child'; expires_at: string; profile: string | null; members: Array<{ name: string; color: string }> };

// null when the server cannot tell (no network, or the function is not installed yet): screens fall back to plain words.
export async function inviteInfo(code: string): Promise<InviteInfo | { error: string } | null> {
  const { data, error } = await supabase.rpc('invite_info', { p_code: code });
  if (error) return /invite_(used|expired|not_found)/.test(error.message) ? { error: error.message } : null;
  return data as InviteInfo;
}

// A parent can also edit the row directly; that keeps profile editing working for parents
// before the update_my_profile function reaches the server.
export async function updateMyProfile(me: Member, name: string, color: string) {
  const { error } = await supabase.rpc('update_my_profile', { p_name: name, p_color: color });
  if (!error) return;
  if (error.code === 'PGRST202' && me.role === 'parent') {
    const r = await supabase.from('members').update({ name: name.trim(), color }).eq('id', me.id);
    if (!r.error) return;
  }
  throw new Error(error.message);
}

export async function householdName(id: string): Promise<string | null> {
  const { data } = await supabase.from('households').select('name').eq('id', id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
