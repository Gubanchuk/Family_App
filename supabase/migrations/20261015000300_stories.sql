-- Stories: a photo or a video with editable captions that the family sees for 24 hours.
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  path text not null unique,
  width int not null check (width > 0),
  height int not null check (height > 0),
  duration_ms int check (duration_ms is null or duration_ms between 0 and 31000),
  overlays jsonb not null default '[]' check (jsonb_typeof(overlays) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index stories_household on public.stories (household_id, expires_at);

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  reaction text check (reaction in ('❤️', '😂', '😍', '😮', '😢', '🔥', '👍', '👏')),
  primary key (story_id, member_id)
);

-- The signed-in person's member row in a family.
create function public.my_member_in(h uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where household_id = h and user_id = auth.uid() and deleted_at is null
$$;

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

create policy "family sees live stories" on public.stories for select to authenticated
  using (household_id in (select public.my_household_ids()) and expires_at > now());
create policy "author posts" on public.stories for insert to authenticated
  with check (member_id = public.my_member_in(household_id) and path like household_id::text || '/stories/%');
create policy "author edits captions" on public.stories for update to authenticated
  using (member_id = public.my_member_in(household_id)) with check (member_id = public.my_member_in(household_id));
create policy "author deletes" on public.stories for delete to authenticated
  using (member_id = public.my_member_in(household_id));

create policy "family sees views" on public.story_views for select to authenticated
  using (household_id in (select public.my_household_ids()));
create policy "own view" on public.story_views for insert to authenticated
  with check (member_id = public.my_member_in(household_id)
    and household_id = (select s.household_id from public.stories s where s.id = story_id));
create policy "own reaction" on public.story_views for update to authenticated
  using (member_id = public.my_member_in(household_id)) with check (member_id = public.my_member_in(household_id));

-- Lifetime and file path are not the client's to choose or change.
revoke all on public.stories, public.story_views from anon;
revoke insert, update on public.stories, public.story_views from authenticated;
grant insert (id, household_id, member_id, kind, path, width, height, duration_ms, overlays) on public.stories to authenticated;
grant update (overlays) on public.stories to authenticated;
grant insert (story_id, member_id, household_id, reaction) on public.story_views to authenticated;
grant update (reaction) on public.story_views to authenticated;

-- Whoever opens the app first after a story expired removes it; the app then removes the files.
create function public.drop_expired_stories() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.stories where household_id in (select public.my_household_ids()) and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.drop_expired_stories() from public, anon;
grant execute on function public.drop_expired_stories() to authenticated;
revoke execute on function public.my_member_in(uuid) from public, anon;
grant execute on function public.my_member_in(uuid) to authenticated;

-- A story file without a live story (expired or never posted) may be removed by anyone in the family.
create policy "family media: dead story files go" on storage.objects for delete to authenticated
  using (
    bucket_id = 'family' and (storage.foldername(name))[2] = 'stories'
    and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h)
    and not exists (select 1 from public.stories s where s.path = storage.objects.name)
  );

alter table public.member_settings alter column notify set default '{"requests":true,"offers":true,"votes":true,"shop":false,"quiet":true,"stories":true}';
update public.member_settings set notify = notify || '{"stories":true}' where not (notify ? 'stories');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stories, public.story_views;
  end if;
  if exists (select 1 from pg_proc where proname = 'notify_push') then
    create trigger stories_notify after insert on public.stories for each row execute function public.notify_push();
  end if;
end $$;
