// Service worker — offline shell.
//
// Cache-first for the app's own files so it opens on gym wifi or none at all.
// Bump CACHE when shipping changes, or browsers will serve the old app.

const CACHE = 'jj-app-v52';

// The clips that exist on disk, per voice. See js/voices.js.
//
// The voices are deliberately allowed to be ragged: Arnold has three cues
// Snoop has never had (the two kettlebell lifts and the warm-up press-ups),
// and a voice missing a cue is silent for it — createVoice's standing
// contract, the same one PENDING_ART gives an undrawn figure. What is *not*
// allowed is a name here with no file behind it: `cache.addAll` rejects the
// whole install on a single 404, the old worker then serves forever, and every
// reopen fails identically. Add a clip here in the same commit as its bytes.
// tests/stretches.test.mjs asserts this map and audio/cues/ agree exactly, in
// both directions.
const CUES = {
  snoop: [
    'ankle-rock', 'archer-press-up', 'bear-crawl', 'childs-pose',
    'copenhagen', 'cossack-squat', 'countdown', 'dead-hang',
    'deep-squat-hold', 'finish-1', 'finish-2', 'finish-3', 'finish-4',
    'finish-5', 'frog', 'glute-bridge-single', 'hanging-leg-raise',
    'hip-flexor-lunge', 'hollow-hold', 'hype-1', 'hype-10', 'hype-2',
    'hype-3', 'hype-4', 'hype-5', 'hype-6', 'hype-7', 'hype-8', 'hype-9',
    'inverted-row', 'jefferson-curl', 'kb-getup', 'kb-swing',
    'neck-isometric', 'neck-side', 'ninety-ninety', 'ninety-ninety-liftoff',
    'other-side-1', 'other-side-2', 'other-side-3', 'other-side-4',
    'other-side-5', 'other-side-6', 'pigeon', 'pike-press-up', 'pull-up',
    'quad-kneel', 'rest-over-1', 'rest-over-2', 'rest-over-3', 'rest-over-4',
    'rest-over-5', 'seated-fold', 'side-plank', 'single-leg-rdl', 'sphinx',
    'split-squat', 'supine-twist', 'thoracic-press-up', 'thread-needle',
    'wall-slide', 'warmup-arm-circle', 'warmup-leg-swing', 'warmup-march',
    'warmup-squat', 'wrist-floor', 'wu-press-ups',
  ],
  arnold: [
    'ankle-rock', 'archer-press-up', 'bear-crawl', 'childs-pose',
    'copenhagen', 'cossack-squat', 'countdown', 'dead-hang',
    'deep-squat-hold', 'finish-1', 'finish-2', 'finish-3', 'finish-4',
    'finish-5', 'frog', 'glute-bridge-single', 'hanging-leg-raise',
    'hip-flexor-lunge', 'hollow-hold', 'hype-1', 'hype-10', 'hype-2',
    'hype-3', 'hype-4', 'hype-5', 'hype-6', 'hype-7', 'hype-8', 'hype-9',
    'inverted-row', 'jefferson-curl', 'kb-getup', 'kb-swing',
    'neck-isometric', 'neck-side', 'ninety-ninety', 'ninety-ninety-liftoff',
    'other-side-1', 'other-side-2', 'other-side-3', 'other-side-4',
    'other-side-5', 'other-side-6', 'pigeon', 'pike-press-up', 'pull-up',
    'quad-kneel', 'rest-over-1', 'rest-over-2', 'rest-over-3', 'rest-over-4',
    'rest-over-5', 'seated-fold', 'side-plank', 'single-leg-rdl', 'sphinx',
    'split-squat', 'supine-twist', 'thoracic-press-up', 'thread-needle',
    'wall-slide', 'warmup-arm-circle', 'warmup-leg-swing', 'warmup-march',
    'warmup-squat', 'wrist-floor', 'wu-press-ups',
  ],
};

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'fonts/nunito.woff2',
  'js/app.js',
  'js/version.js',
  'js/appearance.js',
  'js/render.js',
  'js/swupdate.js',
  'js/beeps.js',
  'js/voice.js',
  'js/voices.js',
  'js/wakelock.js',
  'js/dates.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/appstate.js',
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
  // Spoken cues — see js/voices.js. One folder per voice, the same ids in
  // each, so a session speaks in one voice throughout and a routine run on gym
  // wifi or offline still gets the voice, not just the beeps.
  //
  ...Object.entries(CUES).flatMap(([voice, ids]) =>
    ids.map(id => `audio/cues/${voice}/${id}.webm`)),
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Let the page ask a waiting worker to take over — the "Check for updates"
// button in Settings. `install` already calls skipWaiting(), so a worker should
// rarely be left waiting; this covers the case where it is, because without a
// handler that postMessage is silently ignored and the button appears to hang.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
