// How loud a spoken cue is played — pure node.
//
//   node tests/voice.test.mjs
//
// The takes were recorded conservatively: across both voices they average
// about -24 dBFS RMS and peak at -8, so roughly 8 dB of headroom was never
// used, and the cues lost to a television. The fix is in the playback chain
// rather than in the files: nothing is re-encoded, no bytes are re-downloaded,
// and a clip recorded later at a different level is handled on its own merits
// — which is exactly what went wrong when Arnold's take arrived 9 dB hotter
// than Snoop's and had to be matched by hand at encode time (v52).
//
// The limiter that catches the resulting peaks is Web Audio and cannot be
// tested here; it was tuned by rendering all 134 clips through an
// OfflineAudioContext and measuring, and the numbers are in js/voice.js.

import assert from 'node:assert/strict';
import { clipGain, TARGET_RMS, MAX_GAIN } from '../js/voice.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

/** A constant-amplitude buffer at a given dBFS, so RMS is exactly that level. */
const at = db => new Float32Array(4800).fill(Math.pow(10, db / 20));
const dbOf = g => 20 * Math.log10(g);

test('a quiet clip is brought up to the target', () => {
  // -24 dB is where the recorded set actually sits.
  const g = clipGain(at(-24));
  assert.ok(Math.abs((-24 + dbOf(g)) - dbOf(TARGET_RMS)) < 0.01,
    `-24 dB clip landed at ${(-24 + dbOf(g)).toFixed(1)}, not ${dbOf(TARGET_RMS).toFixed(1)}`);
});

test('a clip already at or above the target is left alone', () => {
  // The floor of 1 is the point: this exists to make quiet clips audible, and
  // must never pull a well-recorded one back down. `other-side-1` is the real
  // case — it was already 6 dB hotter than its neighbours.
  assert.equal(clipGain(at(-10)), 1);
  assert.equal(clipGain(at(dbOf(TARGET_RMS))), 1);
  assert.equal(clipGain(at(-3)), 1);
});

test('a near-silent clip is not amplified into noise', () => {
  // Without the ceiling, a mis-cut clip of room tone gets multiplied by
  // hundreds and arrives as a blast of hiss. v32 shipped 24 silent clips once;
  // the next one must not be turned into the loudest thing in the routine.
  assert.equal(clipGain(at(-80)), MAX_GAIN);
  assert.ok(MAX_GAIN <= 8, `a ${MAX_GAIN}x ceiling is too much to apply blind`);
});

test('digital silence and an empty buffer are left at unity', () => {
  // Dividing by an RMS of zero is how this returns Infinity and the whole
  // routine goes silent — or worse, NaN, which sets gain.value to no value at
  // all and throws inside the tick.
  assert.equal(clipGain(new Float32Array(1000)), 1);
  assert.equal(clipGain(new Float32Array(0)), 1);
  assert.equal(clipGain(null), 1);
  assert.equal(clipGain(undefined), 1);
});

test('the gain is always a usable finite number', () => {
  for (const db of [-90, -60, -40, -30, -24, -18, -12, -6, -1]) {
    const g = clipGain(at(db));
    assert.ok(Number.isFinite(g) && g >= 1 && g <= MAX_GAIN,
      `${db} dB gave gain ${g}`);
  }
});

test('the target is loud enough to be worth the change, and not reckless', () => {
  // -16 dBFS RMS is about 8 dB up on the recorded average, which is the whole
  // point. Much past that and every clip sits on the limiter permanently.
  const db = dbOf(TARGET_RMS);
  assert.ok(db > -18 && db < -12, `target is ${db.toFixed(1)} dBFS RMS`);
});

console.log(`\n${passed} passed`);
