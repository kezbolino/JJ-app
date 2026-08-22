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
 * How hard to drive a clip into the limiter, as RMS amplitude.
 *
 * The takes were recorded conservatively: measured across both voices they
 * average about -25 dBFS RMS and peak at -8 dBFS. v57 turned each clip up to
 * -16 dBFS RMS (this number was 0.158) and let a DynamicsCompressorNode catch
 * the peaks. Measured across all 134 clips that landed at -15.4 dBFS RMS with
 * peaks at -0.49 dBFS — and the user still could not hear it over a
 * television.
 *
 * **The reason there was nothing left to give is worth writing down.** Sweeping
 * a post-limiter makeup gain over the whole set put every single clip past full
 * scale, and the crest factor stayed at ~15 dB however hard the compressor was
 * driven. A DynamicsCompressorNode is not a look-ahead limiter: its fastest
 * attack is far too slow for speech transients, so it was passing them through
 * essentially untouched and the "limiter" was buying almost nothing. The peaks
 * were already against the ceiling, so any further gain was clipping, not
 * loudness.
 *
 * So the loudness work moved into the samples (`processClip` below), where a
 * real look-ahead limiter can hold the peaks and the average can come up
 * underneath them. This number is now the *drive* into that limiter rather
 * than the finished level: the more it exceeds what the clip can carry, the
 * more the limiter squashes, and the louder the result reads.
 */
export const TARGET_RMS = 1;

/** Never boost a clip more than this (32x ≈ +30 dB). */
export const MAX_GAIN = 32;

/**
 * A clip quieter than this at its loudest is not a clip, and is left alone.
 *
 * This guard is load-bearing now in a way it was not before. Everything that
 * comes out of `processClip` is normalised to the ceiling, so without it a
 * mis-cut file holding nothing but room tone would be normalised to full scale
 * and play as a blast of hiss. v32 shipped 24 clips that were true digital
 * silence, and the app said nothing about it for three versions — the failure
 * this protects against is one this repo has actually had.
 */
export const SILENCE_PEAK = 0.01;

/**
 * Peak ceiling, -1 dBFS. Every clip is normalised to exactly this after
 * limiting, which is what makes them all one loudness. Not 0 dBFS: a decoded
 * lossy file can reconstruct a sample slightly above what the encoder saw, and
 * the last dB is cheap insurance against that arriving as a crackle.
 */
export const CEILING = 0.891;

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

/** Look-ahead window and release, in seconds. */
export const LOOK_AHEAD_S = 0.0015;
export const RELEASE_S = 0.05;

/**
 * A look-ahead peak limiter, applied to the samples themselves.
 *
 * This is what actually makes the cues louder, and it is here rather than in
 * the audio graph because the graph's own compressor could not do it — see
 * TARGET_RMS above. The shape is the standard one:
 *
 *   1. the gain each sample *would* need to sit under the ceiling,
 *   2. a running minimum of that over the look-ahead window, so the reduction
 *      is already in place by the time the peak arrives rather than after it,
 *   3. a one-pole release, so the gain comes back gradually instead of pumping
 *      between every syllable,
 *   4. a trailing average over the same window, which turns the step at the
 *      start of a reduction into a ramp — a gain step of several dB inside one
 *      sample is a click.
 *
 * Step 4 can in principle round the envelope back up a hair above what step 2
 * asked for, so the caller finishes with a single static peak-normalise. Across
 * all 134 real clips it turns out to correct nothing — measured, with the
 * normalise disabled, the loudest peak in the set is already exactly on the
 * ceiling. It stays because it is what makes "every clip comes out at one
 * level" a guarantee rather than a happy consequence of the drive being high,
 * and because one trivially-true line is a better safety argument than one
 * about window alignment that has to survive the numbers being retuned.
 *
 * Pure — takes and returns plain sample arrays, so tests/voice.test.mjs can
 * drive it in node with signals whose right answer is known by hand.
 */
export function limitSamples(samples, {
  ceiling = CEILING, sampleRate = 48000,
  lookAheadS = LOOK_AHEAD_S, releaseS = RELEASE_S,
} = {}) {
  const n = samples?.length ?? 0;
  const out = new Float32Array(n);
  if (!n) return out;

  const look = Math.max(1, Math.round(lookAheadS * sampleRate));
  const release = Math.max(1, Math.round(releaseS * sampleRate));
  const env = new Float32Array(n);

  // 1 + 2. The gain needed at each sample, minimised over the window ahead of
  // it. A plain scan of the window is O(n·look); `look` is ~72 samples, which
  // is nothing next to decoding the clip in the first place, and a monotonic
  // deque here would be the kind of cleverness that goes wrong quietly.
  for (let i = 0; i < n; i++) {
    let need = 1;
    const end = Math.min(n, i + look);
    for (let j = i; j < end; j++) {
      const a = Math.abs(samples[j]);
      if (a > ceiling) { const g = ceiling / a; if (g < need) need = g; }
    }
    env[i] = need;
  }

  // 3. Instant attack (the look-ahead has already seen the peak coming), and a
  // gradual release back up.
  const step = 1 / release;
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = env[i] < g ? env[i] : Math.min(env[i], g + step);
    env[i] = g;
  }

  // 4. Smooth the envelope, and apply it.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += env[i];
    if (i >= look) sum -= env[i - look];
    out[i] = samples[i] * (sum / Math.min(i + 1, look));
  }
  return out;
}

/** Presence lift: centre frequency, Q, and gain in dB. */
export const PRESENCE_HZ = 2600;
export const PRESENCE_Q = 0.8;
export const PRESENCE_DB = 5;

/**
 * A peaking EQ, RBJ cookbook, run over the samples.
 *
 * Loudness alone stopped being available: after the limiter below, the clips
 * peak at the ceiling and the app is at digital maximum — there is no more
 * level to give, only more squashing. What is still available is *where* the
 * level sits. Speech is carried over background noise almost entirely by the
 * 1-4 kHz band, which is why every broadcast voice chain lifts it, and a few dB
 * there buys more intelligibility over a television than the same few dB spread
 * across the whole spectrum would.
 *
 * Applied before limiting on purpose, so the limiter sees the boosted peaks and
 * the clip still lands exactly on the ceiling. Boosting afterwards would push
 * it straight back over.
 *
 * Modest by intent — 5 dB, wide. This is a de-Googled Android phone playing a
 * cool-down in someone's living room, not a broadcast desk, and pushing it
 * further starts to make both voices sound thin and shouty rather than clear.
 */
export function presence(samples, {
  sampleRate = 48000, hz = PRESENCE_HZ, q = PRESENCE_Q, gainDb = PRESENCE_DB,
} = {}) {
  const n = samples?.length ?? 0;
  const out = new Float32Array(n);
  if (!n || !gainDb) { out.set(samples ?? []); return out; }

  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * hz / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);

  const b0 = (1 + alpha * A), b1 = -2 * cos, b2 = (1 - alpha * A);
  const a0 = (1 + alpha / A), a1 = -2 * cos, a2 = (1 - alpha / A);

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = samples[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

/**
 * Turn one clip up: drive it, lift the speech band, limit the peaks, land it on
 * the ceiling.
 *
 * Every clip comes out at exactly the same peak, which is what makes a set of
 * takes recorded weeks apart sound like one voice at one level — the thing that
 * had to be done by hand at encode time when Arnold's take arrived 9 dB hotter
 * than Snoop's (v52).
 */
export function processClip(samples, opts = {}) {
  const { ceiling = CEILING } = opts;
  const n = samples?.length ?? 0;
  if (!n) return new Float32Array(0);

  let srcPeak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(samples[i]); if (a > srcPeak) srcPeak = a; }
  if (srcPeak < (opts.silencePeak ?? SILENCE_PEAK)) return Float32Array.from(samples);

  const gain = clipGain(samples, opts);
  const driven = new Float32Array(n);
  for (let i = 0; i < n; i++) driven[i] = samples[i] * gain;

  const limited = limitSamples(presence(driven, opts), opts);

  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(limited[i]); if (a > peak) peak = a; }
  if (!(peak > 0)) return limited;
  const trim = ceiling / peak;
  for (let i = 0; i < n; i++) limited[i] *= trim;
  return limited;
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
      // Levelled once, in place, off the decoded samples — not baked into the
      // files. A clip recorded later at a different level is then handled on
      // its own merits, which is the thing that went wrong when Arnold's take
      // arrived 9 dB hotter than Snoop's and had to be matched by hand at
      // encode time (v52). Done once per clip per session: a decode has already
      // happened by this point and costs far more than one pass over the
      // samples.
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const data = buf.getChannelData(ch);
        data.set(processClip(data, { sampleRate: buf.sampleRate }));
      }
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
      // Straight to the destination. The levelling is already in the samples,
      // and the DynamicsCompressorNode that used to sit here was doing almost
      // nothing — see TARGET_RMS.
      src.connect(c.destination);
      src.start();
      current = src;
      return buf.duration;
    },
    stop,
    close: () => {
      stop(); closed = true;
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
  };
}
