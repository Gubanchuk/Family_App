-- The shopping department a thing to buy goes to, chosen when it is added (null: guessed by its name).
alter table public.needs add column dept text check (dept is null or length(dept) between 1 and 40);
