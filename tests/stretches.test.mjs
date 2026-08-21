// The routines' data and timing maths — pure node, no browser.
//
//   node tests/stretches.test.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ROUTINES, DEFAULT_ROUTINE, getRoutine, segments, segmentMs, routineMs, clock,
  READY_MS, HOLD_MS, SEGMENT_MS, OTHER_SIDE_CUES, HYPE_CUES, FINISH_CUES,
  pickOtherSide, pickHype, pickFinish,
  phasesFor, segmentAt, stretchFigure,
} from '../js/stretches.js';
import { ART, PENDING_ART } from '../js/stretch-art.js';
import { VOICE_IDS, VOICES, pickVoice } from '../js/voices.js';
import { EXERCISES, WARM_UP } from '../js/strength.js';

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
  // Anything that can draw a figure counts, not just the routines: since v56
  // the strength screen renders one beside each movement name, so a lift's id
  // is a legitimate ART key. The guard is still worth having pointed the other
  // way — an ART key nothing can ever ask for is dead weight in the largest
  // file in the precached CORE.
  const ids = new Set([...allItems.map(i => i.id), ...EXERCISES.map(e => e.id)]);
  for (const key of Object.keys(ART)) {
    assert.ok(ids.has(key), `ART carries "${key}", which nothing renders`);
  }
  for (const key of PENDING_ART) {
    assert.ok(ids.has(key), `PENDING_ART carries "${key}", which nothing renders`);
  }
});

test('a movement with no artwork draws nothing rather than an empty frame', () => {
  // The PENDING_ART contract, tested directly. It used to be covered in a
  // browser by the rest-day routine, which had no figures at all; every
  // movement is drawn as of v56, so there is no longer a real one to point at —
  // and the contract still has to hold for the next movement added ahead of
  // its artwork.
  assert.equal(stretchFigure({ id: 'no-such-movement' }, 'nope'), null);
  assert.equal(stretchFigure(undefined), null);
  assert.equal(stretchFigure({}), null);
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
  assert.ok(rest >= 15 && rest <= 26, `rest day is ${rest} min, outside 15–26`);
  // The total is the sum of the segments, which is no longer count × length:
  // the warm-up runs work only. Assert the timeline, not the old shortcut.
  for (const r of ROUTINES) {
    const segs = segments(r);
    assert.equal(routineMs(r), segs.reduce((n, s) => n + s.length, 0), `${r.id} total`);
  }
});

test('the timeline is contiguous, starts at zero and has no gaps', () => {
  // Everything downstream is a lookup into these offsets. A gap or an overlap
  // would put the routine on the wrong movement, silently.
  for (const r of ROUTINES) {
    const segs = segments(r);
    assert.equal(segs[0].start, 0, `${r.id} does not start at zero`);
    for (let i = 0; i < segs.length; i++) {
      assert.equal(segs[i].end - segs[i].start, segs[i].length, `${r.id} segment ${i} length`);
      if (i) assert.equal(segs[i].start, segs[i - 1].end, `${r.id} has a gap before segment ${i}`);
    }
    assert.equal(segs[segs.length - 1].end, routineMs(r), `${r.id} timeline end`);
  }
});

test('a warm-up movement is work only — no get-ready, no rest', () => {
  // What was asked for: they flow one into the next. Both zero phases matter —
  // a countdown into a movement needing no setup is dead air, and resting
  // between warm-up movements defeats the point of warming up.
  const warmups = restDay.items.filter(i => i.warmup);
  assert.ok(warmups.length >= 4, 'the rest day lost its warm-up');
  for (const item of warmups) {
    const p = phasesFor(restDay, item);
    assert.equal(p.ready, 0, `${item.id} still counts you into a warm-up movement`);
    assert.equal(p.rest, 0, `${item.id} still rests after a warm-up movement`);
    assert.equal(p.work, restDay.phases.work, `${item.id} changed the work length too`);
  }
  // And the main session is untouched — this was a warm-up change, not a
  // rewrite of the session it warms you up for.
  for (const item of restDay.items.filter(i => !i.warmup)) {
    assert.deepEqual(phasesFor(restDay, item), restDay.phases, `${item.id} phases changed`);
  }
  // The cool-down has no warm-up at all, so nothing there moved.
  for (const item of postClass.items) {
    assert.deepEqual(phasesFor(postClass, item), postClass.phases, `${item.id} phases changed`);
  }
});

test('segmentAt finds the right movement at every boundary', () => {
  for (const r of ROUTINES) {
    const segs = segments(r);
    for (let i = 0; i < segs.length; i++) {
      assert.equal(segmentAt(segs, segs[i].start), i, `${r.id}: start of segment ${i}`);
      assert.equal(segmentAt(segs, segs[i].end - 1), i, `${r.id}: last ms of segment ${i}`);
    }
    assert.equal(segmentAt(segs, -1), -1, 'before the start');
    assert.equal(segmentAt(segs, routineMs(r)), -1, 'exactly at the end is past the end');
    assert.equal(segmentAt(segs, routineMs(r) + 5000), -1, 'past the end');
  }
});

test('the "other side" picker never repeats itself back to back', () => {
  // This is the property that matters: you hear this line 14 times a session,
  // and a take following itself is what makes a random line sound broken.
  let last = 0;
  for (let i = 0; i < 3000; i++) {
    const n = pickOtherSide(last);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= OTHER_SIDE_CUES, `picked ${n}, out of range`);
    assert.notEqual(n, last, 'the same take played twice running');
    last = n;
  }
});

test('every "other side" take is reachable, including the first and last', () => {
  // A fencepost in the skip-over would silently strand one take forever, and
  // nothing on screen would ever show it.
  for (let start = 0; start <= OTHER_SIDE_CUES; start++) {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(pickOtherSide(start));
    const expected = start >= 1 && start <= OTHER_SIDE_CUES ? OTHER_SIDE_CUES - 1 : OTHER_SIDE_CUES;
    assert.equal(seen.size, expected, `from ${start}, only reached ${[...seen].sort().join()}`);
  }
});

test('the picker is uniform over the takes it is allowed to choose', () => {
  // rand is injectable precisely so this is checkable: the browser caches a
  // decoded clip, so a repeat play fires no request and no network-watching
  // test could ever see these choices.
  const at = v => () => v;                        // a stubbed Math.random
  assert.deepEqual([0, 0.2, 0.4, 0.6, 0.8].map(v => pickOtherSide(3, at(v))), [1, 2, 4, 5, 6]);
  assert.deepEqual([0, 0.2, 0.4, 0.6, 0.8].map(v => pickOtherSide(1, at(v))), [2, 3, 4, 5, 6]);
  assert.deepEqual([0, 0.2, 0.4, 0.6, 0.8].map(v => pickOtherSide(6, at(v))), [1, 2, 3, 4, 5]);
  // No previous take: all six, so take 1 can open a session.
  assert.deepEqual([0, 0.99].map(v => pickOtherSide(0, at(v))), [1, 6]);
});

test('the finish picker reaches every take', () => {
  // No no-repeat guarantee to test: a session finishes once, so pickFinish is
  // always called with no previous take and draws from all five.
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pickFinish());
  assert.equal(seen.size, FINISH_CUES, `only reached ${[...seen].sort().join()}`);
});

test('the hype picker behaves the same way, over its own count', () => {
  let last = 0;
  for (let i = 0; i < 3000; i++) {
    const n = pickHype(last);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= HYPE_CUES, `picked ${n}, out of range`);
    assert.notEqual(n, last, 'the same hype line played twice running');
    last = n;
  }
  const seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(pickHype(0));
  assert.equal(seen.size, HYPE_CUES, `only reached ${[...seen].sort().join()}`);
});

test('a named voice is returned as-is, whatever the coin says', () => {
  // Changing the picker in Settings has to land, and it lands by this being
  // deterministic: no stickiness, no roll, no state.
  for (const voice of VOICE_IDS) {
    assert.equal(pickVoice(voice, () => 0), voice);
    assert.equal(pickVoice(voice, () => 0.999), voice);
  }
});

test('Mix reaches every voice, and only real ones', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pickVoice('', Math.random));
  assert.deepEqual([...seen].sort(), [...VOICE_IDS].sort());
});

test('an unrecognised preference still yields a usable voice', () => {
  // This is read out of localStorage, which an older version wrote and a user
  // can edit. It must never return undefined — that would build a player
  // fetching audio/cues/undefined/, i.e. every cue silent, with no error.
  for (const junk of [undefined, null, '', 'mix', 'snoopdogg', 42]) {
    assert.ok(VOICE_IDS.includes(pickVoice(junk, () => 0.5)),
      `pickVoice(${JSON.stringify(junk)}) returned something with no clips behind it`);
  }
});

test('the voice picker offers a default plus every recorded voice', () => {
  // The '' entry is Mix and must stay first: js/appearance.js treats '' as
  // "unset" for all four pickers, and Settings paints the pressed state off it.
  assert.equal(VOICES[0][0], '');
  assert.deepEqual(VOICES.slice(1).map(([v]) => v), VOICE_IDS);
});

// sw.js builds its cue paths from a per-voice map rather than spelling out a
// hundred-odd strings, so the tests read that map back out instead of scraping
// literals.
function swCues() {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const block = sw.match(/const CUES = \{[\s\S]*?\n\};/);
  assert.ok(block, 'sw.js no longer declares a CUES map');
  const out = {};
  for (const m of block[0].matchAll(/(\w+): \[([\s\S]*?)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  return out;
}

test('there is a recorded take behind every number a picker can return', () => {
  // A picker that can return a number with no file behind it is a silent cue.
  // The spoken countdown has no picker, but it has the same failure mode.
  // Every voice has to answer for all of them: these are chosen at random, so
  // a gap here is a cue that goes missing on some sessions and not others.
  const want = [
    ...Array.from({ length: OTHER_SIDE_CUES }, (_, i) => `other-side-${i + 1}`),
    ...Array.from({ length: HYPE_CUES }, (_, i) => `hype-${i + 1}`),
    ...Array.from({ length: FINISH_CUES }, (_, i) => `finish-${i + 1}`),
    'countdown',
  ];
  for (const [voice, ids] of Object.entries(swCues())) {
    for (const name of want) {
      assert.ok(ids.includes(name), `${voice} has no ${name}.webm`);
    }
  }
});

test('every shipped voice is a voice the app can pick', () => {
  // sw.js precaches folders; js/voices.js is what can choose them. A folder
  // precached but unreachable is dead download weight on every update.
  for (const voice of Object.keys(swCues())) {
    assert.ok(VOICE_IDS.includes(voice), `sw.js ships '${voice}', which js/voices.js cannot pick`);
  }
  // The reverse is allowed and is the state a voice sits in while it is being
  // recorded: pickable, no clips, every cue silent. That is createVoice's
  // standing contract, the same as PENDING_ART for figures.
});

test('every recorded clip is precached, and every precached clip exists', () => {
  // Both directions, because both have already gone wrong: v39 wrote the four
  // warm-up clips to disk and never added them to SHELL, so they 404'd offline
  // with nothing on screen to show for it. A name in SHELL with no file behind
  // it is worse — `cache.addAll` rejects, and the whole install fails.
  const cues = swCues();
  const root = new URL('../audio/cues/', import.meta.url);
  const folders = readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name);

  // A folder of clips nobody precaches is the v39 bug with a directory around
  // it: the voice works online and goes silent the moment the phone does not.
  for (const folder of folders) {
    assert.ok(folder in cues,
      `audio/cues/${folder}/ exists but sw.js does not precache it — it 404s offline`);
  }
  for (const [voice, ids] of Object.entries(cues)) {
    assert.ok(folders.includes(voice),
      `sw.js precaches audio/cues/${voice}/, which does not exist — install will fail`);
    const disk = new Set(readdirSync(new URL(`${voice}/`, root))
      .filter(f => f.endsWith('.webm')).map(f => f.slice(0, -5)));
    for (const id of ids) {
      assert.ok(disk.has(id), `${voice}/${id}.webm is precached but missing — install will fail`);
    }
    for (const id of disk) {
      assert.ok(ids.includes(id), `${voice}/${id}.webm is recorded but not precached`);
    }
  }
});

test('every voice names every movement the app can speak', () => {
  // A voice is chosen per session, so a movement one voice cannot name is a
  // cue that vanishes on half your sessions — much harder to notice than one
  // that is always missing, and it is what the two voices were ragged on until
  // the Snoop kettlebell and press-up lines were recorded.
  //
  // Both routines *and* the strength module: the lifts are cues too, and they
  // were the three that were missing.
  const spoken = [
    ...ROUTINES.flatMap(r => r.items.map(i => i.id)),
    ...EXERCISES.map(e => e.id),
    ...WARM_UP.map(w => w.cue).filter(Boolean),
  ];
  for (const [voice, ids] of Object.entries(swCues())) {
    for (const id of spoken) {
      assert.ok(ids.includes(id), `${voice} cannot say "${id}" — it is silent on that movement`);
    }
  }
});

// REST_OVER_CUES is module-local to js/views/strength.js, which imports the DOM
// and so cannot be pulled into node. Read the number rather than copying it: a
// copy is a second place to update and it would go stale silently.
function restOverCues() {
  const view = readFileSync(new URL('../js/views/strength.js', import.meta.url), 'utf8');
  const m = view.match(/const REST_OVER_CUES = (\d+);/);
  assert.ok(m, 'js/views/strength.js no longer declares REST_OVER_CUES');
  return Number(m[1]);
}

test('every precached clip is one the app can actually ask for', () => {
  // The gap this closes is not a missing file — it is a file nobody requests.
  // `wu-press-ups` sat wired as `cue: null` in WARM_UP for two versions after
  // its clip was on disk and in the precache: downloaded on every update,
  // unreachable, and silent in a way no other test could see. A clip that
  // nothing can name is dead weight at best and a wiring bug at worst.
  const reachable = new Set([
    ...ROUTINES.flatMap(r => r.items.map(i => i.id)),
    ...EXERCISES.map(e => e.id),
    ...WARM_UP.map(w => w.cue).filter(Boolean),
    // The generic pools, chosen by number rather than named by a movement.
    'countdown',
    ...Array.from({ length: OTHER_SIDE_CUES }, (_, i) => `other-side-${i + 1}`),
    ...Array.from({ length: HYPE_CUES }, (_, i) => `hype-${i + 1}`),
    ...Array.from({ length: restOverCues() }, (_, i) => `rest-over-${i + 1}`),
    ...Array.from({ length: FINISH_CUES }, (_, i) => `finish-${i + 1}`),
  ]);

  for (const [voice, ids] of Object.entries(swCues())) {
    for (const id of ids) {
      assert.ok(reachable.has(id),
        `${voice}/${id}.webm is precached but nothing in the app requests it`);
    }
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
