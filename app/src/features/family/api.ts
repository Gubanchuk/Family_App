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
  const { error } = await supabase.from('members').update({ role, updated_at: new Date().toISOString() }).eq('id', member.id);
  if (error) throw new Error(error.message);
}
