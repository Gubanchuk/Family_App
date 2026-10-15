import { useEffect, useState } from 'react';

// Right after start, or right after the app comes back on screen, nobody is in the middle of anything.
const FRESH_MS = 20_000;
// Module-level defaults keep the effect below from re-running on every render.
const RELOAD = () => location.reload();

// A new version is downloaded by the service worker and takes over at once (autoUpdate), but the open
// page keeps running the old code until it reloads. The app asks for a new version at start and each
// time it comes back on screen. A version that arrives in those first seconds, with no form open, is
// taken at once; otherwise the person gets a «Обновить» bar and decides when.
export function useAppUpdate(
  sw: ServiceWorkerContainer | undefined = navigator.serviceWorker,
  reload: () => void = RELOAD,
  now: () => number = Date.now,
): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!sw) return;
    // The very first install also changes the controller; that is not an update.
    const hadController = !!sw.controller;
    let freshUntil = now() + FRESH_MS;
    const ask = () => sw.getRegistration().then((r) => r?.update()).catch(() => {});
    const onChange = () => {
      if (!hadController) return;
      const formOpen = !!document.querySelector('[aria-modal="true"]');
      if (!formOpen && (now() < freshUntil || document.visibilityState === 'hidden')) reload();
      else setReady(true);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      freshUntil = now() + FRESH_MS;
      ask();
    };
    sw.addEventListener('controllerchange', onChange);
    document.addEventListener('visibilitychange', onVisible);
    ask();
    return () => {
      sw.removeEventListener('controllerchange', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sw, reload, now]);
  return ready;
}
