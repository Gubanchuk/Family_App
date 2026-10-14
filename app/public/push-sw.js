// Loaded into the generated service worker with importScripts; shows pushes from the notify function.
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {};
  const h = new Date().getHours();
  event.waitUntil(self.registration.showNotification(d.title || 'Семейный помощник', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' },
    silent: !!d.quiet && (h >= 22 || h < 8),
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    // navigate() works only for windows this worker controls; otherwise open a new one.
    const own = wins.find((w) => 'navigate' in w && w.url.startsWith(self.registration.scope));
    if (own) return own.navigate(url).then((w) => (w || own).focus()).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
