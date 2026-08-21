// Service worker — offline shell.
//
// Cache-first for the app's own files so it opens on gym wifi, on a train, or
// on a plane. Bump CACHE when shipping changes, or browsers will serve the old
// app.
//
// The precache is split in two, and that split is the whole point of this file:
//
//   CORE   — the app itself. 44 small files, under a megabyte. Cached with
//            `addAll`, which is all-or-nothing on purpose: half an app is a
//            white screen, so it is better for the install to fail and leave
//            the previous version serving.
//   EXTRAS — the 134 spoken cues, 2.3 MB of them. Cached one at a time, and a
//            failure is *ignored*: a missing clip is silent, which is already
//            createVoice's standing contract, exactly like PENDING_ART for a
//            figure.
//
// Until v53 both lists were one `cache.addAll(SHELL)`. That is atomic, so a
// single dropped byte anywhere in 2.3 MB of audio rejected the whole install
// and left *nothing* cached — the app then had no offline mode at all, and
// said nothing about it. Never put an optional asset in the same `addAll` as
// a required one.

const CACHE = 'jj-app-v55';

// The clips that exist on disk, per voice. See js/voices.js.
//
// The voices are deliberately allowed to be ragged: Arnold has three cues
// Snoop has never had (the two kettlebell lifts and the warm-up press-ups),
// and a voice missing a cue is silent for it — createVoice's standing
// contract, the same one PENDING_ART gives an undrawn figure.
//
// A name here with no file behind it no longer breaks the install — since v53
// these are cached one at a time and a 404 is skipped — which makes it *quieter*
// rather than safer: the clip is simply silent forever and nothing says so.
// tests/stretches.test.mjs is what catches it, and it asserts this map and
// audio/cues/ agree exactly, in both directions. Add a clip here in the same
// commit as its bytes.
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

// The app itself. Every file here has to be present or the app does not run,
// which is why this list is atomic and why tests/offline.test.mjs asserts that
// every module under js/ appears in it — a module missing from here is a white
// screen the moment the phone loses signal, and it works perfectly on wifi.
const CORE = [
  './',
  'index.html',
  'css/app.css',
  'fonts/nunito.woff2',
  'js/app.js',
  'js/version.js',
  'js/appearance.js',
  'js/render.js',
  'js/swupdate.js',
  'js/offline.js',
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
];

// Spoken cues — see js/voices.js. One folder per voice, the same ids in each,
// so a session speaks in one voice throughout and a routine run on gym wifi or
// offline still gets the voice, not just the beeps. Optional by design: the app
// is fully usable with none of these cached.
const EXTRAS = Object.entries(CUES).flatMap(([voice, ids]) =>
  ids.map(id => `audio/cues/${voice}/${id}.webm`));

const SHELL = [...CORE, ...EXTRAS];

/**
 * Put anything in `urls` that is not already cached into the cache, one at a
 * time, and report how it went. Never rejects — a failure here is a gap, not a
 * broken install, and the caller decides what a gap means.
 */
async function addMissing(cache, urls) {
  // A few at a time rather than one at a time: 134 sequential round-trips on a
  // phone connection is minutes of latency, and rather than all at once, which
  // is what `addAll` does and what a mobile connection handles worst.
  const LANES = 6;
  const queue = [...urls];
  const missing = [];
  const lane = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      if (await cache.match(url)) continue;
      try { await cache.add(url); }
      catch { missing.push(url); }
    }
  };
  await Promise.all(Array.from({ length: LANES }, lane));
  return { total: urls.length, cached: urls.length - missing.length, missing };
}

/** What is cached right now, split the way the two lists are. Read-only. */
async function survey(cache) {
  const core = await Promise.all(CORE.map(u => cache.match(u).then(Boolean)));
  const extras = await Promise.all(EXTRAS.map(u => cache.match(u).then(Boolean)));
  return {
    version: CACHE,
    core: CORE.length,
    coreMissing: core.filter(hit => !hit).length,
    total: SHELL.length,
    missing: core.filter(hit => !hit).length + extras.filter(hit => !hit).length,
  };
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Atomic, and small enough that it either works or the connection is
    // genuinely gone. If it rejects, this worker is discarded and the previous
    // one keeps serving — the right outcome, since a half-cached app is worse
    // than yesterday's whole one.
    await cache.addAll(CORE);
    // The app is usable offline from this line onwards. Take over now rather
    // than after the audio, so a flaky connection cannot delay the update.
    await self.skipWaiting();
    // Best effort, still inside waitUntil so the worker stays alive for it.
    await addMissing(cache, EXTRAS);
  })());
});

// Let the page talk to the worker. Three questions, all of which used to have
// no answer at all — "am I actually ready for a flight?" was unanswerable, and
// the honest reply was a shrug.
self.addEventListener('message', event => {
  const data = event.data || {};
  // Reply down the MessageChannel the page opened, so it can await an answer.
  const reply = msg => { for (const port of event.ports) port.postMessage(msg); };

  // The "Check for updates" button in Settings. `install` already calls
  // skipWaiting(), so a worker should rarely be left waiting; this covers the
  // case where it is, because without a handler that postMessage is silently
  // ignored and the button appears to hang.
  if (data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  if (data.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      reply(await survey(await caches.open(CACHE)));
    })());
    return;
  }

  // "Download everything for offline" — fills whatever the install could not.
  // Deliberately re-runs both lists: the interesting case is EXTRAS, but a
  // CORE file evicted by the browser's storage pressure is the one that hurts.
  if (data.type === 'PRECACHE') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await addMissing(cache, CORE);
      await addMissing(cache, EXTRAS);
      reply(await survey(cache));
    })());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Top up anything a previous install could not finish. After the claim, so
    // pages are never held behind 2.3 MB of optional audio.
    await addMissing(await caches.open(CACHE), EXTRAS);
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const sameOrigin = new URL(request.url).origin === location.origin;
  event.respondWith(sameOrigin ? ownFile(request) : remote(request));
});

/**
 * The app's own files: cache first, then network, then — for a navigation —
 * the shell, so an uncached URL offline lands in the app instead of on the
 * browser's "server not found" page. Everything the app routes to lives behind
 * the hash, so the shell is always the right answer.
 */
async function ownFile(request) {
  // The share target opens `./?share_text=…`, whose query defeats an exact
  // cache match — fall back to ignoreSearch so the shell still serves offline.
  const hit = await caches.match(request)
    ?? await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;

  try {
    const res = await fetch(request);
    // Anything of ours fetched from the network gets kept, so a file added
    // after this worker installed — or an EXTRA whose download failed — is
    // cached the first time it is used, rather than only at the next deploy.
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await caches.match('./', { ignoreSearch: true })
        ?? await caches.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

/** Thumbnails, oEmbed: network first, falling back to whatever we kept. */
async function remote(request) {
  try {
    const res = await fetch(request);
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
    return res;
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw err;
  }
}
