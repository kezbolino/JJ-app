// Service worker — offline shell.
//
// Cache-first for the app's own files so it opens on gym wifi or none at all.
// Bump CACHE when shipping changes, or browsers will serve the old app.

const CACHE = 'jj-app-v2';

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/ontology.js',
  'js/tagger.js',
  'js/backup.js',
  'js/youtube.js',
  'js/markdown.js',
  'js/sync.js',
  'js/views/home.js',
  'js/views/log.js',
  'js/views/map.js',
  'js/views/position.js',
  'js/views/library.js',
  'js/views/search.js',
  'js/views/settings.js',
  'manifest.webmanifest',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const sameOrigin = new URL(request.url).origin === location.origin;

  // App shell: cache first. Everything else (thumbnails, oEmbed): network,
  // falling back to cache so saved thumbnails still render offline.
  event.respondWith(
    sameOrigin
      ? caches.match(request).then(hit => hit ?? fetch(request))
      : fetch(request)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(request))
  );
});
