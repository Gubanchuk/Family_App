import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, resetAppCache } from './appVersion';

function container(reg: Partial<ServiceWorkerRegistration> | undefined) {
  const target = new EventTarget();
  return Object.assign(target, {
    getRegistration: vi.fn(async () => reg),
    getRegistrations: vi.fn(async () => (reg ? [reg] : [])),
  }) as unknown as ServiceWorkerContainer;
}

describe('checking for a new version by hand', () => {
  it('says the app is the latest when the server has nothing newer', async () => {
    const reg = { update: vi.fn(async () => undefined), installing: null, waiting: null };
    expect(await checkForUpdate(container(reg as never))).toBe('latest');
    expect(reg.update).toHaveBeenCalled();
  });

  it('waits for a newer version to take over, then reports it', async () => {
    const reg = { update: vi.fn(async () => undefined), installing: {}, waiting: null };
    const sw = container(reg as never);
    const result = checkForUpdate(sw, 5000);
    await Promise.resolve();
    sw.dispatchEvent(new Event('controllerchange'));
    expect(await result).toBe('updated');
  });

  it('reports no service worker in a browser without one', async () => {
    expect(await checkForUpdate(undefined)).toBe('none');
    expect(await checkForUpdate(container(undefined))).toBe('none');
  });
});

describe('resetting the stored copy of the app', () => {
  it('removes the service worker and its caches, nothing else', async () => {
    const reg = { unregister: vi.fn(async () => true) };
    const store = { keys: vi.fn(async () => ['workbox-precache-v2', 'images']), delete: vi.fn(async () => true) };
    await resetAppCache(container(reg as never), store as unknown as CacheStorage);
    expect(reg.unregister).toHaveBeenCalled();
    expect(store.delete).toHaveBeenCalledWith('workbox-precache-v2');
    expect(store.delete).toHaveBeenCalledWith('images');
  });
});
