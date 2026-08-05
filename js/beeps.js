// Synthesised beeps. No asset, no fetch, nothing to cache.
//
// Lifted out of js/views/stretch.js when the strength session's rest timer
// needed the same tones — one implementation, so the whole Off mat section
// sounds like one thing and the autoplay rules below only have to be got right
// once.
//
// **The context can only be created from a user gesture.** Build it anywhere
// else and the browser starts it suspended and every tone is silent, with no
// error to notice. `unlock()` exists to be called inside the tap that starts a
// routine or a rest; once resumed from a gesture the context stays usable from
// a `setInterval` afterwards, which is exactly why the beeps never hit the bug
// the voice cues did (see createVoice in js/views/stretch.js).
//
// Square, not sine: a square wave's extra harmonics read as sharper and cut
// through a TV or background noise far better than a pure tone at the same
// gain. The pitches and gains were raised at the same time, for the same
// reason — the user could not hear the old ones.

export function createBeeper() {
  let ctx = null;
  let muted = false;

  const ensure = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const tone = (freq, ms, peak = 0.3, delay = 0) => {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const t0 = c.currentTime + delay;
    // Ramp in and out: a square-edged gate on a tone clicks audibly.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  };

  return {
    unlock: () => ensure(),
    ready: () => tone(900, 180, 0.30),          // "get into the shape"
    go: () => tone(1250, 280, 0.35),            // "hold it" / "work" / "next set"
    rest: () => tone(700, 240, 0.28),           // "stop, breathe"
    tick: () => tone(1500, 90, 0.32),           // 3 · 2 · 1
    finish: () => { tone(950, 200, 0.3); tone(1300, 200, 0.3, 0.21); tone(1750, 420, 0.3, 0.42); },
    setMuted: v => { muted = v; },
    isMuted: () => muted,
    close: () => { if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
  };
}
