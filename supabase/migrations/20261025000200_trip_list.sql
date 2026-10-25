-- «Поход»: the family's list for the next trip to the shop (docs/superpowers/specs/2026-10-25-shop-trip-design.md).
-- A trip line is a line of the shopping list marked in_trip; buying it in the shop is the same mark as on the list.
alter table public.shopping_items add column in_trip boolean not null default false;

-- Lines typed by hand or run out at home were added to be bought soon: they start in the trip.
update public.shopping_items i set in_trip = true
where i.deleted_at is null and i.source in ('manual', 'home')
  and not exists (select 1 from public.shopping_marks m where m.item_id = i.id and (m.bought or m.at_home));
