-- Who sees a wish or a thing to buy: null is the whole family, otherwise the members listed and always
-- its author. An empty list means the author alone. Hidden rows never reach the others' phones: the rule
-- lives in the read policies, and with it whatever hangs on the wish (me-too marks, gifts, deposits).
alter table public.wishes add column visible_to uuid[] check (visible_to is null or cardinality(visible_to) <= 20);
alter table public.needs add column visible_to uuid[] check (visible_to is null or cardinality(visible_to) <= 20);

create function public.may_see(p_visible uuid[], p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_visible is null or p_author in (select public.my_member_ids()) or p_visible && array(select public.my_member_ids())
$$;
revoke execute on function public.may_see(uuid[], uuid) from public, anon;
grant execute on function public.may_see(uuid[], uuid) to authenticated;

-- The author decides who sees it, so the author is the server's to keep: set to the member who adds the
-- record, never changed after. Only members of the same family can be named.
create function public.guard_visible() returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  else
    -- An upsert fires BEFORE INSERT even for an existing row; that row keeps its author.
    execute format('select created_by from public.%I where id = $1', tg_table_name) into author using new.id;
    if author is not null then
      new.created_by := author;
    elsif new.created_by is null then
      new.created_by := (select id from public.members where user_id = auth.uid() and household_id = new.household_id and deleted_at is null);
    elsif new.created_by not in (select public.my_member_ids()) then
      raise exception 'not_yours';
    end if;
  end if;
  if new.visible_to is not null and exists (select 1 from unnest(new.visible_to) v where not public.same_family(new.household_id, v)) then
    raise exception 'wrong_household';
  end if;
  return new;
end $$;
revoke execute on function public.guard_visible() from public, anon;
create trigger wishes_visible before insert or update on public.wishes for each row execute function public.guard_visible();
create trigger needs_visible before insert or update on public.needs for each row execute function public.guard_visible();

drop policy "family reads wishes" on public.wishes;
create policy "family reads wishes" on public.wishes for select to authenticated
  using (household_id in (select public.my_household_ids()) and public.may_see(visible_to, created_by));
drop policy "family updates wishes" on public.wishes;
create policy "family updates wishes" on public.wishes for update to authenticated
  using (household_id in (select public.my_household_ids()) and public.may_see(visible_to, created_by))
  with check (household_id in (select public.my_household_ids()));

drop policy "family reads needs" on public.needs;
create policy "family reads needs" on public.needs for select to authenticated
  using (household_id in (select public.my_household_ids()) and public.may_see(visible_to, created_by));
drop policy "family updates needs" on public.needs;
create policy "family updates needs" on public.needs for update to authenticated
  using (household_id in (select public.my_household_ids()) and public.may_see(visible_to, created_by))
  with check (household_id in (select public.my_household_ids()));

-- The wish's own read policy applies inside these subqueries.
drop policy "family reads metoo" on public.wish_metoo;
create policy "family reads metoo" on public.wish_metoo for select to authenticated
  using (household_id in (select public.my_household_ids()) and wish_id in (select id from public.wishes));
drop policy "family reads deposits" on public.deposits;
create policy "family reads deposits" on public.deposits for select to authenticated
  using (household_id in (select public.my_household_ids()) and (wish_id is null or wish_id in (select id from public.wishes)));
