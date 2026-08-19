// Spoken cues, played as short clips from audio/cues/<voice>/<id>.webm — a lift
// on top of the beeps in js/beeps.js, never a replacement for them.
//
// Shared by both Off mat screens: the routines announce each movement, and the
// strength session announces what is coming when a rest ends.
//
// The voice is fixed for the life of this player, because it is fixed for the
// life of a session — see js/voices.js. Each player caches its own decoded
// buffers, so a voice's clips are never mixed with another's.

import { DEFAULT_VOICE } from './voices.js';

/**
 * This plays clips through Web Audio, the same as the beeps, rather than a
 * plain `Audio` element — deliberately. A bare `Audio().play()` called from
 * a `setInterval` tick (as every segment after the first is) is not running
 * inside a user gesture, and Chrome is free to silently reject it; the promise
 * rejection was being swallowed, so it looked like "the first move announces
 * itself, then nothing." An `AudioContext` resumed once inside the Start tap
 * stays usable from anywhere afterward — that is the whole reason the beeps
 * never hit this — so voice clips are decoded once and played as buffers
 * through that same kind of context instead.
 */
export function createVoice(voice = DEFAULT_VOICE) {
  let ctx = null;
  let closed = false;
  let current = null;
  const buffers = new Map();

  const ensure = () => {
    if (closed) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const load = async (c, id) => {
    if (buffers.has(id)) return buffers.get(id);
    try {
      const res = await fetch(`audio/cues/${voice}/${id}.webm`);
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(id, buf);
      return buf;
    } catch { return null; }
    // No clip recorded yet in *this* voice — stay silent, don't break the
    // routine, and deliberately don't fall back to the other one. A voice that
    // quietly borrows another's lines mid-session is worse than a gap: the gap
    // is the standing contract every missing cue has always had.
  };

  const stop = () => {
    if (current) { try { current.stop(); } catch { /* already ended */ } current = null; }
  };

  return {
    unlock: () => ensure(),
    /**
     * Fetch and decode a clip now, so it plays the instant it is wanted.
     *
     * The strength session knows two minutes ahead of time what the end of a
     * rest will say. Leaving the fetch until the timer fires puts a network
     * round-trip and a decode between the beep and the voice, which on a cold
     * cache is exactly the moment you are not looking at the screen.
     */
    preload: id => { const c = ensure(); if (c) load(c, id); },
    say: async id => {
      const c = ensure();
      if (!c) return;
      const buf = await load(c, id);
      if (!buf || closed) return;   // torn down while the clip was still decoding
      stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start();
      current = src;
    },
    stop,
    close: () => { stop(); closed = true; if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
  };
}
