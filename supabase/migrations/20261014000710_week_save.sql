-- A week and its meals are saved in one transaction; an approved week must hold all 28 meals.

create function public.save_week(p_week jsonb, p_slots jsonb) returns void
language plpgsql set search_path = public as $$
declare w public.weeks;
begin
  -- Runs as the caller: row level security and the week guards still apply.
  w := jsonb_populate_record(null::public.weeks, p_week);
  insert into public.weeks (id, household_id, starts_on, template_id, status, proposed_by, approved_by, deleted_at)
  values (w.id, w.household_id, w.starts_on, w.template_id, w.status, w.proposed_by, w.approved_by, w.deleted_at)
  on conflict (id) do update set template_id = excluded.template_id, status = excluded.status, proposed_by = excluded.proposed_by,
    approved_by = excluded.approved_by, deleted_at = excluded.deleted_at;
  insert into public.week_slots (week_id, household_id, day, meal, dish_id, side_id, salad_id, simple)
  select w.id, w.household_id, s.day, s.meal, s.dish_id, s.side_id, s.salad_id, s.simple
  from jsonb_populate_recordset(null::public.week_slots, p_slots) s
  on conflict (week_id, day, meal) do update set dish_id = excluded.dish_id, side_id = excluded.side_id, salad_id = excluded.salad_id, simple = excluded.simple;
end $$;
grant execute on function public.save_week(jsonb, jsonb) to authenticated;

-- Checked at commit, so a week and its meals written in one transaction pass together.
create function public.check_week_complete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and new.deleted_at is null and (select count(*) from public.week_slots where week_id = new.id) < 28 then
    raise exception 'week_incomplete';
  end if;
  return null;
end $$;
create constraint trigger weeks_complete after insert or update on public.weeks
  deferrable initially deferred for each row execute function public.check_week_complete();

create function public.reset_votes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'proposed' and (new.template_id is distinct from old.template_id or new.proposed_by is distinct from old.proposed_by) then
    delete from public.votes where week_id = new.id;
  end if;
  return new;
end $$;
create trigger weeks_reset_votes after update on public.weeks for each row execute function public.reset_votes();

create or replace function public.guard_slot_change() returns trigger language plpgsql security definer set search_path = public as $$
declare w public.weeks;
begin
  if tg_op = 'UPDATE' and (new.week_id <> old.week_id or new.household_id <> old.household_id or new.day <> old.day or new.meal <> old.meal) then
    raise exception 'not_yours';
  end if;
  select * into w from public.weeks where id = new.week_id;
  if w.household_id is distinct from new.household_id then raise exception 'wrong_household'; end if;
  if w.status = 'approved' and not public.is_parent(new.household_id) then raise exception 'not_a_parent'; end if;
  return new;
end $$;
