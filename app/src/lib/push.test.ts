import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshPush, subscribePush } from './push';
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

  it('re-registers an existing subscription when the app opens, so a rotated address keeps working', async () => {
    const sub = { endpoint: 'https://push.example/2', toJSON: () => ({ keys: { p256dh: 'P2', auth: 'A2' } }) };
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(sub) } }) }, configurable: true });
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    await refreshPush(me, { from: () => ({ upsert }) } as never);
    expect(upsert).toHaveBeenCalledWith({ endpoint: 'https://push.example/2', household_id: 'h1', member_id: 'm-papa', p256dh: 'P2', auth: 'A2' });
  });

  it('subscribes on start when the phone allows notifications but has no subscription (after a reset or cleared data)', async () => {
    const sub = { endpoint: 'https://push.example/3', toJSON: () => ({ keys: { p256dh: 'P3', auth: 'A3' } }) };
    const pushManager = { getSubscription: vi.fn(() => Promise.resolve(null)), subscribe: vi.fn(() => Promise.resolve(sub)) };
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    await refreshPush(me, { from: () => ({ upsert }) } as never);
    expect(pushManager.subscribe).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith({ endpoint: 'https://push.example/3', household_id: 'h1', member_id: 'm-papa', p256dh: 'P3', auth: 'A3' });
  });

  it('leaves a phone alone when notifications were never allowed', async () => {
    const pushManager = { getSubscription: vi.fn(() => Promise.resolve(null)), subscribe: vi.fn() };
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
    await refreshPush(me, { from: vi.fn() } as never);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});
