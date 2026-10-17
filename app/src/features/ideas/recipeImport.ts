import { supabase } from '../../lib/supabase';
import type { PageRecipe } from '../../../../supabase/functions/_shared/recipePage';

type Invoke = (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }>;
const invokeFn: Invoke = (name, opts) => supabase.functions.invoke(name, opts as never);

// Asks the recipe-import function to read the page; null for anything that did not work out.
export async function fetchRecipe(url: string, invoke: Invoke = invokeFn): Promise<PageRecipe | null> {
  try {
    const { data, error } = await invoke('recipe-import', { body: { url } });
    const recipe = (data as { recipe?: PageRecipe } | null)?.recipe;
    return error || !recipe ? null : recipe;
  } catch {
    return null;
  }
}

export { fromPage, matchLine } from './recipeMatch';
