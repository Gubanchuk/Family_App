import { supabase } from '../../lib/supabase';
import { localDb, type Recipe } from '../../data/db';
import { loadContent } from '../../data/content';
import { toRows, type Draft } from './recipeDraft';

// Phones reload the recipe base when its newest updated_at moves. So the recipe and its products go in
// first, and updated_at moves last: no phone reloads into a recipe whose products are still missing.
export async function saveRecipe(householdId: string, d: Draft, isNew = !d.id): Promise<string> {
  if (!navigator.onLine) throw new Error('offline');
  const { recipe, ingredients } = toRows(d);
  const id = recipe.id as string;
  const r = await supabase.from('recipes').upsert({ ...recipe, household_id: householdId, deleted_at: null });
  if (r.error) throw new Error(r.error.message);
  try {
    const del = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    if (del.error) throw new Error(del.error.message);
    const ins = await supabase.from('recipe_ingredients').insert(ingredients.map((i) => ({ ...i, recipe_id: id })));
    if (ins.error) throw new Error(ins.error.message);
  } catch (err) {
    // A new recipe without products would be an empty card: hide it until «Сохранить» is pressed again.
    if (isNew) await supabase.from('recipes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    throw err;
  }
  const touch = await supabase.from('recipes').update({ updated_at: new Date().toISOString() }).eq('id', id);
  if (touch.error) throw new Error(touch.error.message);
  await loadContent(localDb, supabase, { force: true });
  return id;
}

export async function deleteRecipe(r: Recipe) {
  if (!navigator.onLine) throw new Error('offline');
  const now = new Date().toISOString();
  const { error } = await supabase.from('recipes').update({ deleted_at: now, updated_at: now }).eq('id', r.id);
  if (error) throw new Error(error.message);
  await loadContent(localDb, supabase, { force: true });
}
