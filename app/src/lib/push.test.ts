import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribePush } from './push';
import type { Member } from '../features/family/useFamily';

const me: Member = { id: 'm-papa', household_id: 'h1', user_id: 'u1', name: 'Папа', color: '#2F6FDB', role: 'parent', is_owner: true, portion: 1 };

describe('subscribePush', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('subscribes this phone and stores the keys for the member', async () => {
    const sub = { endpoint: 'https://push.example/1', toJSON: () => ({ keys: { p256dh: 'P', auth: 'A' } }) };
    const pushManager = { getSubscription: vi.fn(() => Promise.resolve(null)), subscribe: vi.fn(() => Promise.resolve(sub)) };
    vi.stubGlobal('Notification', { requestPermission: () => Promise.resolve('granted') });
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    expect(await subscribePush(me, { from: () => ({ upsert }) } as never)).toBe('on');
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(upsert).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', household_id: 'h1', member_id: 'm-papa', p256dh: 'P', auth: 'A' });
  });

  it('reports a refusal without subscribing', async () => {
    vi.stubGlobal('Notification', { requestPermission: () => Promise.resolve('denied') });
    expect(await subscribePush(me, { from: vi.fn() } as never)).toBe('denied');
  });
});
