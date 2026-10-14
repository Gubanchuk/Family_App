create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  starts_on date not null check (extract(isodow from starts_on) = 1),
  template_id text references public.week_templates (id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'approved')),
  proposed_by uuid references public.members (id) on delete set null,
  approved_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, starts_on)
);

create table public.week_slots (
  week_id uuid not null references public.weeks (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  dish_id text references public.recipes (id), side_id text references public.recipes (id), salad_id text references public.recipes (id),
  simple jsonb,
  updated_at timestamptz not null default now(),
  primary key (week_id, day, meal)
);

create table public.votes (
  week_id uuid not null references public.weeks (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  value text not null check (value in ('yes', 'changes')),
  comment text not null default '',
  updated_at timestamptz not null default now(),
  primary key (week_id, member_id)
);

alter table public.template_slots add column updated_at timestamptz not null default now();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  -- clock_timestamp keeps several changes in one transaction ordered.
  new.updated_at = clock_timestamp();
  return new;
end $$;
create trigger weeks_touch before insert or update on public.weeks for each row execute function public.touch_updated_at();
create trigger week_slots_touch before insert or update on public.week_slots for each row execute function public.touch_updated_at();
create trigger votes_touch before insert or update on public.votes for each row execute function public.touch_updated_at();
create trigger week_templates_touch before insert or update on public.week_templates for each row execute function public.touch_updated_at();
create trigger template_slots_touch before insert or update on public.template_slots for each row execute function public.touch_updated_at();

create function public.guard_week_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(new.household_id) then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then raise exception 'not_a_parent'; end if;
    if tg_op = 'UPDATE' and old.status = 'approved' then raise exception 'not_a_parent'; end if;
  end if;
  return new;
end $$;
create trigger weeks_guard before insert or update on public.weeks for each row execute function public.guard_week_status();

create function public.guard_slot_change() returns trigger language plpgsql security definer set search_path = public as $$
declare w public.weeks;
begin
  select * into w from public.weeks where id = new.week_id;
  if w.household_id is distinct from new.household_id then raise exception 'wrong_household'; end if;
  if w.status = 'approved' and not public.is_parent(new.household_id) then raise exception 'not_a_parent'; end if;
  return new;
end $$;
create trigger week_slots_guard before insert or update on public.week_slots for each row execute function public.guard_slot_change();

alter table public.weeks enable row level security;
alter table public.week_slots enable row level security;
alter table public.votes enable row level security;

create policy "family reads weeks" on public.weeks for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds weeks" on public.weeks for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits weeks" on public.weeks for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads slots" on public.week_slots for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds slots" on public.week_slots for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits slots" on public.week_slots for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads votes" on public.votes for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "members vote as themselves" on public.votes for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and member_id in (select id from public.members where user_id = auth.uid()));
create policy "members change their own vote" on public.votes for update to authenticated
  using (member_id in (select id from public.members where user_id = auth.uid()))
  with check (member_id in (select id from public.members where user_id = auth.uid()));

grant select, insert, update on public.weeks, public.week_slots, public.votes to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.weeks, public.week_slots, public.votes;
  end if;
end $$;
