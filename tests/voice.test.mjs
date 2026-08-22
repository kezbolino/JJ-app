// How loud a spoken cue is played — pure node.
//
//   node tests/voice.test.mjs
//
// The takes were recorded conservatively: across both voices they average about
// -24 dBFS RMS. v57 turned each clip up to -16 dBFS RMS and let a Web Audio
// DynamicsCompressorNode catch the peaks; measured over all 134 clips that
// landed at -15.4 dBFS, and it still lost to a television.
//
// v59 moved the whole chain into the samples, which is why almost all of it can
// be tested here rather than by rendering in a browser and squinting at the
// numbers. It is three pure steps — drive to a target RMS, lift the speech
// band, limit the peaks — and then one static normalise onto the ceiling.
//
// Nothing is re-encoded. A clip recorded later at a different level is still
// handled on its own merits, which is exactly what went wrong when Arnold's
// take arrived 9 dB hotter than Snoop's and had to be matched by hand at encode
// time (v52).

import assert from 'node:assert/strict';
import {
  clipGain, limitSamples, presence, processClip,
  TARGET_RMS, MAX_GAIN, CEILING, SILENCE_PEAK, PRESENCE_HZ, PRESENCE_DB,
} from '../js/voice.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const SR = 48000;
/** A constant-amplitude buffer at a given dBFS, so RMS is exactly that level. */
const at = db => new Float32Array(4800).fill(Math.pow(10, db / 20));
const dbOf = g => 20 * Math.log10(g);
const peakOf = d => { let m = 0; for (const v of d) { const a = Math.abs(v); if (a > m) m = a; } return m; };
const rmsOf = d => { let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };

/** A second of a sine at `hz`, amplitude 1. */
const tone = (hz, amp = 1, n = SR) => {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * hz * i / SR);
  return x;
};

// --- the drive ------------------------------------------------------------

test('a quiet clip is driven up to the target', () => {
  const g = clipGain(at(-24));
  assert.ok(Math.abs((-24 + dbOf(g)) - dbOf(TARGET_RMS)) < 0.01,
    `-24 dB clip landed at ${(-24 + dbOf(g)).toFixed(1)}, not ${dbOf(TARGET_RMS).toFixed(1)}`);
});

test('the drive never turns a clip down; the normalise does that', () => {
  // clipGain's floor of 1 is still the rule — it exists to bring quiet clips up.
  // Levelling a hot clip *down* is now the job of the final peak normalise in
  // processClip, which is what makes every clip land on one level.
  assert.equal(clipGain(at(0)), 1);
  assert.ok(peakOf(processClip(tone(1000, 0.99), { sampleRate: SR })) <= CEILING + 1e-6,
    'a clip that was already hot came out above the ceiling');
});

test('digital silence and an empty buffer are left at unity', () => {
  // Dividing by an RMS of zero is how this returns Infinity and the whole
  // routine goes silent — or worse NaN, which throws inside the tick.
  assert.equal(clipGain(new Float32Array(1000)), 1);
  assert.equal(clipGain(new Float32Array(0)), 1);
  assert.equal(clipGain(null), 1);
  assert.equal(clipGain(undefined), 1);
});

test('the drive is always a usable finite number', () => {
  for (const db of [-90, -60, -40, -30, -24, -18, -12, -6, -1]) {
    const g = clipGain(at(db));
    assert.ok(Number.isFinite(g) && g >= 1 && g <= MAX_GAIN, `${db} dB gave gain ${g}`);
  }
});

// --- the presence lift ----------------------------------------------------

test('the presence lift boosts the speech band and leaves the ends alone', () => {
  // Measured off the second half of the buffer so the filter has settled. The
  // point of a *peaking* filter rather than a shelf is that the bass and the
  // top come out where they went in — this makes a voice clearer, it does not
  // make the whole clip brighter.
  const gainAt = hz => {
    const y = presence(tone(hz), { sampleRate: SR });
    return dbOf(rmsOf(y.subarray(SR / 2)) * Math.SQRT2);
  };
  assert.ok(Math.abs(gainAt(PRESENCE_HZ) - PRESENCE_DB) < 0.1,
    `${PRESENCE_HZ} Hz got ${gainAt(PRESENCE_HZ).toFixed(2)} dB, wanted ${PRESENCE_DB}`);
  assert.ok(Math.abs(gainAt(100)) < 0.5, 'the bass was moved');
  assert.ok(Math.abs(gainAt(12000)) < 0.7, 'the top was moved');
  assert.ok(gainAt(1000) > 0.5 && gainAt(1000) < PRESENCE_DB, 'the band is not wide enough to carry speech');
});

test('a lift of zero dB is a pass-through', () => {
  const x = tone(2600, 0.4);
  const y = presence(x, { sampleRate: SR, gainDb: 0 });
  assert.deepEqual(Array.from(y.subarray(0, 50)), Array.from(x.subarray(0, 50)));
});

// --- the limiter ----------------------------------------------------------

test('the limiter holds peaks under the ceiling', () => {
  // A quiet tone with one loud burst in it: the classic plosive. Before this
  // existed the burst was simply clipped, which is a crackle on exactly the
  // consonants that carry the words.
  const x = tone(300, 0.1);
  for (let i = 1000; i < 1060; i++) x[i] = 2.5;
  assert.ok(peakOf(limitSamples(x, { sampleRate: SR })) <= CEILING * 1.05,
    'a burst got through the limiter');
});

test('the limiter leaves a signal that is already under the ceiling untouched', () => {
  // No gain reduction means no distortion and no pumping. A limiter that
  // quietly reshapes quiet material is a limiter nobody can reason about.
  const x = tone(440, 0.3);
  const y = limitSamples(x, { sampleRate: SR });
  for (let i = 0; i < x.length; i += 97) {
    assert.ok(Math.abs(y[i] - x[i]) < 1e-6, `sample ${i} was altered: ${x[i]} → ${y[i]}`);
  }
});

test('the limiter starts reducing before the peak arrives, not after it', () => {
  // The whole reason for the look-ahead. A limiter that reacts on the sample it
  // is already too late for lets the transient through and then ducks the word
  // behind it — which is what the Web Audio compressor was doing, and why it
  // bought almost nothing.
  const x = new Float32Array(SR / 10).fill(0.5);
  for (let i = 2000; i < 2100; i++) x[i] = 4;
  const y = limitSamples(x, { sampleRate: SR });
  assert.ok(y[1995] < 0.5 * 0.999, 'the gain had not come down before the burst');
  assert.ok(peakOf(y) <= CEILING * 1.05, 'and it still let the burst through');
});

test('the limiter handles nothing at all', () => {
  assert.equal(limitSamples(new Float32Array(0), { sampleRate: SR }).length, 0);
  assert.equal(limitSamples(null, { sampleRate: SR }).length, 0);
});

// --- the whole chain ------------------------------------------------------

test('every clip comes out on the ceiling, whatever it came in at', () => {
  // This is what makes two takes recorded weeks apart sound like one voice at
  // one level, instead of being matched by hand at encode time.
  // Starting at -30: below that a clip is room tone, and the silence guard
  // deliberately leaves it where it is rather than normalising it up.
  for (const db of [-30, -24, -18, -12, -6]) {
    const y = processClip(tone(700, Math.pow(10, db / 20)), { sampleRate: SR });
    assert.ok(Math.abs(peakOf(y) - CEILING) < 1e-3,
      `a ${db} dBFS clip came out peaking at ${dbOf(peakOf(y)).toFixed(2)} dBFS`);
  }
});

test('nothing ever comes out over full scale', () => {
  // The one guarantee that matters: over full scale is a crackle, on a phone,
  // mid-hold, with no way to tell what happened.
  const nasty = new Float32Array(SR / 2);
  for (let i = 0; i < nasty.length; i++) {
    nasty[i] = Math.sin(2 * Math.PI * 180 * i / SR) * 0.02;
    if (i % 4801 === 0) for (let j = i; j < Math.min(nasty.length, i + 30); j++) nasty[j] = 0.9;
  }
  assert.ok(peakOf(processClip(nasty, { sampleRate: SR })) <= 1,
    'a spiky clip came out over full scale');
});

test('room tone is left alone rather than normalised into a blast of hiss', () => {
  // Load-bearing now that everything is normalised onto the ceiling. v32
  // shipped 24 clips that were true digital silence and nothing said so for
  // three versions; the next mis-cut file must not become the loudest thing in
  // the routine.
  const hiss = new Float32Array(4800);
  for (let i = 0; i < hiss.length; i++) hiss[i] = (i % 7 - 3) * 0.0005;
  assert.ok(peakOf(processClip(hiss, { sampleRate: SR })) < SILENCE_PEAK,
    'room tone was amplified');
  assert.equal(peakOf(processClip(new Float32Array(4800), { sampleRate: SR })), 0);
  assert.equal(processClip(new Float32Array(0), { sampleRate: SR }).length, 0);
});

test('the finished level is much louder, and still not crushed', () => {
  // Measured across all 134 real clips this chain lands at -11.0 dBFS RMS with
  // peaks at -1 dBFS and a crest factor of 10 dB, against v57's -15.4 dBFS.
  // Neither of those can be checked here — the clips are opus and node cannot
  // decode them — so this drives the *rule* with a signal shaped like speech:
  // a quiet body with sparse loud transients on top, ~24 dB of crest.
  //
  // Both bounds matter and they pull against each other. Too little gain and
  // the cue loses to a television, which is the whole complaint. Too much and
  // the crest collapses, which is a tannoy — intelligible, unpleasant, and the
  // sort of thing that gets the voices turned off altogether.
  const speech = new Float32Array(SR / 2);
  for (let i = 0; i < speech.length; i++) {
    speech[i] = 0.03 * Math.sin(2 * Math.PI * 220 * i / SR);
    if (i % 4800 < 60) speech[i] += 0.5 * Math.sin(2 * Math.PI * 2200 * i / SR);
  }
  const y = processClip(speech, { sampleRate: SR });
  const gained = dbOf(rmsOf(y) / rmsOf(speech));
  assert.ok(gained > 12, `the chain only found ${gained.toFixed(1)} dB — not worth the change`);
  const crest = dbOf(peakOf(y) / rmsOf(y));
  assert.ok(crest > 7, `crest came out at ${crest.toFixed(1)} dB — that is crushed`);
});

console.log(`\n${passed} passed`);
