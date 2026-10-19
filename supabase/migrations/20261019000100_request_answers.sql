-- A request gets an answer before it is done (docs/superpowers/specs/2026-10-19-round-four-design.md, part 3):
-- the recipient says «Хорошо» (accepted) or «Не могу» (declined); the asker sees which and gets a push.

alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check check (status in ('open', 'accepted', 'declined', 'done', 'cancelled'));
-- When the recipient last answered; stamped by the server, and the column phones probe for this feature.
alter table public.requests add column answered_at timestamptz;

create or replace function public.guard_request() returns trigger language plpgsql security definer set search_path = public as $$
declare existing public.requests; author boolean; recipient boolean;
begin
  if tg_op = 'INSERT' then
    select * into existing from public.requests where id = new.id;
    if existing.id is null then
      if new.from_id not in (select public.my_member_ids()) or new.status <> 'open' then raise exception 'not_yours'; end if;
      if not public.same_family(new.household_id, new.from_id) or not public.same_family(new.household_id, new.to_id) then raise exception 'wrong_household'; end if;
      new.answered_at := null;
      return new;
    end if;
  else
    existing := old;
  end if;
  author := existing.from_id in (select public.my_member_ids());
  recipient := existing.to_id in (select public.my_member_ids());
  if new.from_id <> existing.from_id or new.household_id <> existing.household_id then raise exception 'not_yours'; end if;
  if not author then
    -- The recipient only answers: waits, takes it, declines or ticks it done; a cancelled one stays cancelled.
    if not recipient or existing.status = 'cancelled' or new.title <> existing.title or new.to_id <> existing.to_id or new.due_on is distinct from existing.due_on
       or new.urgent <> existing.urgent or new.status not in ('open', 'accepted', 'declined', 'done') or new.deleted_at is distinct from existing.deleted_at then
      raise exception 'not_yours';
    end if;
  end if;
  -- Only the recipient answers: the asker may reopen or cancel, not take or decline for them.
  if not recipient and new.status in ('accepted', 'declined') and new.status <> existing.status then raise exception 'not_yours'; end if;
  if not public.same_family(new.household_id, new.to_id) then raise exception 'wrong_household'; end if;
  new.done_at := case when new.status = 'done' then coalesce(existing.done_at, now()) else null end;
  new.answered_at := case
    when new.status = 'open' then null
    when new.status = existing.status or new.status = 'cancelled' then existing.answered_at
    else now() end;
  return new;
end $$;

-- Every answer reaches the asker; push_log keeps one push per answer (accepted and declined count with their time),
-- so a done tick taken back and set again stays quiet.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'notify_push') then
    drop trigger if exists requests_notify on public.requests;
    create trigger requests_notify after insert or update of status on public.requests for each row
      when (new.status in ('open', 'accepted', 'declined', 'done')) execute function public.notify_push();
  end if;
end $$;
