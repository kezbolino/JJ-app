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
 * How loud a clip should end up, as RMS amplitude (0.158 ≈ -16 dBFS).
 *
 * The takes were recorded conservatively: measured across both voices they
 * average about -25 dBFS RMS and peak at -8 dBFS, so roughly 8 dB of headroom
 * was simply never used. That is quiet enough to lose to a television, which is
 * the room this app is actually used in — and speech needs more level than a
 * tone to stay intelligible over noise, so matching the beeps' RMS is not
 * enough on its own.
 */
export const TARGET_RMS = 0.158;

/** Never boost a clip more than this (6x ≈ +15.6 dB). */
export const MAX_GAIN = 6;

/**
 * How much to turn one clip up, from its own samples. Pure, so the rule can be
 * tested without Web Audio — see tests/voice.test.mjs.
 *
 * RMS rather than peak: peak-normalising leaves a clip with one loud plosive
 * as quiet as it was, which is most of them. The floor of 1 is deliberate —
 * this exists to make quiet clips audible, never to turn a good one down, and
 * without it the loudest take (`other-side-1`, already at -18.8 dB) would be
 * pulled *back*. The ceiling stops a near-silent or mis-cut clip being
 * amplified into noise.
 */
export function clipGain(samples, { targetRms = TARGET_RMS, maxGain = MAX_GAIN } = {}) {
  if (!samples || !samples.length) return 1;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  if (!(rms > 0)) return 1;
  return Math.min(Math.max(targetRms / rms, 1), maxGain);
}

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
  let limiter = null;
  const buffers = new Map();
  const gains = new Map();

  const ensure = () => {
    if (closed) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  /**
   * Everything goes out through one limiter.
   *
   * Turning a clip up by its RMS puts its peaks near or over full scale, and a
   * BufferSource wired straight to the destination just clips them — which is
   * audible as a crackle on exactly the consonants that carry the words. The
   * compressor catches those instead, so the boost is spent on the body of the
   * speech rather than on the two loudest samples in it.
   */
  const out = c => {
    if (!limiter) {
      limiter = c.createDynamicsCompressor();
      // Measured, not guessed: rendered all 134 clips through this chain in an
      // OfflineAudioContext and swept the settings. -2 dB / 2 ms let 42 of them
      // past full scale by up to +0.7 dBFS. -6 dB / 1 ms clips none of them and
      // lands *louder* on average (-15.5 dB RMS), because more of the signal is
      // being held against the ceiling rather than a few transients spiking
      // over it.
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.12;
      limiter.connect(c.destination);
    }
    return limiter;
  };

  const load = async (c, id) => {
    if (buffers.has(id)) return buffers.get(id);
    try {
      const res = await fetch(`audio/cues/${voice}/${id}.webm`);
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(id, buf);
      // Measured once, off the decoded samples, and cached with the buffer.
      // Doing it here rather than baking levels into the files means a clip
      // recorded later at a different level is handled on its own merits —
      // which is the thing that went wrong when Arnold's take arrived 9 dB
      // hotter than Snoop's and had to be matched by hand at encode time.
      gains.set(id, clipGain(buf.getChannelData(0)));
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
    /**
     * Play a clip. Resolves with its length in seconds, or 0 if there was
     * nothing to play.
     *
     * The length is returned because the finish cue needs it: the routine
     * tears its audio contexts down once the session ends, and closing them
     * mid-sentence cuts the clip off. A fixed timeout would have to be long
     * enough for the longest line in the longest voice, and would go stale the
     * moment a line is re-recorded — asking the buffer cannot.
     */
    say: async id => {
      const c = ensure();
      if (!c) return 0;
      const buf = await load(c, id);
      if (!buf || closed) return 0;   // torn down while the clip was still decoding
      stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = gains.get(id) ?? 1;
      src.connect(gain).connect(out(c));
      src.start();
      current = src;
      return buf.duration;
    },
    stop,
    close: () => {
      stop(); closed = true; limiter = null;
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
  };
}
