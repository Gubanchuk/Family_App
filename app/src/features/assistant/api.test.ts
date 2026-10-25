import { describe, expect, it, vi } from 'vitest';
import { callAssistant } from './api';
import type { ChatBody } from './types';

const body: ChatBody = { mode: 'chat', messages: [{ role: 'user', content: [{ type: 'text', text: 'Привет' }] }], screen: 'home' };
const httpError = (status: number, json: unknown) => ({ name: 'FunctionsHttpError', context: { status, json: async () => json } });

describe('assistant api', () => {
  it('passes the body to the function and returns the reply as it came', async () => {
    const content = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Здравствуйте!' }];
    const invoke = vi.fn(async () => ({ data: { content, stop_reason: 'end_turn' }, error: null }));
    expect(await callAssistant(body, invoke)).toEqual({ content, stop_reason: 'end_turn' });
    expect(invoke).toHaveBeenCalledWith('assistant', { body });
  });

  it('passes on the function\'s own error codes', async () => {
    for (const code of ['no_credit', 'daily_limit', 'busy', 'refusal', 'failed', 'not_member']) {
      expect(await callAssistant(body, vi.fn(async () => ({ data: { error: code }, error: null })))).toEqual({ error: code });
    }
    expect(await callAssistant(body, vi.fn(async () => ({ data: null, error: httpError(400, { error: 'bad_request' }) })))).toEqual({ error: 'bad_request' });
  });

  it('turns no network and anything unreadable into network', async () => {
    expect(await callAssistant(body, vi.fn(async () => { throw new TypeError('Failed to fetch'); }))).toEqual({ error: 'network' });
    expect(await callAssistant(body, vi.fn(async () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request' } })))).toEqual({ error: 'network' });
    expect(await callAssistant(body, vi.fn(async () => ({ data: '<html>captive portal</html>', error: null })))).toEqual({ error: 'network' });
    expect(await callAssistant(body, vi.fn(async () => ({ data: { error: 'something_new' }, error: null })))).toEqual({ error: 'failed' });
    expect(await callAssistant(body, vi.fn(async () => ({ data: { content: 'oops' }, error: null })))).toEqual({ error: 'failed' });
  });

  it('reads an HTTP failure without a known code by its status', async () => {
    expect(await callAssistant(body, vi.fn(async () => ({ data: null, error: httpError(503, null) })))).toEqual({ error: 'busy' });
    expect(await callAssistant(body, vi.fn(async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 502, json: async () => { throw new Error('not json'); } } } })))).toEqual({ error: 'failed' });
  });
});
