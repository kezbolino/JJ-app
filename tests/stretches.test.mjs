// The routines' data and timing maths — pure node, no browser.
//
//   node tests/stretches.test.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ROUTINES, DEFAULT_ROUTINE, getRoutine, segments, segmentMs, routineMs, clock,
  levelFor, itemAt, routineAt, completionsOf, sessionsToNextLevel, SESSIONS_PER_LEVEL,
  READY_MS, HOLD_MS, SEGMENT_MS, OTHER_SIDE_CUES, HYPE_CUES, FINISH_CUES,
  pickOtherSide, pickHype, pickFinish,
  phasesFor, segmentAt, stretchFigure,
} from '../js/stretches.js';
import { ART, PENDING_ART } from '../js/stretch-art.js';
import { STRENGTH_ART } from '../js/strength-art.js';
import { VOICE_IDS, VOICES, pickVoice, PENDING_CUES } from '../js/voices.js';
import { EXERCISES, WARM_UP } from '../js/strength.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const postClass = getRoutine('post-class');
const restDay = getRoutine('rest-day');
const pilates = getRoutine('pilates');
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

test('every item is complete, and an id always names the same movement', () => {
  // Ids may repeat *across* routines and deliberately do: the knee routine's
  // warm-up reuses the rest day's three, exactly as `single-leg-rdl` is one
  // movement shared by the rest day and the lift (v49). One id is one figure
  // and one voice clip, so sharing is the point — what must never happen is
  // the same id naming two different movements, which would put the wrong
  // drawing and the wrong spoken name on screen with nothing to notice.
  const seen = new Map();
  for (const item of allItems) {
    assert.ok(item.id, 'an item has no id');
    const prior = seen.get(item.id);
    if (prior) {
      assert.equal(item.name, prior.name, `${item.id} names two different movements`);
      assert.equal(item.targets, prior.targets, `${item.id} targets two different things`);
    }
    seen.set(item.id, item);
    assert.ok(item.name, `${item.id} has no name`);
    assert.ok(item.targets, `${item.id} names no muscle group`);
    assert.ok(item.cue && item.cue.length > 20, `${item.id} has no usable cue`);
    assert.equal(typeof item.bilateral, 'boolean', `${item.id} does not say whether it has sides`);
  }
});

/** Within one routine an id must still be unique, or the counter lies. */
test('no routine lists the same movement twice', () => {
  for (const r of ROUTINES) {
    const ids = r.items.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length, `${r.id} lists a movement twice`);
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
  // An ART key nothing can ever ask for is dead weight in the largest file in
  // the precached CORE, so the guard also points the other way. Lift ids count
  // here too — `single-leg-rdl` is one movement under one id, drawn by both the
  // rest-day routine and the lift screen, and it lives in ART.
  const ids = new Set([...allItems.map(i => i.id), ...EXERCISES.map(e => e.id)]);
  for (const key of Object.keys(ART)) {
    assert.ok(ids.has(key), `ART carries "${key}", which nothing renders`);
  }
  for (const key of PENDING_ART) {
    assert.ok(ids.has(key), `PENDING_ART carries "${key}", which nothing renders`);
  }
});

test('the lift artwork stays lift-only, and does not shadow a routine figure', () => {
  // js/strength-art.js is outside CORE and loaded lazily (v58), which is only
  // safe while nothing a *routine* draws lives there: a routine figure out
  // there would be missing on a phone that has never opened the lift screen,
  // and nothing would say so.
  //
  // The overlap check is the other half. A duplicated id would be 6 KB of dead
  // bytes and, worse, two drawings of one movement that could drift apart —
  // the lift screen would show one and the rest-day routine the other.
  const routineIds = new Set(allItems.map(i => i.id));
  const liftIds = new Set([...EXERCISES.map(e => e.id), ...WARM_UP.map(w => w.id)]);
  for (const key of Object.keys(STRENGTH_ART)) {
    assert.ok(liftIds.has(key), `STRENGTH_ART carries "${key}", which the lift screen never draws`);
    assert.ok(!routineIds.has(key),
      `"${key}" is drawn by a routine, so its figure belongs in ART where CORE precaches it`);
    assert.ok(!ART[key], `"${key}" is in both art files — one of the two copies is never seen`);
  }
});

test('the lift figures are square-framed and theme-neutral too', () => {
  // The same three checks as ART below. Split out rather than folded in,
  // because a second file is exactly where a rule quietly stops being applied.
  for (const [id, art] of Object.entries(STRENGTH_ART)) {
    const [, , w, hgt] = art.viewBox.split(' ').map(Number);
    assert.equal(w, hgt, `${id} is not framed square, so it will scale oddly`);
    assert.match(art.d, /^M[-\d.]/, `${id} path does not start with a move`);
    assert.doesNotMatch(art.d, /#[0-9a-f]{3,6}/i, `${id} has a colour in its path data`);
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

const knees = ROUTINES.find(r => r.id === 'knees');

test('the knee routine warms itself up, because it may be the only thing done', () => {
  // The cool-down needs no warm-up: a class just provided one. This loads
  // knees under a bell and through deep flexion and is explicitly the "no time
  // for anything else" session, so it cannot assume you are warm.
  const warmups = knees.items.filter(i => i.warmup);
  assert.equal(warmups.length, 3, 'the knee routine lost its warm-up');
  assert.ok(warmups.every(w => restDay.items.some(r => r.id === w.id)),
    'a knee warm-up id is not one the rest day already defines — it would need its own clip');
});

test('a level costs more than one good day', () => {
  // Every other assertion here reads SESSIONS_PER_LEVEL, so none of them can
  // catch it being changed — the constant *is* the policy, and dropping it to
  // 1 means a level per session, which is not a progression, it is a treadmill.
  // Ranged rather than pinned, so tuning it deliberately is not a test failure.
  assert.ok(SESSIONS_PER_LEVEL >= 2,
    'one session buys a level — the same instinct as the strength ladder needing two good sessions');
  assert.ok(SESSIONS_PER_LEVEL <= 10,
    `${SESSIONS_PER_LEVEL} sessions a level is months to the top — nobody will see level 3`);
});

test('a knee level is earned by finishing, and nothing else', () => {
  const item = knees.items.find(i => i.id === 'heel-dig-bridge');
  const n = item.levels.length;
  assert.equal(itemAt(item, 0).level, 0);
  assert.equal(itemAt(item, SESSIONS_PER_LEVEL - 1).level, 0, 'levelled up one session early');
  assert.equal(itemAt(item, SESSIONS_PER_LEVEL).level, 1);
  assert.equal(itemAt(item, SESSIONS_PER_LEVEL * 2).level, 2);
  // Running out of levels is the routine being finished with you, not an error.
  assert.equal(itemAt(item, 9999).level, n - 1, 'ran off the end of the levels');
  assert.equal(sessionsToNextLevel(0, n), SESSIONS_PER_LEVEL);
  assert.equal(sessionsToNextLevel(SESSIONS_PER_LEVEL - 1, n), 1);
  assert.equal(sessionsToNextLevel(SESSIONS_PER_LEVEL * 2, n), null, 'top level still promises another');
});

test('a level changes the dose and the cue, never the id or the name', () => {
  // This is what keeps the routine at seven figures and seven voice lines
  // rather than twenty-one. Break it and every level needs its own asset.
  for (const item of knees.items.filter(i => i.levels?.length)) {
    for (let c = 0; c < item.levels.length * SESSIONS_PER_LEVEL; c += SESSIONS_PER_LEVEL) {
      const at = itemAt(item, c);
      assert.equal(at.id, item.id, `${item.id} changes id at ${c} sessions`);
      assert.equal(at.name, item.name, `${item.id} changes name at ${c} sessions`);
      assert.ok(at.dose, `${item.id} has no dose at ${c} sessions`);
      assert.ok(at.cue.length > 20, `${item.id} has no usable cue at ${c} sessions`);
    }
  }
});

test('every timed working movement says how many reps to aim for', () => {
  // The work phase is a clock, so "how many?" has no answer on screen unless
  // the movement carries one. The rest day has always stated reps inside its
  // dose ("8-12 reps"); the knee routine's dose carries the level's loading
  // instead, so the count needed its own field or it simply vanished.
  for (const item of knees.items.filter(i => !i.warmup)) {
    assert.ok(/\d/.test(item.reps ?? ''),
      `${item.id} states no rep guide, so a 35s work phase says nothing about how many`);
    for (const level of item.levels ?? []) {
      assert.ok(/\d/.test(level.reps ?? ''),
        `${item.id} loses its rep guide at one of its levels`);
    }
  }
});

test('a rep guide follows the level, like the dose and the cue do', () => {
  const item = knees.items.find(i => i.id === 'goblet-squat');
  const seen = item.levels.map((_, i) => itemAt(item, i * SESSIONS_PER_LEVEL).reps);
  assert.equal(seen.length, item.levels.length);
  for (const [i, reps] of seen.entries()) {
    assert.equal(reps, item.levels[i].reps, `level ${i} did not carry its own rep guide through itemAt`);
  }
  // Harder loading, fewer reps in the same 35 seconds — if that ever inverts,
  // the numbers were copied rather than thought about.
  const first = parseInt(seen[0], 10);
  const last = parseInt(seen[seen.length - 1], 10);
  assert.ok(last < first, `goblet squat asks for ${last} reps at the top level and ${first} at the bottom`);
});

test('every level is a real step up, not the same text twice', () => {
  for (const item of knees.items.filter(i => i.levels?.length)) {
    const doses = item.levels.map(l => l.dose);
    const cues = item.levels.map(l => l.cue);
    assert.equal(new Set(doses).size, doses.length, `${item.id} repeats a dose between levels`);
    assert.equal(new Set(cues).size, cues.length, `${item.id} repeats a cue between levels`);
  }
});

test('only the knee routine progresses, and the others are untouched by it', () => {
  for (const r of ROUTINES) {
    const levelled = r.items.some(i => i.levels?.length);
    assert.equal(!!r.progresses, levelled, `${r.id}: progresses flag and levels disagree`);
    // routineAt is identity for a routine without levels — that is the whole
    // reason the other three needed no changes.
    if (!levelled) assert.equal(routineAt(r, 12), r, `${r.id} was rebuilt by routineAt for nothing`);
  }
});

test('completions are counted from the mobility log, per routine', () => {
  const log = [
    { id: 'a', date: '2026-09-01', routine: 'knees' },
    { id: 'b', date: '2026-09-02', routine: 'rest-day' },
    { id: 'c', date: '2026-09-03', routine: 'knees' },
  ];
  assert.equal(completionsOf('knees', log), 2);
  assert.equal(completionsOf('rest-day', log), 1);
  assert.equal(completionsOf('pilates', log), 0);
  assert.equal(completionsOf('knees', []), 0, 'an empty log is level 1, not a crash');
});

test('the knee routine fits the gap it was asked for', () => {
  // "Not enough time for the others, enough for this one." Past ~15 it stops
  // being the short option and starts competing with the rest day.
  const mins = routineMs(knees) / 60_000;
  assert.ok(mins >= 9 && mins <= 15, `knees is ${mins} min, outside 9–15`);
});

test('the cool-down covers the areas grappling actually taxes', () => {
  const all = postClass.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['hip', 'hamstring', 'quad', 'glute', 'adductor', 'shoulder',
    'neck', 'spine', 'wrist', 'ankle', 'thoracic']) {
    assert.ok(all.includes(area), `nothing in the cool-down targets the ${area}s`);
  }
});

/**
 * The shoulder, in the direction that actually shortens.
 *
 * The test above passed for eleven versions while the front of the shoulder was
 * untouched, because naming "shoulder" twice satisfied it — and both of those
 * were the *back* (thread the needle, child's pose). Grip fighting, framing,
 * posting and being stacked all pull you into internal rotation, so the routine
 * was diligently opening the side that was already long. Asking for a word is
 * not asking for coverage; these two ask for the direction.
 */
test('the cool-down opens the front of the shoulder, not only the back', () => {
  const all = postClass.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  assert.ok(/chest|pec/.test(all), 'nothing in the cool-down opens the chest');
  assert.ok(all.includes('front of shoulder'),
    'nothing in the cool-down targets the front of the shoulder');
  // Sphinx names "chest" but is a thoracic press-up, so it must not be the only
  // thing carrying this — the point is a hold whose whole job is the chest.
  const chestItems = postClass.items.filter(s => /chest|pec/.test(s.targets.toLowerCase()));
  assert.ok(chestItems.some(s => s.id !== 'sphinx' && s.id !== 'supine-twist'),
    'only sphinx and the twist mention the chest, and neither is a chest stretch');
});

/** Gripping shortens both sides of the forearm; only one was being opened. */
test('the cool-down stretches both sides of the forearm', () => {
  const targets = postClass.items.map(s => s.targets.toLowerCase());
  assert.ok(targets.some(t => t.includes('flexor')), 'nothing opens the forearm flexors');
  assert.ok(targets.some(t => t.includes('extensor')), 'nothing opens the forearm extensors');
});

test('the rest-day session loads the end of the range, not just the neck', () => {
  const all = restDay.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['adductor', 'hamstring', 'glute', 'hip', 'shoulder', 'neck', 'thoracic']) {
    assert.ok(all.includes(area), `nothing in the rest-day session targets the ${area}s`);
  }
});

test('pilates trains the things jiu jitsu does not', () => {
  // The argument for the routine existing, pinned so trimming it cannot
  // quietly drop the half that justifies it: trunk flexion and rotation, the
  // extension that hours under side control never gives you, lateral hip work,
  // and segmental control of the spine itself.
  const all = pilates.items.map(s => `${s.name} ${s.targets}`).join(' ').toLowerCase();
  for (const area of ['abdominal', 'oblique', 'back extensor', 'hip', 'glute',
    'spine', 'neck', 'hamstring', 'shoulder', 'rib']) {
    assert.ok(all.includes(area), `nothing in pilates targets the ${area}s`);
  }
  // The two movements the whole method rests on. Lose either and it is just
  // floor exercises: lateral breathing is the technique, and the roll-up is
  // the one that transfers directly to coming up off your back in guard.
  const ids = pilates.items.map(i => i.id);
  for (const id of ['pil-breathing', 'pil-roll-up']) {
    assert.ok(ids.includes(id), `pilates has lost ${id}`);
  }
});

test('pilates flows: no rest phase, and its set-up runs work only', () => {
  assert.equal(pilates.phases.rest, 0, 'mat work does not stop to rest between movements');
  const prep = pilates.items.filter(i => i.warmup);
  assert.equal(prep.length, 3, 'the set-up is the three preparation movements');
  for (const item of prep) {
    const { ready, work, rest } = phasesFor(pilates, item);
    assert.equal(ready, 0, `${item.id} counts down into a movement that needs no setup`);
    assert.equal(rest, 0, `${item.id} rests`);
    assert.equal(work, pilates.phases.work);
  }
  // And its own word for that section, since "warm-up" is not what breathing
  // and pelvic tilts are.
  assert.equal(pilates.warmupLabel, 'Set up');
});

test('every pilates movement is awaiting art and audio, and says so', () => {
  // Shipped without either, on purpose. Both absences are silent by design —
  // stretchFigure returns null, a missing clip 404s and is swallowed — so the
  // only thing standing between "deliberate" and "broken" is that they are
  // declared. Delete these ids from both sets as the assets land.
  for (const item of pilates.items) {
    assert.ok(PENDING_ART.has(item.id), `${item.id} is not declared as awaiting artwork`);
    assert.ok(PENDING_CUES.has(item.id), `${item.id} is not declared as awaiting audio`);
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
  // Asked for as 10–15 minutes and built at 14:00. v67 bought the front of the
  // shoulder for two more minutes, which was the user's call — the ceiling
  // moved once, on purpose, and 17 is still the line past which this stops
  // being something you will actually do after a class.
  const cool = routineMs(postClass) / 60_000;
  assert.ok(cool >= 10 && cool <= 17, `cool-down is ${cool} min, outside 10–17`);
  const rest = routineMs(restDay) / 60_000;
  assert.ok(rest >= 15 && rest <= 26, `rest day is ${rest} min, outside 15–26`);
  // Pilates was specified as "a 30 minute session". A routine that quietly
  // becomes 40 is a different promise, and the number is on the intro screen.
  const pil = routineMs(pilates) / 60_000;
  assert.ok(pil >= 27 && pil <= 31, `pilates is ${pil} min, outside 27–31`);
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
  //
  // A movement may be silent *on purpose* — a routine shipped before its audio
  // is recorded — but only if it says so in PENDING_CUES. That is the whole
  // point of the set: a deliberate silence is written down, an accidental one
  // fails here.
  const spoken = [
    ...ROUTINES.flatMap(r => r.items.map(i => i.id)),
    ...EXERCISES.map(e => e.id),
    ...WARM_UP.map(w => w.cue).filter(Boolean),
  ].filter(id => !PENDING_CUES.has(id));
  for (const [voice, ids] of Object.entries(swCues())) {
    for (const id of spoken) {
      assert.ok(ids.includes(id), `${voice} cannot say "${id}" — it is silent on that movement`);
    }
  }
});

test('a pending cue is one that genuinely has no recording', () => {
  // The mirror of PENDING_ART's "never both" rule. An id left on this list
  // after its clip lands would keep the real guard above switched off for that
  // movement forever — which is how a cue goes missing in one voice and not the
  // other, the hardest kind of gap to notice.
  const voices = Object.entries(swCues());
  for (const id of PENDING_CUES) {
    for (const [voice, ids] of voices) {
      assert.ok(!ids.includes(id),
        `${voice}/${id}.webm exists — take "${id}" off PENDING_CUES`);
    }
  }
  // And nothing may be pending that no routine or lift actually asks for.
  const known = new Set([
    ...ROUTINES.flatMap(r => r.items.map(i => i.id)),
    ...EXERCISES.map(e => e.id),
    ...WARM_UP.map(w => w.cue).filter(Boolean),
  ]);
  for (const id of PENDING_CUES) {
    assert.ok(known.has(id), `PENDING_CUES lists "${id}", which nothing in the app speaks`);
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
