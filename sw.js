/* Chains service worker.
   Bump APP_VERSION on every deploy of index.html. The page asks before it
   swaps to a new version (the "A new version is ready" toast posts
   skipWaiting). Only this site's own files are cached here: ESPN, nflverse,
   Open-Meteo and The Odds API are never touched, because the page keeps its
   own copies in IndexedDB with its own freshness rules. */
const APP_VERSION = '2.4.0';
const CACHE = 'chains-' + APP_VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('chains') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  /* The page itself: network first so a deploy shows up on the next open,
     cache when offline. Everything else: cache first, refreshed behind. */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put('./index.html', c)); } return res; })
      .catch(() => caches.match('./index.html').then(h => h || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
