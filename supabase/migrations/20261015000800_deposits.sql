-- Piggy bank history: each deposit into a wish or a goal is its own row (who, how much, when).
-- Rows are only added, so two deposits from two phones never overwrite each other. The sum in a
-- piggy bank is the old saved column plus the deposits.
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  wish_id uuid references public.wishes (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  amount int not null check (amount > 0 and amount <= 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((wish_id is null) <> (goal_id is null))
);
create index deposits_household on public.deposits (household_id);

create trigger deposits_touch before insert or update on public.deposits for each row execute function public.touch_updated_at();

-- A deposit is made in one's own name into a wish or goal of the same family, and never changes
-- afterwards: the only later change is taking it back (deleted_at).
create function public.guard_deposit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_id not in (select public.my_member_ids()) then raise exception 'not_yours'; end if;
  if new.wish_id is not null and not exists (select 1 from public.wishes where id = new.wish_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if new.goal_id is not null and not exists (select 1 from public.goals where id = new.goal_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if tg_op = 'UPDATE' and (new.amount <> old.amount or new.member_id <> old.member_id or new.household_id <> old.household_id
      or new.wish_id is distinct from old.wish_id or new.goal_id is distinct from old.goal_id) then
    raise exception 'deposit_fixed';
  end if;
  -- The time of a deposit is the server's: a phone sending it back rounded (or moved) changes nothing.
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger deposits_guard before insert or update on public.deposits for each row execute function public.guard_deposit();

alter table public.deposits enable row level security;
create policy "family reads deposits" on public.deposits for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds deposits" on public.deposits for insert to authenticated with check (household_id in (select public.my_household_ids()));
-- Taking a deposit back: only its author, only within a day (a typo, not a way to empty the piggy bank).
create policy "author takes a deposit back" on public.deposits for update to authenticated
  using (member_id in (select public.my_member_ids()) and created_at > now() - interval '1 day')
  with check (member_id in (select public.my_member_ids()));

revoke all on public.deposits from anon;
grant select, insert, update on public.deposits to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.deposits;
  end if;
end $$;
