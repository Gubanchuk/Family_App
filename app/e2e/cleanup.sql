-- Removes what the end-to-end runs leave in the Supabase project: their accounts (all on
-- example.com) and the families only those accounts belong to. A family that has at least
-- one real account stays; a test account that joined it is removed from it.
-- Run in Supabase → SQL Editor → New query → paste → Run.

with test_users as (
  select id from auth.users where email like '%@example.com'
)
delete from public.households h
where exists (select 1 from public.members m where m.household_id = h.id and m.user_id in (select id from test_users))
  and not exists (
    select 1 from public.members m
    where m.household_id = h.id and m.user_id is not null and m.user_id not in (select id from test_users)
  );

-- A test account that joined a real family leaves no empty profile behind.
delete from public.members where user_id in (select id from auth.users where email like '%@example.com');

delete from auth.users where email like '%@example.com';

-- Story and avatar files of the removed test families stay in Storage (bucket «family», one folder per
-- family id): Supabase does not let SQL delete stored files. They are a few kilobytes; to remove them,
-- open Storage → family in the dashboard and delete the folders whose family no longer exists.
