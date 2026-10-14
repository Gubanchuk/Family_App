-- After a week proposal, a dish offer or a shop trip, ask the notify Edge Function to send pushes.
-- pg_net exists on Supabase; the PGlite test database has no network, so the hook is skipped there.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    execute $f$
      create or replace function public.notify_push() returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        perform net.http_post(
          url := 'https://pbipnjlsxkbhdyfebdeo.supabase.co/functions/v1/notify',
          body := jsonb_build_object('table', tg_table_name, 'id', new.id),
          headers := '{"Content-Type": "application/json"}'::jsonb);
        return new;
      end $b$
    $f$;
    execute 'create trigger weeks_notify after insert on public.weeks for each row when (new.status = ''proposed'') execute function public.notify_push()';
    execute 'create trigger dish_offers_notify after insert on public.dish_offers for each row when (new.status = ''open'') execute function public.notify_push()';
    execute 'create trigger shop_trips_notify after insert on public.shop_trips for each row execute function public.notify_push()';
  end if;
end $outer$;
