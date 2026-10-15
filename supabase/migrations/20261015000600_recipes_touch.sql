-- Recipes take the server clock like every other synced table. Phones notice a changed recipe base by
-- its newest updated_at, so one save from a phone with a wrong clock must not freeze that signal.
create trigger recipes_touch before insert or update on public.recipes for each row execute function public.touch_updated_at();
