create type public.member_role as enum ('parent', 'child');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role public.member_role not null,
  is_owner boolean not null default false,
  portion numeric(3, 2) not null default 1 check (portion > 0 and portion <= 1.5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);
create unique index members_one_family_per_user on public.members (user_id) where user_id is not null and deleted_at is null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  role public.member_role not null,
  member_id uuid references public.members (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.member_settings (
  member_id uuid primary key references public.members (id) on delete cascade,
  theme text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  meal_times jsonb not null default '["08:00","13:00","16:30","19:00"]',
  notify jsonb not null default '{"requests":true,"offers":true,"votes":true,"shop":false,"quiet":true}',
  updated_at timestamptz not null default now()
);

create function public.my_household_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() and deleted_at is null
$$;

create function public.is_parent(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid() and role = 'parent' and deleted_at is null)
$$;

create function public.add_member_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.member_settings (member_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger members_settings after insert on public.members for each row execute function public.add_member_settings();

create function public.create_household(p_name text, p_my_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and deleted_at is null) then raise exception 'already_in_family'; end if;
  insert into public.households (name) values (p_name) returning id into h;
  insert into public.members (household_id, user_id, name, color, role, is_owner) values (h, auth.uid(), p_my_name, p_color, 'parent', true);
  return h;
end $$;

create function public.create_invite(p_household uuid, p_role public.member_role, p_member uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_parent(p_household) then raise exception 'not_a_parent'; end if;
  -- 10 characters without 0/O/1/I so the code can be read aloud.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into c from generate_series(1, 10);
  insert into public.invites (household_id, code, role, member_id) values (p_household, c, p_role, p_member);
  return c;
end $$;

create function public.accept_invite(p_code text, p_my_name text, p_color text) returns uuid
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
    update public.members set user_id = auth.uid(), updated_at = now() where id = inv.member_id returning id into m;
  else
    insert into public.members (household_id, user_id, name, color, role) values (inv.household_id, auth.uid(), p_my_name, p_color, inv.role) returning id into m;
  end if;
  update public.invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return m;
end $$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.member_settings enable row level security;

create policy "family sees its household" on public.households for select to authenticated using (id in (select public.my_household_ids()));
create policy "parents rename the household" on public.households for update to authenticated using (public.is_parent(id));

create policy "family sees its members" on public.members for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "parents add members" on public.members for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit members" on public.members for update to authenticated using (public.is_parent(household_id));
create policy "parents remove members" on public.members for delete to authenticated using (public.is_parent(household_id) and not is_owner);

create policy "parents see invites" on public.invites for select to authenticated using (public.is_parent(household_id));
create policy "parents cancel invites" on public.invites for delete to authenticated using (public.is_parent(household_id));

create policy "family sees settings" on public.member_settings for select to authenticated
  using (member_id in (select id from public.members where household_id in (select public.my_household_ids())));
create policy "own settings or a parent" on public.member_settings for update to authenticated
  using (member_id in (select id from public.members where user_id = auth.uid())
      or member_id in (select id from public.members where public.is_parent(household_id)));

grant select, update on public.households to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, delete on public.invites to authenticated;
grant select, update on public.member_settings to authenticated;
grant execute on function public.create_household(text, text, text), public.create_invite(uuid, public.member_role, uuid), public.accept_invite(text, text, text), public.my_household_ids(), public.is_parent(uuid) to authenticated;
