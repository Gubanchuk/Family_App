import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { ThemeChoice } from '../../lib/theme';

type Db = Pick<SupabaseClient, 'from'>;
const VALID = ['light', 'dark', 'auto'];

export async function saveThemeChoice(memberId: string, choice: ThemeChoice, db: Db = supabase) {
  await db.from('member_settings').update({ theme: choice, updated_at: new Date().toISOString() }).eq('member_id', memberId);
}

export async function loadThemeChoice(memberId: string, db: Db = supabase): Promise<ThemeChoice | null> {
  const { data } = await db.from('member_settings').select('theme').eq('member_id', memberId).maybeSingle();
  const t = (data as { theme?: string } | null)?.theme;
  return t && VALID.includes(t) ? (t as ThemeChoice) : null;
}
