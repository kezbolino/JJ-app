// Best-effort screen wake lock — the phone shouldn't sleep mid-hold, or in the
// middle of a rest between sets. Shared by both halves of the Off mat section.
//
// Everything here is deliberately best-effort: no browser is obliged to grant
// a wake lock, and Android drops it whenever the tab is hidden. Nothing in the
// app may depend on holding one.

export function createWakeLock() {
  let lock = null;
  const request = async () => {
    if (!('wakeLock' in navigator)) return;
    try { lock = await navigator.wakeLock.request('screen'); } catch { /* not critical */ }
  };
  return {
    request,
    // Android drops the lock whenever the tab is hidden; take it again on return.
    reacquire: () => { if (document.visibilityState === 'visible') request(); },
    release: () => { try { lock?.release(); } catch { /* already gone */ } lock = null; },
  };
}
