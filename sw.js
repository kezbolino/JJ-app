// Service worker — offline shell.
//
// Cache-first for the app's own files so it opens on gym wifi or none at all.
// Bump CACHE when shipping changes, or browsers will serve the old app.

const CACHE = 'jj-app-v42';

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'fonts/nunito.woff2',
  'js/app.js',
  'js/version.js',
  'js/appearance.js',
  'js/render.js',
  'js/beeps.js',
  'js/voice.js',
  'js/wakelock.js',
  'js/dates.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/moves.js',
  'js/stretches.js',
  'js/strength.js',
  'js/stretch-art.js',
  'js/ontology.js',
  'js/tagger.js',
  'js/overrides.js',
  'js/backup.js',
  'js/youtube.js',
  'js/markdown.js',
  'js/sync.js',
  'js/views/home.js',
  'js/views/focus.js',
  'js/views/stretch.js',
  'js/views/strength.js',
  'js/views/log.js',
  'js/views/map.js',
  'js/views/position.js',
  'js/views/library.js',
  'js/views/search.js',
  'js/views/settings.js',
  'manifest.webmanifest',
  // The icons are part of the shell too: the launcher shortcuts and the
  // install prompt both reach for them, and offline is the normal case here.
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable.png',
  // Spoken move names for the stretch routines — see js/views/stretch.js.
  // Small opus clips, one per item id in js/stretches.js; a routine run on
  // gym wifi or offline still gets the voice cues, not just the beeps.
  'audio/cues/ankle-rock.webm',
  'audio/cues/bear-crawl.webm',
  'audio/cues/childs-pose.webm',
  'audio/cues/copenhagen.webm',
  'audio/cues/cossack-squat.webm',
  'audio/cues/dead-hang.webm',
  'audio/cues/deep-squat-hold.webm',
  'audio/cues/frog.webm',
  'audio/cues/glute-bridge-single.webm',
  'audio/cues/hip-flexor-lunge.webm',
  'audio/cues/jefferson-curl.webm',
  'audio/cues/neck-isometric.webm',
  'audio/cues/neck-side.webm',
  'audio/cues/ninety-ninety-liftoff.webm',
  'audio/cues/ninety-ninety.webm',
  // The six "now the other side" takes, played instead of the move's own
  // name on the second half of a two-sided movement (see cueFor in
  // js/views/stretch.js). Picked at random, so all six have to be here.
  'audio/cues/other-side-1.webm',
  'audio/cues/other-side-2.webm',
  'audio/cues/other-side-3.webm',
  'audio/cues/other-side-4.webm',
  'audio/cues/other-side-5.webm',
  'audio/cues/other-side-6.webm',
  // Spoken "3, 2, 1, let's go", and the hype lines that land on some sets.
  // Both are picked at random, so all of them have to be cached.
  'audio/cues/countdown.webm',
  'audio/cues/hype-1.webm',
  'audio/cues/hype-2.webm',
  'audio/cues/hype-3.webm',
  'audio/cues/hype-4.webm',
  'audio/cues/hype-5.webm',
  'audio/cues/hype-6.webm',
  'audio/cues/hype-7.webm',
  'audio/cues/hype-8.webm',
  'audio/cues/hype-9.webm',
  'audio/cues/hype-10.webm',
  // The strength session: one clip per lift, announced when the rest before
  // it ends, plus generic "rest is over" takes for a repeat of the same one.
  'audio/cues/pull-up.webm',
  'audio/cues/split-squat.webm',
  'audio/cues/archer-press-up.webm',
  'audio/cues/inverted-row.webm',
  'audio/cues/nordic-curl.webm',
  'audio/cues/pike-press-up.webm',
  'audio/cues/hanging-leg-raise.webm',
  'audio/cues/hollow-hold.webm',
  'audio/cues/rest-over-1.webm',
  'audio/cues/rest-over-2.webm',
  'audio/cues/rest-over-3.webm',
  'audio/cues/rest-over-4.webm',
  'audio/cues/rest-over-5.webm',
  'audio/cues/pigeon.webm',
  'audio/cues/quad-kneel.webm',
  'audio/cues/seated-fold.webm',
  'audio/cues/side-plank.webm',
  'audio/cues/single-leg-rdl.webm',
  'audio/cues/sphinx.webm',
  'audio/cues/supine-twist.webm',
  'audio/cues/thoracic-press-up.webm',
  'audio/cues/thread-needle.webm',
  'audio/cues/wall-slide.webm',
  'audio/cues/warmup-arm-circle.webm',
  'audio/cues/warmup-leg-swing.webm',
  'audio/cues/warmup-march.webm',
  'audio/cues/warmup-squat.webm',
  'audio/cues/wrist-floor.webm',
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

  // App shell: cache first. The share target opens `./?share_text=…`, whose
  // query defeats an exact cache match — fall back to ignoreSearch so the
  // shell still serves offline. Everything else (thumbnails, oEmbed): network,
  // falling back to cache so saved thumbnails still render offline.
  event.respondWith(
    sameOrigin
      ? caches.match(request)
          .then(hit => hit ?? caches.match(request, { ignoreSearch: true }))
          .then(hit => hit ?? fetch(request))
      : fetch(request)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(request))
  );
});
