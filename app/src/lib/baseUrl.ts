// Where the base is and which road the app takes to it; kept apart from the client so screens can read it without supabase-js.

// Fallbacks keep tests and a misconfigured build from crashing on import; requests then fail visibly.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'missing-key';

// The key auth-js would pick by default, named here so the app can read the stored session offline.
// It stays tied to the base itself, so going through the site's address signs nobody out.
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

// Phones in Russia open the vercel.app site, while supabase.co behind Cloudflare is cut after ~16 KB.
// So a site build talks to the base through the site's own /sb/ (a rewrite in vercel.json): data,
// sign-in, photos and functions. VITE_SUPABASE_PROXY set to an empty value goes back to the direct address.
export function apiUrl(proxy: string | undefined, direct: string, origin: string | null): string {
  return proxy && origin ? new URL(proxy, origin).href.replace(/\/$/, '') : direct;
}
const PROXY = (import.meta.env.VITE_SUPABASE_PROXY as string | undefined) ?? (import.meta.env.PROD ? '/sb' : '');
export const API_URL = apiUrl(PROXY, SUPABASE_URL, typeof location === 'undefined' ? null : location.origin);
