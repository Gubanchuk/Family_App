-- The board: wishes with a piggy bank and secret gift marks, things to buy, goals with steps,
-- and requests to each other. Rows follow the shopping pattern: the family reads and writes its
-- own household, triggers check who may author or change what, the phone syncs them offline.
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references public.members (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  price int check (price is null or price >= 0),
  saved int not null default 0 check (saved >= 0),
  done_at timestamptz,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.wish_metoo (
  wish_id uuid not null references public.wishes (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (wish_id, member_id)
);

create table public.wish_gifts (
  wish_id uuid primary key references public.wishes (id) on delete cascade,
  giver_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  for_id uuid references public.members (id) on delete set null,
  title text not null check (length(title) between 1 and 80),
  note text not null default '' check (length(note) <= 40),
  due_on date,
  price int check (price is null or price >= 0),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid references public.members (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  target int not null check (target > 0),
  saved int not null default 0 check (saved >= 0),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_id uuid not null references public.members (id) on delete cascade,
  to_id uuid not null references public.members (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  due_on date,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger wishes_touch before insert or update on public.wishes for each row execute function public.touch_updated_at();
create trigger wish_metoo_touch before insert or update on public.wish_metoo for each row execute function public.touch_updated_at();
create trigger wish_gifts_touch before insert or update on public.wish_gifts for each row execute function public.touch_updated_at();
create trigger needs_touch before insert or update on public.needs for each row execute function public.touch_updated_at();
create trigger goals_touch before insert or update on public.goals for each row execute function public.touch_updated_at();
create trigger requests_touch before insert or update on public.requests for each row execute function public.touch_updated_at();

-- Every referenced member must be of the same family.
create function public.same_family(h uuid, member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select member is null or exists (select 1 from public.members where id = member and household_id = h)
$$;

-- An upsert fires BEFORE INSERT even when it ends as an update, so «new row» checks look at
-- whether the row exists; the update branch covers changes.
create function public.guard_wish() returns trigger language plpgsql security definer set search_path = public as $$
declare existing public.wishes;
begin
  if tg_op = 'INSERT' then
    select * into existing from public.wishes where id = new.id;
    if existing.id is null and new.owner_id not in (select public.my_member_ids()) and not public.is_parent(new.household_id) then raise exception 'not_yours'; end if;
    if existing.id is not null and existing.owner_id not in (select public.my_member_ids()) and not public.is_parent(existing.household_id) then raise exception 'not_yours'; end if;
  else
    if old.owner_id not in (select public.my_member_ids()) and not public.is_parent(old.household_id) then raise exception 'not_yours'; end if;
    if new.household_id <> old.household_id then raise exception 'wrong_household'; end if;
  end if;
  if not public.same_family(new.household_id, new.owner_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger wishes_guard before insert or update on public.wishes for each row execute function public.guard_wish();

create function public.guard_metoo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_id not in (select public.my_member_ids()) then raise exception 'not_yours'; end if;
  if not exists (select 1 from public.wishes where id = new.wish_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger wish_metoo_guard before insert or update on public.wish_metoo for each row execute function public.guard_metoo();

create function public.guard_gift() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(new.household_id) or new.giver_id not in (select public.my_member_ids()) then raise exception 'not_yours'; end if;
  if not exists (select 1 from public.wishes where id = new.wish_id and household_id = new.household_id and owner_id not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  return new;
end $$;
create trigger wish_gifts_guard before insert or update on public.wish_gifts for each row execute function public.guard_gift();

create function public.guard_need() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.same_family(new.household_id, new.for_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger needs_guard before insert or update on public.needs for each row execute function public.guard_need();

create function public.guard_goal() returns trigger language plpgsql security definer set search_path = public as $$
declare existing public.goals; owner uuid;
begin
  if tg_op = 'INSERT' then select * into existing from public.goals where id = new.id; end if;
  owner := coalesce(case when tg_op = 'UPDATE' then old.owner_id else existing.owner_id end, case when existing.id is null and tg_op = 'INSERT' then new.owner_id end);
  -- A family goal (no owner) belongs to the parents; a personal one to its owner and the parents.
  if not public.is_parent(new.household_id) and (owner is null or owner not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  if not public.is_parent(new.household_id) and new.owner_id is distinct from owner then raise exception 'not_yours'; end if;
  if not public.same_family(new.household_id, new.owner_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger goals_guard before insert or update on public.goals for each row execute function public.guard_goal();

create function public.guard_request() returns trigger language plpgsql security definer set search_path = public as $$
declare existing public.requests; author boolean; recipient boolean;
begin
  if tg_op = 'INSERT' then
    select * into existing from public.requests where id = new.id;
    if existing.id is null then
      if new.from_id not in (select public.my_member_ids()) or new.status <> 'open' then raise exception 'not_yours'; end if;
      if not public.same_family(new.household_id, new.from_id) or not public.same_family(new.household_id, new.to_id) then raise exception 'wrong_household'; end if;
      return new;
    end if;
  else
    existing := old;
  end if;
  author := existing.from_id in (select public.my_member_ids());
  recipient := existing.to_id in (select public.my_member_ids());
  if new.from_id <> existing.from_id or new.household_id <> existing.household_id then raise exception 'not_yours'; end if;
  if not author then
    -- The recipient only ticks a request done or back to open.
    if not recipient or new.title <> existing.title or new.to_id <> existing.to_id or new.due_on is distinct from existing.due_on
       or new.urgent <> existing.urgent or new.status not in ('open', 'done') or new.deleted_at is distinct from existing.deleted_at then
      raise exception 'not_yours';
    end if;
  end if;
  if not public.same_family(new.household_id, new.to_id) then raise exception 'wrong_household'; end if;
  new.done_at := case when new.status = 'done' then coalesce(existing.done_at, now()) else null end;
  return new;
end $$;
create trigger requests_guard before insert or update on public.requests for each row execute function public.guard_request();

alter table public.wishes enable row level security;
alter table public.wish_metoo enable row level security;
alter table public.wish_gifts enable row level security;
alter table public.needs enable row level security;
alter table public.goals enable row level security;
alter table public.requests enable row level security;

create policy "family reads wishes" on public.wishes for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family writes wishes" on public.wishes for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates wishes" on public.wishes for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads metoo" on public.wish_metoo for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family writes metoo" on public.wish_metoo for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates metoo" on public.wish_metoo for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

-- The surprise: parents only, and never on a wish of their own.
create policy "parents read others' gifts" on public.wish_gifts for select to authenticated
  using (public.is_parent(household_id) and exists (select 1 from public.wishes w where w.id = wish_id and w.owner_id not in (select public.my_member_ids())));
create policy "parents mark gifts" on public.wish_gifts for insert to authenticated with check (public.is_parent(household_id));
create policy "parents update gifts" on public.wish_gifts for update to authenticated
  using (public.is_parent(household_id)) with check (public.is_parent(household_id));

create policy "family reads needs" on public.needs for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family writes needs" on public.needs for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates needs" on public.needs for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads goals" on public.goals for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family writes goals" on public.goals for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates goals" on public.goals for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads requests" on public.requests for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family writes requests" on public.requests for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates requests" on public.requests for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

revoke all on public.wishes, public.wish_metoo, public.wish_gifts, public.needs, public.goals, public.requests from anon;
grant select, insert, update on public.wishes, public.wish_metoo, public.wish_gifts, public.needs, public.goals, public.requests to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wishes, public.wish_metoo, public.wish_gifts, public.needs, public.goals, public.requests;
  end if;
  if exists (select 1 from pg_proc where proname = 'notify_push') then
    create trigger requests_notify after insert or update of status on public.requests for each row
      when (new.status in ('open', 'done')) execute function public.notify_push();
  end if;
end $$;
