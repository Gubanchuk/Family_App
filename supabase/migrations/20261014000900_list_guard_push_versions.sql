-- A bought menu line keeps the amount that was bought; a phone that has not seen the mark yet
-- gets the server copy back instead of rewriting or removing it.
create function public.guard_bought_line() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.source = 'menu' and exists (select 1 from public.shopping_marks where item_id = old.id and bought)
     and (new.qty is distinct from old.qty or new.qty_text is distinct from old.qty_text
          or new.est_price is distinct from old.est_price or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'already_bought';
  end if;
  return new;
end $$;
create trigger shopping_items_bought before update on public.shopping_items for each row execute function public.guard_bought_line();

-- A new proposal for the same week is news again: the push log is kept per version of an event.
alter table public.push_log add column version text not null default '';
alter table public.push_log drop constraint push_log_pkey;
alter table public.push_log add primary key (kind, ref_id, version);

-- Re-proposing a week (another template or author) notifies the family, and a failing network call
-- can never make the family's own write fail.
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute $f$
      create or replace function public.notify_push() returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        begin
          perform net.http_post(
            url := 'https://pbipnjlsxkbhdyfebdeo.supabase.co/functions/v1/notify',
            body := jsonb_build_object('table', tg_table_name, 'id', new.id),
            headers := '{"Content-Type": "application/json"}'::jsonb);
        exception when others then
          null;
        end;
        return new;
      end $b$
    $f$;
    execute 'drop trigger if exists weeks_notify on public.weeks';
    execute 'create trigger weeks_notify after insert or update of template_id, proposed_by, status on public.weeks for each row when (new.status = ''proposed'') execute function public.notify_push()';
  end if;
end $outer$;
