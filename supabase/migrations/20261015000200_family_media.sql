-- Photos and videos of the family live in one private bucket, one folder per family:
-- <household>/avatars/<member>/<time>.jpg and <household>/stories/<story>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family', 'family', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

alter table public.members add column avatar_path text;

create policy "family media: family reads" on storage.objects for select to authenticated
  using (bucket_id = 'family' and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h));

create policy "family media: members add" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and (
      (storage.foldername(name))[2] = 'stories'
      or ((storage.foldername(name))[2] = 'avatars' and (
        (storage.foldername(name))[3] in (select id::text from public.members where user_id = auth.uid() and deleted_at is null)
        or public.is_parent(((storage.foldername(name))[1])::uuid)))
    )
  );

create policy "family media: owner or parent removes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'family'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and (owner_id = auth.uid()::text
      or ((storage.foldername(name))[2] = 'avatars' and public.is_parent(((storage.foldername(name))[1])::uuid)))
  );

-- Who may change a circle photo: the person, or a parent for anyone but the owner.
-- Returns the previous path so the app removes that file through the Storage API.
create function public.set_avatar(p_member uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare m public.members; old text;
begin
  select * into m from public.members where id = p_member and deleted_at is null;
  if not found then raise exception 'member_not_found'; end if;
  if not (m.user_id = auth.uid() or (public.is_parent(m.household_id) and not m.is_owner)) then raise exception 'not_allowed'; end if;
  if p_path is not null and p_path not like m.household_id::text || '/avatars/' || m.id::text || '/%' then raise exception 'bad_path'; end if;
  old := m.avatar_path;
  update public.members set avatar_path = p_path, updated_at = now() where id = p_member;
  return old;
end $$;

revoke execute on function public.set_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(uuid, text) to authenticated;
