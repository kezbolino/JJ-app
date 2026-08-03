// The routines' data and timing maths — pure node, no browser.
//
//   node tests/stretches.test.mjs

import assert from 'node:assert/strict';
import {
  ROUTINES, DEFAULT_ROUTINE, getRoutine, segments, segmentMs, routineMs, clock,
  READY_MS, HOLD_MS, SEGMENT_MS,
} from '../js/stretches.js';
import { ART, PENDING_ART } from '../js/stretch-art.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const postClass = getRoutine('post-class');
const restDay = getRoutine('rest-day');
const allItems = ROUTINES.flatMap(r => r.items);

test('the cool-down cycle is 10 seconds to get ready and 30 to hold', () => {
  // What was asked for, and what the whole timer derives from.
  assert.equal(READY_MS, 10_000);
  assert.equal(HOLD_MS, 30_000);
  assert.equal(SEGMENT_MS, 40_000);
  assert.deepEqual(postClass.phases, { ready: 10_000, work: 30_000, rest: 0 });
});

test('the cool-down has no rest phase and the rest-day session does', () => {
  // Strength work needs rest between sets; static stretching does not. A rest
  // of 0 is what lets both routines share one code path in the view.
  assert.equal(postClass.phases.rest, 0);
  assert.ok(restDay.phases.rest > 0, 'rest-day sets run back to back');
  assert.equal(segmentMs(postClass), 40_000);
  assert.equal(segmentMs(restDay), 65_000);
});

test('an unknown routine id falls back to the cool-down instead of crashing', () => {
  assert.equal(getRoutine('nope').id, DEFAULT_ROUTINE);
  assert.equal(getRoutine(undefined).id, DEFAULT_ROUTINE);
});

test('every item is complete, and ids are unique across both routines', () => {
  const ids = new Set();
  for (const item of allItems) {
    assert.ok(item.id && !ids.has(item.id), `duplicate or missing id: ${item.id}`);
    ids.add(item.id);
    assert.ok(item.name, `${item.id} has no name`);
    assert.ok(item.targets, `${item.id} names no muscle group`);
    assert.ok(item.cue && item.cue.length > 20, `${item.id} has no usable cue`);
    assert.equal(typeof item.bilateral, 'boolean', `${item.id} does not say whether it has sides`);
  }
});

test('every rest-day movement says how much to do', () => {
  // A rep-based movement with no dose is unusable — you'd be guessing.
  for (const item of restDay.items) {
    assert.ok(item.dose, `${item.id} does not say how many reps or how long`);
  }
});

test('every item either has artwork or is declared as awaiting it', () => {
  // The point of PENDING_ART: a typo'd id fails here instead of silently
  // rendering nothing forever.
  for (const item of allItems) {
    const drawn = Boolean(ART[item.id]);
    const pending = PENDING_ART.has(item.id);
    assert.ok(drawn || pending, `${item.id} has no figure and is not in PENDING_ART`);
    assert.ok(!(drawn && pending), `${item.id} is both drawn and pending — drop it from PENDING_ART`);
  }
  const ids = new Set(allItems.map(i => i.id));
  for (const key of Object.keys(ART)) {
    assert.ok(ids.has(key), `ART carries "${key}", which no routine uses`);
  }
  for (const key of PENDING_ART) {
    assert.ok(ids.has(key), `PENDING_ART carries "${key}", which no routine uses`);
  }
});

test('the artwork that exists is square-framed and theme-neutral', () => {
  for (const [id, art] of Object.entries(ART)) {
    assert.match(art.viewBox, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/, `${id} viewBox is malformed`);
    const [, , w, hgt] = art.viewBox.split(' ').map(Number);
    assert.equal(w, hgt, `${id} is not framed square, so it will scale oddly`);
    assert.match(art.d, /^M[-\d.]/, `${id} path does not start with a move`);
    // No baked colours: a figure with its own fill vanishes against one theme.
    assert.doesNotMatch(art.d, /#[0-9a-f]{3,6}/i, `${id} has a colour in its path data`);
  }
});

test('the cool-down covers the areas grappling actually taxes', () => {
  const all = postClass.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['hip', 'hamstring', 'quad', 'glute', 'adductor', 'shoulder',
    'neck', 'spine', 'wrist', 'ankle', 'thoracic']) {
    assert.ok(all.includes(area), `nothing in the cool-down targets the ${area}s`);
  }
});

test('the rest-day session loads the end of the range, not just the neck', () => {
  const all = restDay.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['adductor', 'hamstring', 'glute', 'hip', 'shoulder', 'neck', 'thoracic']) {
    assert.ok(all.includes(area), `nothing in the rest-day session targets the ${area}s`);
  }
});

test('a two-sided item becomes two sets, one-sided becomes one', () => {
  for (const routine of ROUTINES) {
    const bilateral = routine.items.filter(i => i.bilateral).length;
    const single = routine.items.length - bilateral;
    assert.equal(segments(routine).length, bilateral * 2 + single, `${routine.id} segment count`);
  }
});

test('the two sides of an item are adjacent, left then right', () => {
  for (const routine of ROUTINES) {
    const segs = segments(routine);
    for (let i = 0; i < segs.length; i++) {
      if (!segs[i].item.bilateral) {
        assert.equal(segs[i].side, null, `${segs[i].item.id} should not name a side`);
        continue;
      }
      if (segs[i].side !== 'Left side') continue;
      assert.equal(segs[i + 1]?.item.id, segs[i].item.id, 'the sides of an item are split up');
      assert.equal(segs[i + 1].side, 'Right side');
    }
  }
});

test('every side of every item gets a set', () => {
  for (const routine of ROUTINES) {
    const segs = segments(routine);
    for (const item of routine.items) {
      const mine = segs.filter(seg => seg.item.id === item.id);
      assert.equal(mine.length, item.bilateral ? 2 : 1, `${item.id} runs the wrong number of times`);
    }
  }
});

test('both routines land in the window they were asked for', () => {
  const cool = routineMs(postClass) / 60_000;
  assert.ok(cool >= 10 && cool <= 15, `cool-down is ${cool} min, outside 10–15`);
  const rest = routineMs(restDay) / 60_000;
  assert.ok(rest >= 15 && rest <= 22, `rest day is ${rest} min, nowhere near the 20 asked for`);
  for (const r of ROUTINES) {
    assert.equal(routineMs(r), segments(r).length * segmentMs(r), `${r.id} total`);
  }
});

test('clock formats mm:ss and never goes negative', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(9_000), '0:09');
  assert.equal(clock(70_000), '1:10');
  assert.equal(clock(720_000), '12:00');
  assert.equal(clock(-500), '0:00');
});

console.log(`\n${passed} passed`);
