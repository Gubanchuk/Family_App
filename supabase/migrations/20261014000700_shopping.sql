create function public.my_member_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and deleted_at is null
$$;
grant execute on function public.my_member_ids() to authenticated;

create table public.dish_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_member uuid not null references public.members (id) on delete cascade,
  to_member uuid references public.members (id) on delete cascade,
  dish_id text not null references public.recipes (id),
  on_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  how text not null check (how in ('over', 'instead')),
  status text not null default 'open' check (status in ('open', 'taken', 'declined')),
  taken_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_items (
  id text primary key check (length(id) between 3 and 160),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid references public.weeks (id) on delete cascade,
  offer_id uuid references public.dish_offers (id) on delete cascade,
  source text not null check (source in ('menu', 'manual', 'offer')),
  item text references public.ingredients (item),
  title text not null check (length(title) between 1 and 80),
  qty numeric,
  unit text,
  qty_text text not null default '' check (length(qty_text) <= 40),
  dept text not null,
  urgent boolean not null default false,
  est_price numeric,
  added_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_marks (
  item_id text primary key references public.shopping_items (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  bought boolean not null,
  by_member uuid references public.members (id) on delete set null,
  price_real numeric check (price_real is null or price_real >= 0),
  updated_at timestamptz not null default now()
);

create table public.shop_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.not_eat (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('item', 'dish')),
  ref text not null check (length(ref) between 1 and 80),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (household_id, kind, ref)
);

create table public.push_subscriptions (
  endpoint text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

-- Written only by the notify Edge Function with the service role: one row per event already pushed.
create table public.push_log (
  kind text not null,
  ref_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

create trigger dish_offers_touch before insert or update on public.dish_offers for each row execute function public.touch_updated_at();
create trigger shopping_items_touch before insert or update on public.shopping_items for each row execute function public.touch_updated_at();
create trigger shopping_marks_touch before insert or update on public.shopping_marks for each row execute function public.touch_updated_at();
create trigger shop_trips_touch before insert or update on public.shop_trips for each row execute function public.touch_updated_at();
create trigger not_eat_touch before insert or update on public.not_eat for each row execute function public.touch_updated_at();
create trigger push_subscriptions_touch before insert or update on public.push_subscriptions for each row execute function public.touch_updated_at();

-- An upsert fires BEFORE INSERT even when it ends as an update, so the insert branch
-- checks the author only for a row that does not exist yet; the update branch covers the rest.
create function public.guard_offer() returns trigger language plpgsql security definer set search_path = public as $$
declare existing boolean := false;
begin
  if tg_op = 'INSERT' then
    existing := exists (select 1 from public.dish_offers where id = new.id);
    if not existing and new.from_member not in (select public.my_member_ids()) then raise exception 'not_yours'; end if;
    if not existing and new.status = 'taken' and (new.taken_by is null or new.taken_by not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  else
    if new.from_member <> old.from_member or new.household_id <> old.household_id or new.dish_id <> old.dish_id then raise exception 'not_yours'; end if;
    if new.status = 'taken' and (old.status <> 'taken' or new.taken_by is distinct from old.taken_by)
       and (new.taken_by is null or new.taken_by not in (select public.my_member_ids())) then raise exception 'not_yours'; end if;
  end if;
  if not exists (select 1 from public.members where id = new.from_member and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if new.to_member is not null and not exists (select 1 from public.members where id = new.to_member and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger dish_offers_guard before insert or update on public.dish_offers for each row execute function public.guard_offer();

create function public.guard_shopping_item() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.week_id is not null and not exists (select 1 from public.weeks where id = new.week_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  if new.offer_id is not null and not exists (select 1 from public.dish_offers where id = new.offer_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger shopping_items_guard before insert or update on public.shopping_items for each row execute function public.guard_shopping_item();

create function public.guard_mark() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.shopping_items where id = new.item_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
  return new;
end $$;
create trigger shopping_marks_guard before insert or update on public.shopping_marks for each row execute function public.guard_mark();

alter table public.dish_offers enable row level security;
alter table public.shopping_items enable row level security;
alter table public.shopping_marks enable row level security;
alter table public.shop_trips enable row level security;
alter table public.not_eat enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

create policy "family reads offers" on public.dish_offers for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds offers" on public.dish_offers for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates offers" on public.dish_offers for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads items" on public.shopping_items for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds items" on public.shopping_items for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates items" on public.shopping_items for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads marks" on public.shopping_marks for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds marks" on public.shopping_marks for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates marks" on public.shopping_marks for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));

create policy "family reads trips" on public.shop_trips for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "members start their own trips" on public.shop_trips for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and member_id in (select public.my_member_ids()));
create policy "members edit their own trips" on public.shop_trips for update to authenticated
  using (member_id in (select public.my_member_ids())) with check (member_id in (select public.my_member_ids()));

create policy "family reads not_eat" on public.not_eat for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "parents add not_eat" on public.not_eat for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit not_eat" on public.not_eat for update to authenticated using (public.is_parent(household_id)) with check (public.is_parent(household_id));

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()) and household_id in (select public.my_household_ids()));

grant select, insert, update on public.dish_offers, public.shopping_items, public.shopping_marks, public.shop_trips, public.not_eat to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_log from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dish_offers, public.shopping_items, public.shopping_marks, public.shop_trips, public.not_eat;
  end if;
end $$;
