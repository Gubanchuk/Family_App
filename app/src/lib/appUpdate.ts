import { useEffect, useState } from 'react';

// A new version is downloaded by the service worker and takes over at once (autoUpdate), but the
// open page keeps running the old code until it reloads. The app asks for a new version each time
// it comes back on screen, and reports when one has taken over so the person can reload.
export function useAppUpdate(sw: ServiceWorkerContainer | undefined = navigator.serviceWorker): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!sw) return;
    // The very first install also changes the controller; that is not an update.
    const hadController = !!sw.controller;
    const onChange = () => { if (hadController) setReady(true); };
    const check = () => {
      if (document.visibilityState === 'visible') sw.getRegistration().then((r) => r?.update()).catch(() => {});
    };
    sw.addEventListener('controllerchange', onChange);
    document.addEventListener('visibilitychange', check);
    return () => {
      sw.removeEventListener('controllerchange', onChange);
      document.removeEventListener('visibilitychange', check);
    };
  }, [sw]);
  return ready;
}
