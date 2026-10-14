import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { Kin } from './kin';

// kin is optional: families remembered on a phone before it existed have no such field.
export type Member = { id: string; household_id: string; user_id: string | null; name: string; color: string; role: 'parent' | 'child'; is_owner: boolean; portion: number; kin?: Kin | null; avatar_path?: string | null };

const cacheKey = (userId: string) => `fa.members.${userId}`;

function remembered(userId: string): Member[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as Member[]) : null;
  } catch { return null; }
}

function remember(userId: string, members: Member[]) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(members)); } catch { /* storage unavailable */ }
}

// Keyed on the user id: auth-js hands out a fresh session object on every token refresh and
// whenever the app becomes visible, which must not reload or blank the screen.
export function useFamily(session: Session | null) {
  const userId = session?.user.id ?? null;
  const [members, setMembers] = useState<Member[]>(() => (userId ? remembered(userId) ?? [] : []));
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setMembers([]); setError(false); setLoadedFor(null); return; }
    // All columns rather than a list: an app that updates before the database does still loads the family.
    const { data, error: e } = await supabase.from('members').select('*').is('deleted_at', null).order('created_at');
    if (e || !data) {
      const cached = remembered(userId);
      if (cached) setMembers(cached);
      setError(!cached);
    } else {
      const list = data.map((m) => ({
        id: m.id, household_id: m.household_id, user_id: m.user_id, name: m.name, color: m.color, role: m.role,
        is_owner: m.is_owner, portion: Number(m.portion), kin: m.kin ?? null, avatar_path: m.avatar_path ?? null,
      })) as Member[];
      // Reloads run after every sync; an unchanged family keeps its object so screens do not redraw.
      setMembers((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
      setError(false);
      remember(userId, list);
    }
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  // Only the first load for a person blanks the screen; reloads keep the family on screen.
  const loading = loadedFor !== userId;
  const me = loading ? null : members.find((m) => m.user_id === userId) ?? null;
  return { me, members, loading, error, reload: load };
}
