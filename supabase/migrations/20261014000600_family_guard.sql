-- Tighten family management: only the owner changes roles or invites parents,
-- logins attach to profiles only through invites, invites cannot target foreign or taken profiles.

create function public.is_owner(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid() and is_owner and deleted_at is null)
$$;

-- Logins, ownership and roles change only through the functions below.
revoke insert, update on public.members from anon, authenticated;
grant insert (household_id, name, color, role, portion) on public.members to authenticated;
grant update (name, color, portion, deleted_at, updated_at) on public.members to authenticated;

drop policy "parents add members" on public.members;
create policy "parents add profiles without login" on public.members for insert to authenticated
  with check (public.is_parent(household_id) and role = 'child' and user_id is null and not is_owner);

drop policy "parents edit members" on public.members;
create policy "parents edit members except the owner" on public.members for update to authenticated
  using (public.is_parent(household_id) and (not is_owner or user_id = auth.uid()))
  with check (public.is_parent(household_id) and (not is_owner or (user_id = auth.uid() and deleted_at is null)));

create function public.set_member_role(p_member uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where id = p_member and deleted_at is null;
  if not found or not public.is_owner(m.household_id) then raise exception 'not_owner'; end if;
  if m.is_owner then raise exception 'owner_stays_parent'; end if;
  update public.members set role = p_role, updated_at = now() where id = p_member;
end $$;

create or replace function public.create_invite(p_household uuid, p_role public.member_role, p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare c text; b bytea; i int;
begin
  if not public.is_parent(p_household) then raise exception 'not_a_parent'; end if;
  if p_role = 'parent' and not public.is_owner(p_household) then raise exception 'not_owner'; end if;
  if p_member is not null and not exists (
    select 1 from public.members
    where id = p_member and household_id = p_household and user_id is null and deleted_at is null and role = p_role
  ) then raise exception 'member_not_found'; end if;
  -- 10 characters without 0/O/1/I so the code can be read aloud. Bytes come from gen_random_uuid,
  -- skipping the version and variant bytes; 256 is a multiple of 32, so there is no bias.
  b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  c := '';
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] loop
    c := c || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 32, 1);
  end loop;
  insert into public.invites (household_id, code, role, member_id) values (p_household, c, p_role, p_member);
  return c;
end $$;

create or replace function public.accept_invite(p_code text, p_my_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invites; m uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.used_at is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and deleted_at is null) then raise exception 'already_in_family'; end if;
  if inv.member_id is not null then
    update public.members set user_id = auth.uid(), updated_at = now()
    where id = inv.member_id and household_id = inv.household_id and user_id is null and deleted_at is null
    returning id into m;
    if m is null then raise exception 'member_not_found'; end if;
  else
    insert into public.members (household_id, user_id, name, color, role) values (inv.household_id, auth.uid(), p_my_name, p_color, inv.role) returning id into m;
  end if;
  update public.invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return m;
end $$;

-- Deleting an account that once used an invite must not fail.
alter table public.invites drop constraint invites_used_by_fkey;
alter table public.invites add constraint invites_used_by_fkey foreign key (used_by) references auth.users (id) on delete set null;

grant execute on function public.set_member_role(uuid, public.member_role), public.is_owner(uuid) to authenticated;
revoke execute on function public.set_member_role(uuid, public.member_role) from anon;
