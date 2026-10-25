import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createLocalDb, type LocalDb } from '../../data/db';
import type { Member } from '../family/useFamily';
import { seedMenu } from '../menu/testData';
import { AssistantSession, ERROR_TEXT, imageFromBlob, MAX_CALLS, useAssistant } from './loop';
import type { ApiMessage, ApiReply, Block, ChatBody } from './types';

const papa: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1, kin: 'father' };
const mama: Member = { ...papa, id: 'm-mama', user_id: 'u2', name: 'Мама', is_owner: false, kin: 'mother' };
const son: Member = { ...papa, id: 'm-son', user_id: 'u3', name: 'Сын', role: 'child', is_owner: false, kin: 'son' };
const family = [papa, mama, son];
const NOW = new Date(2026, 9, 13, 18, 5);

const text = (t: string): Block => ({ type: 'text', text: t });
const thinking: Block = { type: 'thinking', thinking: '', signature: 'sig-1' };
const use = (id: string, name: string, input: unknown): Block => ({ type: 'tool_use', id, name, input });
const reply = (...content: Block[]): ApiReply => ({ content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' });

// A fake function: answers from a script and keeps a copy of every request.
function fakeApi(script: Array<ApiReply | ((n: number) => ApiReply)>) {
  const calls: ChatBody[] = [];
  const api = async (body: ChatBody) => {
    calls.push(structuredClone(body));
    const next = script.length > 1 ? script.shift()! : script[0];
    return typeof next === 'function' ? next(calls.length) : structuredClone(next);
  };
  return { api, calls };
}

async function setup(script: Array<ApiReply | ((n: number) => ApiReply)>, me: Member = papa, db?: LocalDb) {
  const base = db ?? createLocalDb(`t-${Math.random()}`);
  if (!db) {
    await seedMenu(base);
    await base.meta.put({ key: 'features', value: ['homeCart', 'tripList'] });
  }
  const { api, calls } = fakeApi(script);
  const s = new AssistantSession({ db: base, me, members: family, api, now: () => NOW });
  await s.ready;
  return { s, calls, db: base };
}

// What the Messages API insists on: the person speaks first, and every tool_use of an assistant turn has exactly
// one tool_result in the very next message, which is the person's.
function expectValidHistory(messages: ApiMessage[]) {
  expect(messages[0]?.role).toBe('user');
  const answered = new Set<string>();
  messages.forEach((m, i) => {
    const results = m.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id as string);
    if (m.role === 'assistant') {
      expect(results).toEqual([]);
      const ids = m.content.filter((b) => b.type === 'tool_use').map((b) => b.id as string);
      if (!ids.length) return;
      const next = messages[i + 1];
      if (!next) return;
      expect(next.role).toBe('user');
      const got = next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id as string);
      expect(got.sort()).toEqual([...ids].sort());
      // Results come first; the next message may hold them and nothing else.
      expect(next.content.every((b) => b.type === 'tool_result')).toBe(true);
    } else {
      for (const id of results) {
        expect(answered.has(id)).toBe(false);
        answered.add(id);
        const prev = messages[i - 1];
        expect(prev?.role === 'assistant' && prev.content.some((b) => b.type === 'tool_use' && b.id === id)).toBe(true);
      }
    }
  });
}
const stored = async (db: LocalDb, id = 'm-papa') => (await db.assistant_chats.where('member_id').equals(id).toArray()).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
const results = (m: ApiMessage) => m.content.filter((b) => b.type === 'tool_result');

describe('assistant conversation', () => {
  it('answers a plain question and keeps the reply exactly as it came', async () => {
    const answer = reply(thinking, { type: 'fallback', model: 'x' }, text('Здравствуйте!'), text('Чем помочь?'));
    const { s, calls, db } = await setup([answer]);
    await s.send('Привет', [], 'home');
    expect(calls).toHaveLength(1);
    expect(calls[0].screen).toBe('home');
    const first = calls[0].messages[0];
    expect(first.role).toBe('user');
    expect(String(first.content[0].text)).toMatch(/^<снимок_семьи>/);
    expect(first.content.at(-1)).toEqual(text('Привет'));
    const st = s.getState();
    expect(st.items.map((i) => (i.type === 'action' ? 'action' : `${i.type}:${i.text}`))).toEqual(['user:Привет', 'assistant:Здравствуйте!\n\nЧем помочь?']);
    expect(st.thinking).toBe(false);
    expect(st.error).toBeNull();
    const t = await stored(db);
    expect(t.messages).toHaveLength(2);
    expect(t.messages[1]).toEqual({ role: 'assistant', content: (answer as { content: Block[] }).content });
    expectValidHistory(t.messages);
  });

  it('sends the snapshot again only when it changed, and photos as base64 images', async () => {
    const { s, calls, db } = await setup([reply(text('Ок'))]);
    await s.send('Первый');
    await s.send('Второй', [{ media_type: 'image/jpeg', data: 'AAAA' }]);
    const second = calls[1].messages[2];
    expect(second.content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, text('Второй')]);
    expect(s.getState().items[2]).toMatchObject({ type: 'user', text: 'Второй', images: ['data:image/jpeg;base64,AAAA'] });
    await db.home_stock.put({ household_id: 'h1', key: 'молоко', item: 'молоко', title: 'Молоко', dept: 'Молочное и яйца', state: 'have', by_member: 'm-papa', updated_at: 'x', deleted_at: null });
    await s.send('Третий');
    expect(String(calls[2].messages[4].content[0].text)).toContain('Дома есть: Молоко');
  });

  it('runs a search and an action from one reply, then sends both results in one message', async () => {
    const { s, calls, db } = await setup([
      reply(text('Сейчас найду и добавлю.'), use('t1', 'find_recipes', { query: 'сырники' }), use('t2', 'add_to_shopping', { items: [{ name: 'молоко', amount: 1, unit: 'л' }] })),
      reply(text('Готово: молоко в походе.')),
    ]);
    await s.send('Найди сырники и добавь молоко');
    expect(calls).toHaveLength(2);
    const sent = calls[1].messages;
    expect(sent).toHaveLength(3);
    const res = results(sent[2]);
    expect(res.map((b) => [b.tool_use_id, b.is_error])).toEqual([['t1', false], ['t2', false]]);
    expect(JSON.parse(String(res[0].content)).recipes[0].name).toBe('Сырники');
    expect((await db.shopping_items.toArray()).map((i) => [i.title, i.qty_text])).toEqual([['Молоко', '1 л']]);
    const st = s.getState();
    expect(st.cards).toEqual([expect.objectContaining({ id: 't2', tool: 'add_to_shopping', kind: 'auto', summary: 'В поход: молоко 1 л', status: 'done' })]);
    expect(st.items.map((i) => i.type)).toEqual(['user', 'assistant', 'action', 'assistant']);
    expectValidHistory((await stored(db)).messages);
    // Undo takes the line back and the model hears about it with the next question.
    await st.cards[0].undo!();
    expect(s.getState().cards[0].status).toBe('undone');
    expect((await db.shopping_items.toArray())[0].deleted_at).toBeTruthy();
    await s.send('Спасибо');
    const last = calls[2].messages.at(-1)!;
    expect(last.content.some((b) => String(b.text ?? '').includes('Человек отменил: В поход: молоко 1 л'))).toBe(true);
    expect(s.getState().items.at(-2)).toMatchObject({ type: 'user', text: 'Спасибо' });
  });

  it('waits for «Сделать» before an action others will see', async () => {
    const { s, calls, db } = await setup([reply(text('Попрошу Маму.'), use('t1', 'ask_family', { to: 'Мама', text: 'Купи хлеб' })), reply(text('Попросил.'))]);
    await s.send('Попроси маму купить хлеб');
    expect(calls).toHaveLength(1);
    expect(s.getState().cards).toEqual([expect.objectContaining({ id: 't1', kind: 'confirm', status: 'pending', summary: 'Попросить на Доске: Мама — «Купи хлеб»' })]);
    expect(await db.requests.count()).toBe(0);
    await s.decide('t1', true);
    expect(await db.requests.toArray()).toEqual([expect.objectContaining({ to_id: 'm-mama', title: 'Купи хлеб' })]);
    expect(calls).toHaveLength(2);
    expect(results(calls[1].messages[2])).toEqual([expect.objectContaining({ tool_use_id: 't1', is_error: false })]);
    expect(s.getState().cards[0].status).toBe('done');
    expect(s.getState().cards[0].undo).toBeUndefined();
    expectValidHistory((await stored(db)).messages);
  });

  it('tells the model «Не надо» when the person declines', async () => {
    const { s, calls, db } = await setup([reply(use('t1', 'ask_family', { to: 'Мама', text: 'Купи хлеб' })), reply(text('Хорошо, не буду.'))]);
    await s.send('Попроси маму купить хлеб');
    await s.decide('t1', false);
    expect(await db.requests.count()).toBe(0);
    expect(results(calls[1].messages[2])).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'Человек ответил «Не надо»', is_error: false }]);
    expect(s.getState().cards[0].status).toBe('declined');
    expectValidHistory((await stored(db)).messages);
  });

  it('closes an unanswered card when the person writes on instead', async () => {
    const { s, calls, db } = await setup([reply(use('t1', 'ask_family', { to: 'Мама', text: 'Купи хлеб' })), reply(text('Поняла.'))]);
    await s.send('Попроси маму купить хлеб');
    await s.send('Нет, лучше попрошу сама');
    expect(s.getState().cards[0].status).toBe('declined');
    const sent = calls[1].messages;
    expect(results(sent[2])).toEqual([expect.objectContaining({ tool_use_id: 't1', is_error: false })]);
    expect(sent[3].content.at(-1)).toEqual(text('Нет, лучше попрошу сама'));
    expectValidHistory((await stored(db)).messages);
  });

  it('never runs a parent-only action for a child', async () => {
    const { s, calls, db } = await setup([reply(use('t1', 'add_expense', { amount: 500, note: 'Магнит' })), reply(text('Это могут только родители.'))], son);
    await s.send('Внеси 500 рублей');
    expect(calls).toHaveLength(2);
    expect(results(calls[1].messages[2])).toEqual([expect.objectContaining({ tool_use_id: 't1', is_error: true })]);
    expect(String(results(calls[1].messages[2])[0].content)).toMatch(/нет доступа/i);
    expect(s.getState().cards).toEqual([]);
    expect(await db.money_entries.count()).toBe(0);
    expectValidHistory((await stored(db, 'm-son')).messages);
  });

  it('keeps the question after a network error, and «Повторить» sends it once', async () => {
    const { s, calls, db } = await setup([{ error: 'network' }, reply(text('Теперь на связи.'))]);
    await s.send('Что на ужин?');
    expect(s.getState().error).toBe('Нет связи. Помощнику нужен интернет.');
    expect((await stored(db)).messages).toHaveLength(1);
    expect(s.getState().items.map((i) => i.type)).toEqual(['user']);
    await s.retry();
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toEqual(calls[0].messages);
    expect(s.getState().error).toBeNull();
    expect((await stored(db)).messages).toHaveLength(2);
  });

  it('retries the tool results, not the question, when the network drops after an action', async () => {
    const { s, calls, db } = await setup([reply(use('t1', 'add_to_shopping', { items: [{ name: 'хлеб' }] })), { error: 'network' }, reply(text('Добавил.'))]);
    await s.send('Добавь хлеб');
    expect(s.getState().errorCode).toBe('network');
    await s.retry();
    expect(calls).toHaveLength(3);
    expect(calls[2].messages).toEqual(calls[1].messages);
    expect(await db.shopping_items.count()).toBe(1);
    expectValidHistory((await stored(db)).messages);
  });

  it('gives each error its own plain sentence', async () => {
    expect(ERROR_TEXT.no_credit).toBe('У помощника закончился лимит на этот месяц. Он обновится с новым месяцем подписки.');
    expect(ERROR_TEXT.daily_limit).toBe('На сегодня помощник устал: дневной лимит семьи исчерпан. Завтра снова в строю.');
    expect(ERROR_TEXT.busy).toBe('Помощник сейчас перегружен. Попробуйте через минуту.');
    expect(ERROR_TEXT.refusal).toBe('Помощник не может ответить на это.');
    expect(ERROR_TEXT.failed).toBe('Что-то пошло не так. Попробуйте ещё раз.');
    expect(ERROR_TEXT.bad_request).toBe('Что-то пошло не так. Попробуйте ещё раз.');
    expect(ERROR_TEXT.not_member).toBe('Помощник работает только для членов семьи.');
    const { s } = await setup([{ error: 'daily_limit' }]);
    await s.send('Привет');
    expect(s.getState()).toMatchObject({ errorCode: 'daily_limit', error: ERROR_TEXT.daily_limit, thinking: false });
  });

  it(`stops after ${MAX_CALLS} calls on one question, with a history the API still accepts`, async () => {
    const { s, calls, db } = await setup([(n) => reply(use(`t${n}`, 'find_recipes', { query: 'суп' }))]);
    await s.send('Найди суп');
    expect(calls).toHaveLength(MAX_CALLS);
    expect(s.getState().errorCode).toBe('limit');
    const t = await stored(db);
    expect(t.messages.at(-1)!.role).toBe('user');
    expectValidHistory(t.messages);
    // «Повторить» goes on from there with a fresh allowance.
    await s.retry();
    expect(calls).toHaveLength(MAX_CALLS * 2);
  });

  it('starts a new conversation by itself when this one grows too long, and says so', async () => {
    const db = createLocalDb(`t-${Math.random()}`);
    await seedMenu(db);
    const long: ApiMessage[] = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: [text(`сообщение ${i}`)] }));
    await db.assistant_chats.put({ id: 'c-long', member_id: 'm-papa', messages: long, snapshot_hash: 'old', updated_at: 'x' });
    const { s, calls } = await setup([reply(text('Начнём заново.'))], papa, db);
    expect(s.getState().items).toHaveLength(80);
    await s.send('Привет');
    expect(calls[0].messages).toHaveLength(1);
    expect(String(calls[0].messages[0].content[0].text)).toMatch(/^<снимок_семьи>/);
    expect(s.getState().wasReset).toBe(true);
    expect(s.getState().items).toHaveLength(2);
    await s.newThread();
    expect(s.getState()).toMatchObject({ wasReset: false, items: [] });
    // Both earlier conversations stay in the list; an empty new one is kept only once something is said.
    expect((await db.assistant_chats.toArray()).map((c) => c.messages.length).sort((a, b) => a - b)).toEqual([2, 80]);
  });

  it('comes back after the app restarts: the conversation and a card still waiting', async () => {
    const { s, db } = await setup([reply(text('Попрошу.'), use('t1', 'ask_family', { to: 'Мама', text: 'Купи хлеб' })), reply(text('Попросил.'))]);
    await s.send('Попроси маму купить хлеб');
    const { api, calls } = fakeApi([reply(text('Попросил.'))]);
    const again = new AssistantSession({ db, me: papa, members: family, api, now: () => NOW });
    await again.ready;
    expect(again.getState().items.map((i) => i.type)).toEqual(['user', 'assistant', 'action']);
    expect(again.getState().cards[0]).toMatchObject({ id: 't1', status: 'pending' });
    await again.decide('t1', true);
    expect(calls).toHaveLength(1);
    expect(await db.requests.count()).toBe(1);
    expectValidHistory((await stored(db)).messages);
  });
});

describe('assistant hook', () => {
  it('shows the conversation and sends with the screen it was opened from', async () => {
    const { s, calls } = await setup([reply(text('Здравствуйте!'))]);
    const { result } = renderHook(() => useAssistant(papa, family, 'shop', { session: s }));
    expect(result.current.loaded).toBe(true);
    let taken = false;
    await act(async () => { taken = await result.current.send('Привет'); });
    expect(taken).toBe(true);
    expect(calls[0].screen).toBe('shop');
    await waitFor(() => expect(result.current.items.map((i) => i.type)).toEqual(['user', 'assistant']));
    expect(result.current.busy).toBe(false);
    // Nothing to send: not taken, nothing called.
    await act(async () => { taken = await result.current.send('   '); });
    expect(taken).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('turns a photo into base64 for the model', async () => {
    const img = await imageFromBlob(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    expect(img).toEqual({ media_type: 'image/png', data: 'AQID' });
  });
});
