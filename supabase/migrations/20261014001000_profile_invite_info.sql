-- Everyone edits their own name and colour. Updates on members are otherwise for parents only,
-- so a child could not fix a typo in their own name.
create function public.update_my_profile(p_name text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.members set name = trim(p_name), color = p_color, updated_at = now()
  where user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'member_not_found'; end if;
end $$;

-- What an invite leads to, shown before joining: the family, the role and who is already there,
-- so the invited person sees whose family it is and picks a colour nobody has.
-- Open to anonymous visitors: the code itself is the secret (50 random bits, 7 days, single use).
create function public.invite_info(p_code text) returns jsonb
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
      select jsonb_agg(jsonb_build_object('name', name, 'color', color) order by created_at)
      from public.members where household_id = inv.household_id and deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.update_my_profile(text, text), public.invite_info(text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
