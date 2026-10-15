-- Money, for parents only: mandatory payments (monthly or installments) with a mark per month,
-- and expenses and income. Children's phones never receive these rows.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  amount int not null check (amount > 0),
  day int not null check (day between 1 and 31),
  kind text not null check (kind in ('monthly', 'installment')),
  total int check (total is null or total > 0),
  first_month text check (first_month is null or first_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  note text not null default '' check (length(note) <= 60),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'monthly' or (total is not null and first_month is not null))
);

create table public.payment_marks (
  payment_id uuid not null references public.payments (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  household_id uuid not null references public.households (id) on delete cascade,
  paid boolean not null,
  amount int not null check (amount >= 0),
  paid_by uuid references public.members (id) on delete set null,
  paid_on date,
  updated_at timestamptz not null default now(),
  primary key (payment_id, month)
);

create table public.money_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount int not null check (amount > 0),
  category text check (category is null or length(category) between 1 and 40),
  member_id uuid references public.members (id) on delete set null,
  on_date date not null,
  note text not null default '' check (length(note) <= 80),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger payments_touch before insert or update on public.payments for each row execute function public.touch_updated_at();
create trigger payment_marks_touch before insert or update on public.payment_marks for each row execute function public.touch_updated_at();
create trigger money_entries_touch before insert or update on public.money_entries for each row execute function public.touch_updated_at();

create function public.guard_money() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'payment_marks' then
    if not exists (select 1 from public.payments where id = new.payment_id and household_id = new.household_id) then raise exception 'wrong_household'; end if;
    if not public.same_family(new.household_id, new.paid_by) then raise exception 'wrong_household'; end if;
  elsif tg_table_name = 'money_entries' then
    if not public.same_family(new.household_id, new.member_id) then raise exception 'wrong_household'; end if;
  end if;
  return new;
end $$;
create trigger payment_marks_guard before insert or update on public.payment_marks for each row execute function public.guard_money();
create trigger money_entries_guard before insert or update on public.money_entries for each row execute function public.guard_money();

alter table public.payments enable row level security;
alter table public.payment_marks enable row level security;
alter table public.money_entries enable row level security;

create policy "parents read payments" on public.payments for select to authenticated using (public.is_parent(household_id));
create policy "parents add payments" on public.payments for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit payments" on public.payments for update to authenticated using (public.is_parent(household_id)) with check (public.is_parent(household_id));
create policy "parents read marks" on public.payment_marks for select to authenticated using (public.is_parent(household_id));
create policy "parents add marks" on public.payment_marks for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit marks" on public.payment_marks for update to authenticated using (public.is_parent(household_id)) with check (public.is_parent(household_id));
create policy "parents read entries" on public.money_entries for select to authenticated using (public.is_parent(household_id));
create policy "parents add entries" on public.money_entries for insert to authenticated with check (public.is_parent(household_id));
create policy "parents edit entries" on public.money_entries for update to authenticated using (public.is_parent(household_id)) with check (public.is_parent(household_id));

revoke all on public.payments, public.payment_marks, public.money_entries from anon;
grant select, insert, update on public.payments, public.payment_marks, public.money_entries to authenticated;

alter table public.member_settings alter column notify set default '{"requests":true,"offers":true,"votes":true,"shop":false,"quiet":true,"stories":true,"payments":true}';
update public.member_settings set notify = notify || '{"payments":true}' where not (notify ? 'payments');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payments, public.payment_marks, public.money_entries;
  end if;
  -- Daily at 07:00 UTC (10:00 Moscow) the notify function looks for payments to remind about.
  -- A project that does not let a migration enable pg_cron still gets its money tables; the reminder
  -- job is then added by hand (Dashboard → Integrations → Cron) with the same command.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('payments-due', '0 7 * * *', $cron$
        select net.http_post(
          url := 'https://pbipnjlsxkbhdyfebdeo.supabase.co/functions/v1/notify',
          body := '{"table": "payments_due"}'::jsonb,
          headers := '{"Content-Type": "application/json"}'::jsonb)
      $cron$);
    exception when others then
      raise notice 'payment reminders not scheduled: %', sqlerrm;
    end;
  end if;
end $$;
