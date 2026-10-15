import { supabase } from '../../lib/supabase';
import { localDb, type Recipe } from '../../data/db';
import { loadContent } from '../../data/content';
import { toRows, type Draft } from './recipeDraft';

// Recipes have no trigger stamping updated_at; the phones notice a changed base by its newest
// updated_at, so every write sets it.
export async function saveRecipe(householdId: string, d: Draft): Promise<string> {
  if (!navigator.onLine) throw new Error('offline');
  const { recipe, ingredients } = toRows(d);
  const id = recipe.id as string;
  const r = await supabase.from('recipes').upsert({ ...recipe, household_id: householdId, deleted_at: null, updated_at: new Date().toISOString() });
  if (r.error) throw new Error(r.error.message);
  const del = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
  if (del.error) throw new Error(del.error.message);
  const ins = await supabase.from('recipe_ingredients').insert(ingredients.map((i) => ({ ...i, recipe_id: id })));
  if (ins.error) throw new Error(ins.error.message);
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
