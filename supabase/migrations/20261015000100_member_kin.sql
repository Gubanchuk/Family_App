-- Who a person is in the family: mum, dad, son… Shown next to the name instead of the bare role.
-- The role still decides what a person may do; kin is only how the family calls them.
alter table public.members add column kin text
  check (kin in ('mother', 'father', 'son', 'daughter', 'grandmother', 'grandfather'));

grant insert (kin) on public.members to authenticated;
grant update (kin) on public.members to authenticated;

drop function public.create_household(text, text, text);
create function public.create_household(p_name text, p_my_name text, p_color text, p_kin text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and deleted_at is null) then raise exception 'already_in_family'; end if;
  insert into public.households (name) values (p_name) returning id into h;
  insert into public.members (household_id, user_id, name, color, role, is_owner, kin) values (h, auth.uid(), p_my_name, p_color, 'parent', true, p_kin);
  return h;
end $$;

drop function public.accept_invite(text, text, text);
create function public.accept_invite(p_code text, p_my_name text, p_color text, p_kin text default null) returns uuid
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
    -- A profile parents made earlier keeps what they set unless the person says otherwise.
    update public.members set user_id = auth.uid(), kin = coalesce(p_kin, kin), updated_at = now()
    where id = inv.member_id and household_id = inv.household_id and user_id is null and deleted_at is null
    returning id into m;
    if m is null then raise exception 'member_not_found'; end if;
  else
    insert into public.members (household_id, user_id, name, color, role, kin) values (inv.household_id, auth.uid(), p_my_name, p_color, inv.role, p_kin) returning id into m;
  end if;
  update public.invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return m;
end $$;

-- An app that does not send kin leaves it as it was.
drop function public.update_my_profile(text, text);
create function public.update_my_profile(p_name text, p_color text, p_kin text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.members set name = trim(p_name), color = p_color, kin = coalesce(p_kin, kin), updated_at = now()
  where user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'member_not_found'; end if;
end $$;

create or replace function public.invite_info(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where code = upper(trim(p_code));
  if not found then raise exception 'invite_not_found'; end if;
  if inv.used_at is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  return jsonb_build_object(
    'family', (select name from public.households where id = inv.household_id),
    'role', inv.role,
    'expires_at', inv.expires_at,
    'profile', (select name from public.members where id = inv.member_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'kin', kin) order by created_at)
      from public.members where household_id = inv.household_id and deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.create_household(text, text, text, text), public.accept_invite(text, text, text, text), public.update_my_profile(text, text, text) from public;
grant execute on function public.create_household(text, text, text, text), public.accept_invite(text, text, text, text), public.update_my_profile(text, text, text) to authenticated;
