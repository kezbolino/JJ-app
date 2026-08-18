// When to actually apply a service-worker update.
//
// **The problem this fixes.** sw.js is cache-first, so opening the app serves
// the *old* shell from cache while the browser fetches the new worker in the
// background. `skipWaiting()` and `clients.claim()` make that new worker take
// over immediately — but the page you are looking at was already built from the
// old files. So a new version only appeared on the **second** open, and every
// deploy note in CLAUDE.md since v10 carried a "check the footer first" warning
// as a result. That was a design fault being treated as a ritual.
//
// **Why this is not just `location.reload()`.** A reload throws away anything
// half-typed, and capture friction is the one thing this app guards above
// everything else — losing a class you were part-way through writing up is far
// worse than running yesterday's build for another minute. The log form is not
// autosaved (unlike the strength draft, which is written on every tap), so a
// reload while you are mid-sentence in "What we drilled" loses it outright.
//
// So the update waits for a moment when nothing can be lost:
//
//   - within the first few seconds of a page load, nothing has been typed yet,
//     so it applies immediately — this is the common case, since the worker
//     almost always activates during boot;
//   - otherwise it sits pending and applies at the next route change or the
//     next time the app comes back to the foreground. Both are points where the
//     screen is about to be rebuilt anyway.
//
// Pure on purpose: no DOM, no timers, no `location`. The caller supplies the
// clock and the `apply` callback, which is what makes the rules testable —
// and they are exactly the rules that would otherwise regress in silence.

/** Inside this many ms of page load, a reload cannot cost anybody anything. */
export const BOOT_GRACE_MS = 3000;

/**
 * @param apply        called at most once, when it is safe to reload
 * @param bootGraceMs  how long after load counts as "still booting"
 */
export function createUpdateGate({ apply, bootGraceMs = BOOT_GRACE_MS } = {}) {
  let pending = false;
  let applied = false;

  const fire = () => {
    if (applied) return false;
    applied = true;
    apply();
    return true;
  };

  return {
    /**
     * A new worker has taken control.
     *
     * `hadController` false means this page had no worker when it loaded — a
     * first-ever visit. Reloading there is a pointless flash: the shell on
     * screen already came from the network and is current by definition.
     */
    controllerChanged({ hadController, elapsedMs } = {}) {
      if (applied || !hadController) return false;
      pending = true;
      return elapsedMs < bootGraceMs ? fire() : false;
    },

    /** A route change or a return to the foreground — safe to rebuild. */
    safeMoment() {
      return pending ? fire() : false;
    },

    /** Is an update waiting for a safe moment? */
    get pending() { return pending && !applied; },
  };
}
