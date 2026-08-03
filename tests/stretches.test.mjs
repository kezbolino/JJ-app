// The stretch routine's data and timing maths — pure node, no browser.
//
//   node tests/stretches.test.mjs

import assert from 'node:assert/strict';
import {
  STRETCHES, segments, routineMs, clock,
  READY_MS, HOLD_MS, SEGMENT_MS,
} from '../js/stretches.js';
import { ART } from '../js/stretch-art.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

test('the cycle is 10 seconds to get ready and 30 to hold', () => {
  // The whole timer is derived from these two numbers, and they are what was
  // asked for. A change here silently rewrites every hold in the routine.
  assert.equal(READY_MS, 10_000);
  assert.equal(HOLD_MS, 30_000);
  assert.equal(SEGMENT_MS, 40_000);
});

test('every stretch is complete and uniquely named', () => {
  assert.ok(STRETCHES.length >= 8, 'too few stretches to cover the body');
  const ids = new Set();
  for (const s of STRETCHES) {
    assert.ok(s.id && !ids.has(s.id), `duplicate or missing id: ${s.id}`);
    ids.add(s.id);
    assert.ok(s.name, `${s.id} has no name`);
    assert.ok(s.targets, `${s.id} names no muscle group`);
    assert.ok(s.cue && s.cue.length > 20, `${s.id} has no usable cue`);
    assert.equal(typeof s.bilateral, 'boolean', `${s.id} does not say whether it has sides`);
  }
});

test('every stretch has artwork, and there is no artwork going spare', () => {
  // A stretch whose id has no ART entry renders an empty frame mid-routine —
  // stretchFigure() deliberately does not throw, so this is what catches it.
  for (const s of STRETCHES) {
    const art = ART[s.id];
    assert.ok(art, `${s.id} has no figure in stretch-art.js`);
    assert.match(art.viewBox, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/, `${s.id} viewBox is malformed`);
    assert.match(art.d, /^M[-\d.]/, `${s.id} path does not start with a move`);
    assert.ok(art.d.length > 500, `${s.id} path is too short to be a figure`);
  }
  const ids = new Set(STRETCHES.map(s => s.id));
  for (const key of Object.keys(ART)) {
    assert.ok(ids.has(key), `ART carries "${key}", which no stretch uses`);
  }
});

test('the artwork is square-framed and theme-neutral', () => {
  for (const [id, art] of Object.entries(ART)) {
    const [, , w, hgt] = art.viewBox.split(' ').map(Number);
    assert.equal(w, hgt, `${id} is not framed square, so it will scale oddly`);
    // No baked colours: the figures have to inherit currentColor or they
    // vanish against one of the two themes.
    assert.doesNotMatch(art.d, /#[0-9a-f]{3,6}/i, `${id} has a colour in its path data`);
  }
});

test('the routine covers the areas grappling actually taxes', () => {
  const all = STRETCHES.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['hip', 'hamstring', 'quad', 'glute', 'adductor', 'shoulder', 'neck', 'spine', 'wrist']) {
    assert.ok(all.includes(area), `nothing in the routine targets the ${area}s`);
  }
});

test('a two-sided stretch becomes two holds, one-sided becomes one', () => {
  const bilateral = STRETCHES.filter(s => s.bilateral).length;
  const single = STRETCHES.length - bilateral;
  assert.equal(segments().length, bilateral * 2 + single);
});

test('the two sides of a stretch are adjacent, left then right', () => {
  const segs = segments();
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].stretch.bilateral) {
      assert.equal(segs[i].side, null, `${segs[i].stretch.id} should not name a side`);
      continue;
    }
    if (segs[i].side !== 'Left side') continue;
    assert.equal(segs[i + 1]?.stretch.id, segs[i].stretch.id, 'the sides of a stretch are split up');
    assert.equal(segs[i + 1].side, 'Right side');
  }
});

test('every side of every stretch gets a hold', () => {
  const segs = segments();
  for (const s of STRETCHES) {
    const mine = segs.filter(seg => seg.stretch.id === s.id);
    assert.equal(mine.length, s.bilateral ? 2 : 1, `${s.id} is held the wrong number of times`);
  }
});

test('the routine lands in the 10–15 minute window it was asked for', () => {
  const mins = routineMs() / 60_000;
  assert.ok(mins >= 10 && mins <= 15, `routine is ${mins} min, outside 10–15`);
  assert.equal(routineMs(), segments().length * SEGMENT_MS);
});

test('clock formats mm:ss and never goes negative', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(9_000), '0:09');
  assert.equal(clock(70_000), '1:10');
  assert.equal(clock(720_000), '12:00');
  assert.equal(clock(-500), '0:00');
});

console.log(`\n${passed} passed`);
