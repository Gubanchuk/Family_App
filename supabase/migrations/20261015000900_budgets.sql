-- Monthly budgets per spending category; parents only, like the rest of the money.
create table public.budgets (
  household_id uuid not null references public.households (id) on delete cascade,
  category text not null check (length(category) between 1 and 40),
  amount int not null check (amount > 0 and amount <= 10000000),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (household_id, category)
);

create trigger budgets_touch before insert or update on public.budgets for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;
create policy "parents read budgets" on public.budgets for select to authenticated using (public.is_parent(household_id));
create policy "parents set budgets" on public.budgets for insert to authenticated with check (public.is_parent(household_id));
create policy "parents change budgets" on public.budgets for update to authenticated
  using (public.is_parent(household_id)) with check (public.is_parent(household_id));

revoke all on public.budgets from anon;
grant select, insert, update on public.budgets to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.budgets;
  end if;
end $$;
