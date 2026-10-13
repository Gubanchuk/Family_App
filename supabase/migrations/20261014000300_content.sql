create table public.ingredients (
  item text primary key, unit text not null check (unit in ('г', 'мл', 'шт')), dept text not null, grp text not null,
  piece_weight numeric, piece_name text, pantry boolean not null default false
);
create table public.prices (
  item text primary key references public.ingredients (item) on delete cascade,
  price_per_unit numeric not null check (price_per_unit > 0), source text not null, note text, collected date not null
);
create table public.recipes (
  id text primary key, household_id uuid references public.households (id) on delete cascade,
  name text not null, about text not null default '', category text not null, meals text[] not null,
  time_active int not null, time_total int not null, servings int not null check (servings > 0), keeps_days int not null default 1,
  protein text not null, tags text[] not null default '{}', season text[] not null default '{any}', collections text[] not null default '{}',
  dima_level text not null check (dima_level in ('ok', 'adapt', 'skip')), dima_note text not null default '',
  steps text[] not null, source_url text, source_site text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.recipe_ingredients (
  recipe_id text not null references public.recipes (id) on delete cascade, pos int not null,
  item text not null references public.ingredients (item), qty numeric, to_taste boolean not null default false,
  note text not null default '', optional boolean not null default false,
  primary key (recipe_id, pos)
);
create table public.recipe_sides (
  recipe_id text not null references public.recipes (id) on delete cascade,
  side_id text not null references public.recipes (id) on delete cascade,
  primary key (recipe_id, side_id)
);
create table public.week_templates (
  id text primary key, household_id uuid references public.households (id) on delete cascade,
  name text not null, season text[] not null default '{any}', note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.template_slots (
  template_id text not null references public.week_templates (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('breakfast', 'lunch', 'snack', 'dinner')),
  dish_id text references public.recipes (id), side_id text references public.recipes (id), salad_id text references public.recipes (id),
  simple jsonb,
  primary key (template_id, day, meal),
  check (dish_id is not null or simple is not null)
);

alter table public.ingredients enable row level security;
alter table public.prices enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_sides enable row level security;
alter table public.week_templates enable row level security;
alter table public.template_slots enable row level security;

create policy "signed-in read the vocabulary" on public.ingredients for select to authenticated using (true);
create policy "signed-in read prices" on public.prices for select to authenticated using (true);
create policy "base or own recipes" on public.recipes for select to authenticated using (household_id is null or household_id in (select public.my_household_ids()));
create policy "family adds recipes" on public.recipes for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits own recipes" on public.recipes for update to authenticated using (household_id in (select public.my_household_ids()));
create policy "ingredients of visible recipes" on public.recipe_ingredients for select to authenticated using (recipe_id in (select id from public.recipes));
create policy "family writes own recipe ingredients" on public.recipe_ingredients for all to authenticated
  using (recipe_id in (select id from public.recipes where household_id in (select public.my_household_ids())))
  with check (recipe_id in (select id from public.recipes where household_id in (select public.my_household_ids())));
create policy "sides of visible recipes" on public.recipe_sides for select to authenticated using (recipe_id in (select id from public.recipes));
create policy "base or own templates" on public.week_templates for select to authenticated using (household_id is null or household_id in (select public.my_household_ids()));
create policy "family saves templates" on public.week_templates for insert to authenticated with check (household_id in (select public.my_household_ids()));
create policy "family edits own templates" on public.week_templates for update to authenticated using (household_id in (select public.my_household_ids()));
create policy "slots of visible templates" on public.template_slots for select to authenticated using (template_id in (select id from public.week_templates));
create policy "family writes own template slots" on public.template_slots for all to authenticated
  using (template_id in (select id from public.week_templates where household_id in (select public.my_household_ids())))
  with check (template_id in (select id from public.week_templates where household_id in (select public.my_household_ids())));

grant select on public.ingredients, public.prices, public.recipes, public.recipe_ingredients, public.recipe_sides, public.week_templates, public.template_slots to authenticated;
grant insert, update on public.recipes, public.week_templates to authenticated;
grant insert, update, delete on public.recipe_ingredients, public.template_slots to authenticated;
