// Is this app actually ready to be used with no connection?
//
// The service worker owns the answer — it holds CACHE and both precache lists —
// so this module is the page's half of a small request/response protocol over
// postMessage. A MessageChannel per question, because a bare postMessage has no
// reply path and "did that work?" is the entire point of asking.
//
// `describeOffline` is deliberately pure and knows nothing about the browser:
// the wording is the part a user reads on a platform before boarding, and it is
// the part worth testing. See tests/offline.test.mjs.

/** Give up on a silent worker rather than leaving a button saying "Checking…". */
const ASK_MS = 8000;
/** A full precache is 2.3 MB of audio on whatever the connection is. */
const PRECACHE_MS = 180000;

/**
 * Ask the active worker something, and wait for its reply.
 * Resolves to `{ supported: false }` when there is no worker to ask — which is
 * not an error: it means this browser or this page has no offline mode at all,
 * and saying so is more useful than a thrown message nobody sees.
 */
async function ask(type, timeoutMs) {
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'unsupported' };
  let worker;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    // `ready` never settles when nothing is registered, so check first.
    worker = reg ? (await navigator.serviceWorker.ready).active : null;
  } catch { worker = null; }
  if (!worker) return { supported: false, reason: 'unregistered' };

  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve({ supported: false, reason: 'timeout' }), timeoutMs);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      resolve({ supported: true, ...event.data });
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

/** What the worker has cached right now. Never throws. */
export const offlineStatus = () => ask('OFFLINE_STATUS', ASK_MS);

/** Fill every gap in the cache, then report the result. Never throws. */
export const precacheAll = () => ask('PRECACHE', PRECACHE_MS);

/**
 * Turn a status into the two lines a human reads. Pure.
 *
 * Three states, and the middle one is the reason this is not a boolean: the
 * spoken cues are 2.3 MB of the download and none of them matter for reading or
 * writing a note, so a phone that has the app and not the audio is ready for a
 * flight and should be told so plainly.
 */
export function describeOffline(status) {
  if (!status || status.supported === false) {
    return {
      ready: false,
      complete: false,
      headline: 'Offline access is not set up.',
      detail: status && status.reason === 'unsupported'
        ? 'This browser has no service worker, so nothing is stored for offline use. Everything you have written is still safe in this browser — it is only opening the app that needs a connection.'
        : 'Nothing has been cached yet. Open the app once with a connection, then check back here.',
    };
  }
  if (status.coreMissing > 0) {
    return {
      ready: false,
      complete: false,
      headline: 'Not ready to use offline.',
      detail: `${status.coreMissing} of the ${status.core} files the app is built from are missing from this device, so it may not open without a connection. Tap Download below while you still have one.`,
    };
  }
  if (status.missing > 0) {
    return {
      ready: true,
      complete: false,
      headline: 'Ready to use offline.',
      detail: `You can open the app, read everything and log a class with no connection. ${status.missing} of ${status.total} files — spoken cues for the Off mat routines — are not downloaded, so those will be silent until you are back online.`,
    };
  }
  return {
    ready: true,
    complete: true,
    headline: 'Ready to use offline.',
    detail: `All ${status.total} files are stored on this device. The app, your notes and the Off mat routines all work on a plane.`,
  };
}
