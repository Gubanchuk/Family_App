-- «Дома» and a cart for one shop trip (docs/superpowers/specs/2026-10-17-home-stock-trip-cart-design.md).

-- What is at home: one row per product of the family, keyed by the dictionary item or, for a product
-- named by hand, 't:' and its normalised name. Only «есть» and «закончилось», no amounts.
create table public.home_stock (
  household_id uuid not null references public.households (id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  item text references public.ingredients (item),
  title text not null check (length(title) between 1 and 80),
  dept text not null check (length(dept) between 1 and 40),
  state text not null check (state in ('have', 'out')),
  by_member uuid references public.members (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (household_id, key)
);
create trigger home_stock_touch before insert or update on public.home_stock for each row execute function public.touch_updated_at();

create function public.guard_home_stock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.same_family(new.household_id, new.by_member) then raise exception 'wrong_household'; end if;
  return new;
end $$;
revoke execute on function public.guard_home_stock() from public, anon;
create trigger home_stock_guard before insert or update on public.home_stock for each row execute function public.guard_home_stock();

alter table public.home_stock enable row level security;
create policy "family reads home stock" on public.home_stock for select to authenticated using (household_id in (select public.my_household_ids()));
create policy "family adds home stock" on public.home_stock for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family updates home stock" on public.home_stock for update to authenticated
  using (household_id in (select public.my_household_ids())) with check (household_id in (select public.my_household_ids()));
grant select, insert, update on public.home_stock to authenticated;

-- A line closed as «есть дома»: not bought, so it is no spending, and never both at once.
alter table public.shopping_marks add column at_home boolean not null default false;
alter table public.shopping_marks add constraint shopping_marks_bought_or_home check (not (bought and at_home));

-- A line that ran out at home has its own source, so the list can say so.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.shopping_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%';
  if c is not null then execute format('alter table public.shopping_items drop constraint %I', c); end if;
end $$;
alter table public.shopping_items add constraint shopping_items_source_check check (source in ('menu', 'manual', 'offer', 'home'));

-- A trip says what it is for and which lines it takes; the shopper ends it (only they update it, as before).
alter table public.shop_trips add column label text check (label is null or length(label) between 1 and 80);
alter table public.shop_trips add column items jsonb check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 300));
alter table public.shop_trips add column ended_at timestamptz;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.home_stock;
  end if;
end $$;
