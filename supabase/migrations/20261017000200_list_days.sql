-- The days of a week its shopping list is built from (null: all seven). A week set on a Thursday
-- needs no products for Monday to Wednesday.
alter table public.weeks add column list_days smallint[]
  check (list_days is null or list_days <@ '{0,1,2,3,4,5,6}'::smallint[]);

-- save_week as in 20261014000710, now keeping list_days too. A phone that does not send it (an older
-- build, or one before its column check) leaves the week's days as they are.
create or replace function public.save_week(p_week jsonb, p_slots jsonb) returns void
language plpgsql set search_path = public as $$
declare w public.weeks;
begin
  -- Runs as the caller: row level security and the week guards still apply.
  w := jsonb_populate_record(null::public.weeks, p_week);
  insert into public.weeks (id, household_id, starts_on, template_id, status, proposed_by, approved_by, deleted_at, list_days)
  values (w.id, w.household_id, w.starts_on, w.template_id, w.status, w.proposed_by, w.approved_by, w.deleted_at, w.list_days)
  on conflict (id) do update set template_id = excluded.template_id, status = excluded.status, proposed_by = excluded.proposed_by,
    approved_by = excluded.approved_by, deleted_at = excluded.deleted_at,
    list_days = case when p_week ? 'list_days' then excluded.list_days else weeks.list_days end;
  insert into public.week_slots (week_id, household_id, day, meal, dish_id, side_id, salad_id, simple)
  select w.id, w.household_id, s.day, s.meal, s.dish_id, s.side_id, s.salad_id, s.simple
  from jsonb_populate_recordset(null::public.week_slots, p_slots) s
  on conflict (week_id, day, meal) do update set dish_id = excluded.dish_id, side_id = excluded.side_id, salad_id = excluded.salad_id, simple = excluded.simple;
end $$;
