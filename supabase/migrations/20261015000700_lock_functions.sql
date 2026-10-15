-- Functions in the public schema are callable with the publishable key alone unless revoked.
-- Before sign-in the app needs only invite_info (the invite screen names the family); everything else
-- serves a signed-in member, and trigger functions are never called directly.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname <> 'invite_info' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- Functions added later start closed to visitors as well.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

-- The linter flags a trigger function without a fixed search_path; it uses only built-ins.
alter function public.touch_updated_at() set search_path = '';
