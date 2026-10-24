// OnPanel service worker: keeps the app working offline.
// Bump VERSION whenever any app file changes so phones pick up the update.
const VERSION = 'dive-times-v53';
const SHELL = ['./', 'index.html', 'air.html', 'plan.js', 'jspdf.umd.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'pdfjs/pdf.mjs', 'pdfjs/pdf.worker.mjs'];

self.addEventListener('install', e => {
  // cache:'reload' skips the browser's HTTP cache so a new version never stores stale copies
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Serve from cache straight away (works with no signal), refresh the cache in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const nav = req.mode === 'navigate';
    // page navigations: the Air screen is air.html, everything else is the main (Sat) screen
    const page = nav ? (url.pathname.endsWith('/air.html') ? 'air.html' : 'index.html') : null;
    const key = nav ? page : req;
    const cached = await cache.match(key, { ignoreSearch: nav });
    const fresh = (isFont ? fetch(req) : fetch(nav ? page : req.url, { cache: 'no-cache' })).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
// Tapping an alarm notification brings the app back to the front.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
