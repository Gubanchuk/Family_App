-- What the assistant costs (docs/superpowers/specs/2026-10-25-assistant-design.md): one row per call to Claude,
-- written by the assistant function with the service role key. Before each question the function sums the
-- family's day and stops at the daily limit. Members neither read nor write it.
create table public.assistant_usage (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  at timestamptz not null default now(),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  -- Shows whether the prompt cache works: reads cost a twentieth of fresh input.
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0
);
create index assistant_usage_household_at on public.assistant_usage (household_id, at);

alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;

-- The day's spend as one number: summing rows through the API would stop at its 1000-row limit.
create function public.assistant_spent(p_household uuid, p_since timestamptz) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(cost_usd), 0) from public.assistant_usage where household_id = p_household and at >= p_since
$$;
revoke execute on function public.assistant_spent(uuid, timestamptz) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on public.assistant_usage to service_role;
    grant execute on function public.assistant_spent(uuid, timestamptz) to service_role;
  end if;
end $$;
