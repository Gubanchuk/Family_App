import { createClient } from '@supabase/supabase-js';

// Fallbacks keep tests and a misconfigured build from crashing on import; requests then fail visibly.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'missing-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
