// Haramaen Umrah — service worker
// Network-first for the page (HTML) so updates always show after a refresh;
// cache-first for other assets; cache as offline fallback.
const CACHE = 'haramaen-umrah-v14';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Only manage same-origin requests. Cross-origin (Supabase API, prayer-time APIs,
  // image CDNs) go straight to the network and are NEVER cached, so live data stays fresh.
  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  const isDoc = e.request.mode === 'navigate' ||
                (e.request.destination === 'document') ||
                e.request.url.endsWith('/index.html');

  if (isDoc) {
    // Network-first: always try to get the freshest page, fall back to cache offline.
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Other assets: cache-first, then network.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});

/* ---- Push notification handler ---- */
self.addEventListener('push', e => {
  let data = { title: 'Haramaen Umrah', body: 'Ada kemas kini baru.', url: '/', tag: 'haramaen' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
      tag: data.tag,
      renotify: true,
      vibrate: [200, 100, 200]
    })
  );
});

/* ---- Notification click — open/focus the app ---- */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wcs => {
      const existing = wcs.find(w => w.url.startsWith(self.location.origin));
      if (existing) { existing.focus(); return; }
      return clients.openWindow(url);
    })
  );
});
