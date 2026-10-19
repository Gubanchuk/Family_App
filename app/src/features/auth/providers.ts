import { API_URL, SUPABASE_KEY } from '../../lib/supabase';

// With a provider switched off the server answers the sign-in redirect with a bare JSON error page,
// so the screen asks first. null means the check itself failed: then the redirect goes ahead.
export async function googleEnabled(fetcher: typeof fetch = (...a) => fetch(...a)): Promise<boolean | null> {
  try {
    const r = await fetcher(`${API_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    if (!r.ok) return null;
    const body = (await r.json()) as { external?: Record<string, boolean> };
    return Boolean(body.external?.google);
  } catch { return null; }
}
