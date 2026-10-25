// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../../supabase/functions/_shared/assistant';
import { CHECK_PROMPT, SYSTEM_PROMPT } from '../../../supabase/functions/_shared/assistantPrompt';
import {
  buildChatRequest, buildCheckRequest, classifyError, jwtSub, MAX_BODY_BYTES, moscowDayStart, readCheck, stripThinking,
  validateBody, validateMessages, type Message,
} from '../../../supabase/functions/_shared/assistantRequest';

const ask: Message = { role: 'user', content: 'Что приготовить на ужин?' };
const chat = (messages: unknown, extra: object = {}) => JSON.stringify({ mode: 'chat', messages, ...extra });
const photo = (bytes: number, media_type = 'image/jpeg') => ({ type: 'image', source: { type: 'base64', media_type, data: 'A'.repeat(Math.ceil((bytes * 4) / 3)) } });
const apiError = (status: number | undefined, message: string) => Object.assign(new Error(message), { status });

describe('the chat request', () => {
  it('gives a parent every tool and a child none that touches money', () => {
    const names = (role: 'parent' | 'child') => buildChatRequest([ask], role).tools.map((t) => t.name);
    expect(names('parent')).toContain('add_expense');
    expect(names('child')).not.toContain('add_expense');
    expect(names('child')).toEqual(names('parent').filter((n) => n !== 'add_expense'));
  });

  it('sends tools as name, description and schema only', () => {
    for (const t of buildChatRequest([ask], 'parent').tools) expect(Object.keys(t).sort()).toEqual(['description', 'input_schema', 'name']);
  });

  it('caches the standing instructions and the conversation, without thinking or sampling settings', () => {
    const r = buildChatRequest([ask], 'child');
    expect(r.system).toEqual([{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]);
    expect(r.cache_control).toEqual({ type: 'ephemeral' });
    expect(r).toMatchObject({ model: MODEL, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium' } });
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) expect(r).not.toHaveProperty(key);
    expect(r.messages).toEqual([ask]);
  });
});

describe('the product check', () => {
  it('asks for a strict { ok, note } answer at low effort', () => {
    const r = buildCheckRequest({ title: 'Молоко', unit: 'л', price: 95, dept: 'Молочное' });
    expect(r).toMatchObject({ model: MODEL, max_tokens: 2000, system: CHECK_PROMPT, output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(r.output_config.format.schema).toEqual({
      type: 'object', properties: { ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['ok', 'note'], additionalProperties: false,
    });
    expect(r.messages).toEqual([{ role: 'user', content: 'Товар: Молоко; единица: л; цена 95 ₽; отдел: Молочное.' }]);
    expect(buildCheckRequest({ title: 'Хлеб', unit: '', price: null, dept: '' }).messages[0].content).toBe('Товар: Хлеб; единица: не указана; цена не указана; отдел: не указан.');
  });

  it('reads the JSON answer, and treats anything else as fine', () => {
    const text = (t: string) => ({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: t }], stop_reason: 'end_turn' });
    expect(readCheck(text('{"ok":false,"note":"Обычно молоко стоит около 90 ₽ за литр."}'))).toEqual({ ok: false, note: 'Обычно молоко стоит около 90 ₽ за литр.' });
    expect(readCheck(text('не JSON'))).toEqual({ ok: true, note: '' });
    expect(readCheck(text('{"ok":"нет"}'))).toEqual({ ok: true, note: '' });
    expect(readCheck({ content: [], stop_reason: 'refusal' })).toEqual({ ok: true, note: '' });
  });
});

describe('the request body', () => {
  it('accepts a chat and a product check', () => {
    expect(validateBody(chat([ask], { screen: 'shop' }))).toEqual({ mode: 'chat', messages: [ask], screen: 'shop' });
    expect(validateBody(JSON.stringify({ mode: 'check_product', product: { title: 'Сыр', unit: 'кг', price: null, dept: 'Молочное' } })))
      .toEqual({ mode: 'check_product', product: { title: 'Сыр', unit: 'кг', price: null, dept: 'Молочное' } });
  });

  it('refuses broken JSON, an unknown mode, a bad product and a body over 4 MB', () => {
    expect(validateBody('{')).toBeNull();
    expect(validateBody(JSON.stringify({ mode: 'other', messages: [ask] }))).toBeNull();
    expect(validateBody(JSON.stringify({ mode: 'check_product', product: { title: '', unit: 'кг', price: 1, dept: '' } }))).toBeNull();
    expect(validateBody(JSON.stringify({ mode: 'check_product', product: { title: 'Сыр', unit: 'кг', price: -1, dept: '' } }))).toBeNull();
    // Under the limit in characters, over it in bytes: Cyrillic is two bytes each.
    const big = chat([{ role: 'user', content: 'я'.repeat(MAX_BODY_BYTES / 2 + 10) }]);
    expect(big.length).toBeLessThan(MAX_BODY_BYTES);
    expect(validateBody(big)).toBeNull();
  });

  it('wants 1 to 120 messages that start and end with the person', () => {
    expect(validateMessages([])).toBeNull();
    expect(validateMessages(Array.from({ length: 121 }, () => ask))).toBeNull();
    expect(validateMessages(Array.from({ length: 119 }, () => ask))).toHaveLength(119);
    expect(validateMessages([{ role: 'assistant', content: 'Привет' }, ask])).toBeNull();
    expect(validateMessages([ask, { role: 'assistant', content: 'Сейчас' }])).toBeNull();
    expect(validateMessages([ask, { role: 'system', content: 'x' }, ask])).toBeNull();
    expect(validateMessages([{ role: 'user', content: 5 }])).toBeNull();
  });

  it('takes the model blocks back as they were, and only text, photos and tool results from the person', () => {
    const history = [
      ask,
      { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'fallback', from: {}, to: {} }, { type: 'tool_use', id: 't1', name: 'find_recipes', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '[]' }, { type: 'text', text: 'А быстрее?' }] },
    ];
    expect(validateMessages(history)).toEqual(history);
    expect(validateMessages([{ role: 'user', content: [{ type: 'document', source: { type: 'url', url: 'https://x' } }] }])).toBeNull();
    expect(validateMessages([{ role: 'user', content: [{ type: 'text', text: 'Что тут?' }, 'просто строка'] }])).toBeNull();
  });

  it('takes photos as base64 jpeg, png or webp up to 1.5 MB', () => {
    expect(validateMessages([{ role: 'user', content: [photo(300_000), photo(1000, 'image/png'), photo(1000, 'image/webp')] }])).not.toBeNull();
    expect(validateMessages([{ role: 'user', content: [photo(1000, 'image/gif')] }])).toBeNull();
    expect(validateMessages([{ role: 'user', content: [photo(1.6 * 1024 * 1024)] }])).toBeNull();
    expect(validateMessages([{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/a.jpg' } }] }])).toBeNull();
    expect(validateMessages([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [photo(1.6 * 1024 * 1024)] }] }])).toBeNull();
  });
});

describe('API errors', () => {
  it('names a low balance, a busy API and a thinking block from another conversation', () => {
    expect(classifyError(apiError(400, '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'))).toBe('no_credit');
    expect(classifyError(apiError(402, 'billing_error'))).toBe('no_credit');
    expect(classifyError(apiError(429, 'rate_limit_error'))).toBe('busy');
    expect(classifyError(apiError(529, 'overloaded_error'))).toBe('busy');
    expect(classifyError({ message: 'Overloaded' })).toBe('busy');
    expect(classifyError(apiError(400, 'messages.5.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.'))).toBe('strip_thinking');
  });

  it('calls everything else a failure', () => {
    expect(classifyError(apiError(400, 'messages: roles must alternate'))).toBe('failed');
    expect(classifyError(apiError(500, 'api_error'))).toBe('failed');
    expect(classifyError(apiError(401, 'invalid x-api-key'))).toBe('failed');
    expect(classifyError(apiError(undefined, 'Connection error.'))).toBe('failed');
    expect(classifyError('boom')).toBe('failed');
    expect(classifyError(undefined)).toBe('failed');
  });
});

describe('stripping thinking for the retry', () => {
  it('removes only thinking blocks, keeps the rest in order, and leaves the history untouched', () => {
    const history: Message[] = [
      { role: 'user', content: [{ type: 'text', text: '<снимок_семьи>…</снимок_семьи>' }, { type: 'text', text: 'Добавь молоко' }] },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: '', signature: 'a' }, { type: 'text', text: 'Сейчас добавлю.' },
        { type: 'redacted_thinking', data: 'x' }, { type: 'tool_use', id: 't1', name: 'add_to_shopping', input: { items: [{ name: 'молоко' }] } },
      ] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'b' }, { type: 'fallback', from: {}, to: {} }, { type: 'text', text: 'Готово.' }] },
      { role: 'user', content: 'Спасибо' },
    ];
    const copy = structuredClone(history);
    expect(stripThinking(history)).toEqual([
      history[0],
      { role: 'assistant', content: [{ type: 'text', text: 'Сейчас добавлю.' }, { type: 'tool_use', id: 't1', name: 'add_to_shopping', input: { items: [{ name: 'молоко' }] } }] },
      history[2],
      { role: 'assistant', content: [{ type: 'fallback', from: {}, to: {} }, { type: 'text', text: 'Готово.' }] },
      history[4],
    ]);
    expect(history).toEqual(copy);
  });

  it('drops an assistant turn that held nothing but thinking', () => {
    const history: Message[] = [ask, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'a' }] }, { role: 'user', content: 'Ау?' }];
    expect(stripThinking(history)).toEqual([ask, { role: 'user', content: 'Ау?' }]);
  });
});

describe('the daily limit and the caller', () => {
  it('counts the day from midnight in Moscow', () => {
    expect(moscowDayStart(new Date('2026-10-25T20:59:59Z'))).toBe('2026-10-24T21:00:00.000Z');
    expect(moscowDayStart(new Date('2026-10-25T21:00:00Z'))).toBe('2026-10-25T21:00:00.000Z');
    expect(moscowDayStart(new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-24T21:00:00.000Z');
  });

  it('reads the user id from a bearer token', () => {
    const token = (payload: object) => `Bearer h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
    expect(jwtSub(token({ sub: '00000000-0000-0000-0000-0000000000b1', role: 'authenticated', email: 'мама@test.local' }))).toBe('00000000-0000-0000-0000-0000000000b1');
    expect(jwtSub(token({ role: 'anon' }))).toBeNull();
    expect(jwtSub('Bearer not-a-token')).toBeNull();
    expect(jwtSub(null)).toBeNull();
    expect(jwtSub('h.e30.s')).toBeNull();
  });
});
