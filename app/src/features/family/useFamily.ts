import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type Member = { id: string; household_id: string; user_id: string | null; name: string; color: string; role: 'parent' | 'child'; is_owner: boolean; portion: number };

export function useFamily(session: Session | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!session) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('members').select('id, household_id, user_id, name, color, role, is_owner, portion').is('deleted_at', null).order('created_at');
    setMembers((data ?? []).map((m) => ({ ...m, portion: Number(m.portion) })) as Member[]);
    setLoading(false);
  }, [session]);
  useEffect(() => { load(); }, [load]);
  const me = members.find((m) => m.user_id === session?.user.id) ?? null;
  return { me, members, loading, reload: load };
}
