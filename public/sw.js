/* Offline shell: app files are served stale-while-revalidate. Wikipedia / Six Degrees / Firebase
 * requests always go to the network. Bump VERSION to force-refresh caches. */
const VERSION = 'ws-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/wiki.css',
  'js/firebase-config.js',
  'js/util.js',
  'js/wiki.js',
  'js/sdow.js',
  'js/articles.js',
  'js/store.js',
  'js/auth.js',
  'js/components.js',
  'js/graph.js',
  'js/game.js',
  'js/views.js',
  'js/app.js',
  'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/__/')) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
      const cached = await cache.match(key);
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
