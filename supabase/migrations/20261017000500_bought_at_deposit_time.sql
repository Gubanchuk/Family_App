-- The day a shopping line was bought. Money counts a purchase in that month, so it must not move when
-- someone types the receipt price later (that rewrites the mark and its updated_at). The server sets it
-- when the line becomes bought, keeps it through other edits, and clears it when the mark is taken off.
-- An upsert fires BEFORE INSERT even when it ends as an update; the update branch then keeps the old day.
alter table public.shopping_marks add column bought_at timestamptz;
update public.shopping_marks set bought_at = updated_at where bought;

create function public.stamp_bought() returns trigger language plpgsql set search_path = '' as $$
begin
  if not new.bought then new.bought_at := null;
  elsif tg_op = 'UPDATE' and old.bought then new.bought_at := old.bought_at;
  else new.bought_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.stamp_bought() from public, anon;
create trigger shopping_marks_bought before insert or update on public.shopping_marks for each row execute function public.stamp_bought();

-- A deposit's time comes from the server when it is added too, so the one-day window to take it back
-- cannot be stretched by a made-up date (guard_deposit already keeps it on updates).
create function public.stamp_deposit() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.stamp_deposit() from public, anon;
create trigger deposits_stamp before insert on public.deposits for each row execute function public.stamp_deposit();
