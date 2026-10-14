import { supabase } from '../../lib/supabase';
import type { Member } from './useFamily';
import type { Kin } from './kin';
import { removeFiles, uploadFile } from '../../lib/media';
import { cropAvatar } from '../../lib/image';
import type { PhotoChoice } from './AvatarPicker';

export const MEMBER_COLORS = ['#2F6FDB', '#E0457B', '#1FA463', '#F2A900'];

type Reply = { data: unknown; error: { code?: string; message: string } | null };
// A database without the kin column rejects the field; the call is repeated without it,
// so the person is still saved while the app runs ahead of the database.
async function withKin(call: (sendKin: boolean) => PromiseLike<Reply>): Promise<Reply> {
  const r = await call(true);
  return r.error?.code === 'PGRST202' || r.error?.code === 'PGRST204' ? call(false) : r;
}

export async function createHousehold(name: string, myName: string, color: string, kin: Kin | null = null) {
  const { data, error } = await withKin((k) => supabase.rpc('create_household', { p_name: name, p_my_name: myName, p_color: color, ...(k && kin ? { p_kin: kin } : {}) }));
  if (error) throw new Error(error.message);
  return data as string;
}

export async function createInvite(household: string, role: 'parent' | 'child', member?: string) {
  const { data, error } = await supabase.rpc('create_invite', { p_household: household, p_role: role, p_member: member ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function acceptInvite(code: string, myName: string, color: string, kin: Kin | null = null) {
  const { data, error } = await withKin((k) => supabase.rpc('accept_invite', { p_code: code, p_my_name: myName, p_color: color, ...(k && kin ? { p_kin: kin } : {}) }));
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addProfileWithoutSignIn(household: string, name: string, color: string, portion: number, kin: Kin | null = null): Promise<string> {
  const { data, error } = await withKin((k) => supabase.from('members').insert({ household_id: household, name, color, role: 'child', portion, ...(k && kin ? { kin } : {}) }).select('id').single());
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

// The photo goes up first under a new name; the row then points at it and the old file is removed.
export async function setAvatar(m: Pick<Member, 'id' | 'household_id'>, photo: PhotoChoice) {
  if (photo.kind === 'keep') return;
  let path: string | null = null;
  if (photo.kind === 'new') {
    path = `${m.household_id}/avatars/${m.id}/${Date.now()}.jpg`;
    await uploadFile(path, await cropAvatar(photo.file, photo.crop), 'image/jpeg');
  }
  const { data, error } = await supabase.rpc('set_avatar', { p_member: m.id, p_path: path });
  if (error) {
    if (path) await removeFiles([path]).catch(() => {});
    throw new Error(error.message);
  }
  const old = data as string | null;
  if (old && old !== path) await removeFiles([old]).catch(() => {});
}

export async function setRole(member: Member, role: 'parent' | 'child') {
  const { error } = await supabase.rpc('set_member_role', { p_member: member.id, p_role: role });
  if (error) throw new Error(error.message);
}

export type InviteInfo = { family: string; role: 'parent' | 'child'; expires_at: string; profile: string | null; members: Array<{ name: string; color: string; kin?: Kin | null }> };

// null when the server cannot tell (no network, or the function is not installed yet): screens fall back to plain words.
export async function inviteInfo(code: string): Promise<InviteInfo | { error: string } | null> {
  const { data, error } = await supabase.rpc('invite_info', { p_code: code });
  if (error) return /invite_(used|expired|not_found)/.test(error.message) ? { error: error.message } : null;
  return data as InviteInfo;
}

export async function updateMyProfile(name: string, color: string, kin: Kin | null) {
  const { error } = await withKin((k) => supabase.rpc('update_my_profile', { p_name: name, p_color: color, ...(k && kin ? { p_kin: kin } : {}) }));
  if (error) throw new Error(error.message);
}

// Parents edit the other members' rows directly; the database keeps the owner's row to the owner.
export async function updateMember(m: Member, name: string, color: string, kin: Kin | null) {
  const { error } = await withKin((k) => supabase.from('members').update({ name: name.trim(), color, ...(k && kin ? { kin } : {}) }).eq('id', m.id));
  if (error) throw new Error(error.message);
}

export async function householdName(id: string): Promise<string | null> {
  const { data } = await supabase.from('households').select('name').eq('id', id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
