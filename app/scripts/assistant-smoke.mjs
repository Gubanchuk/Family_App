// Live check of the assistant function: a fresh example.com account starts a family and asks one question.
// Run from app/: node scripts/assistant-smoke.mjs. Costs a few cents of the family's API credit.
// The account is removed later by e2e/cleanup.sql like the other test accounts.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const email = `smoke-${Date.now()}@example.com`;
const { error: e1 } = await sb.auth.signUp({ email, password: `Pw-${Date.now()}-x` });
if (e1) throw e1;
const { error: e2 } = await sb.rpc('create_household', { p_name: 'Проверка', p_my_name: 'Тест', p_color: '#2F6FDB' });
if (e2) throw e2;
const question = process.argv[2] ?? 'Привет! Ответь одним предложением: что ты умеешь?';
const t0 = Date.now();
const { data, error } = await sb.functions.invoke('assistant', {
  body: { mode: 'chat', messages: [{ role: 'user', content: [{ type: 'text', text: '<снимок_семьи>\nСпрашивает: Тест, родитель.\nСегодня: 25 октября 2026, воскресенье.\n</снимок_семьи>' }, { type: 'text', text: question }] }] },
});
console.log('seconds:', ((Date.now() - t0) / 1000).toFixed(1));
if (error) { console.log('invoke error:', error.message, await error.context?.text?.()); process.exit(1); }
console.log('stop_reason:', data.stop_reason, 'error:', data.error ?? '-');
for (const b of data.content ?? []) console.log(`[${b.type}]`, b.type === 'text' ? b.text : b.type === 'tool_use' ? JSON.stringify(b.input) : '');
const check = await sb.functions.invoke('assistant', { body: { mode: 'check_product', product: { title: 'Сыр российский', unit: 'кг', price: 50, dept: 'Молочное и яйца' } } });
console.log('check:', JSON.stringify(check.data ?? check.error?.message));
