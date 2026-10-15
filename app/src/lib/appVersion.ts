// The build stamp, set by Vite at build time: when it was built (Moscow time) and from which commit.
declare const __BUILD__: string;
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

// Asks the server for a newer version now. 'updated' once a newer one has taken over the page (the caller
// reloads), 'latest' when there is nothing newer, 'none' when this browser keeps no stored copy.
export async function checkForUpdate(sw: ServiceWorkerContainer | undefined = navigator.serviceWorker, waitMs = 20_000): Promise<'updated' | 'latest' | 'none'> {
  if (!sw) return 'none';
  const reg = await sw.getRegistration();
  if (!reg) return 'none';
  await reg.update();
  if (!reg.installing && !reg.waiting) return 'latest';
  // The worker takes over by itself (autoUpdate); a slow phone gets a reload after the wait anyway.
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('updated'), waitMs);
    sw.addEventListener('controllerchange', () => { clearTimeout(timer); resolve('updated'); }, { once: true });
  });
}

// Drops the stored copy of the app: the service worker and its caches. The family data (IndexedDB) and the
// login (localStorage) stay, so after a reload the phone downloads the current version and carries on.
export async function resetAppCache(sw: ServiceWorkerContainer | undefined = navigator.serviceWorker, store: CacheStorage | undefined = globalThis.caches) {
  const regs = sw ? await sw.getRegistrations() : [];
  await Promise.all(regs.map((r) => r.unregister()));
  const keys = store ? await store.keys() : [];
  await Promise.all(keys.map((k) => store!.delete(k)));
}
