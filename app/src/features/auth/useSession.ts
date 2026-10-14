import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, supabase } from '../../lib/supabase';

// auth-js keeps the stored session only when a token refresh failed for network reasons
// (it clears it on sign-out or a revoked token), so a stored account means: work offline.
export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    const user = s?.user ?? s?.currentSession?.user;
    return user?.id ? ({ ...s, user } as Session) : null;
  } catch { return null; }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    // Without network auth-js retries the refresh for about 25 s; open the app from the stored account at once.
    if (navigator.onLine === false) {
      const s = storedSession();
      if (s) { setSession(s); setLoading(false); }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? storedSession());
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (s) setSession(s);
      else if (event === 'SIGNED_OUT') setSession(null);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  return { session, loading };
}
