// The strength progression engine — pure node, no browser.
//
//   node tests/strength.test.mjs
//
// This is the only genuinely non-trivial part of the strength module, and it is
// the part that fails *silently* if it is wrong: a bad rule doesn't crash, it
// just tells you to do the wrong thing forever, once a week, and you would have
// no way of knowing. Everything else in that module is a form.

import assert from 'node:assert/strict';
import {
  EXERCISES, EXERCISE_BY_ID, DELOAD_EVERY,
  startingState, advance, regress, applyResult, exerciseOutcome,
  programmeState, todaysPlan, isDeloadDue, prescriptionLine, lastLine,
  newStrengthSession, sessionProgress, sessionChanges, historyFor, variationOf,
  WARM_UP,
  restClock,
} from '../js/strength.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const pullUp = EXERCISE_BY_ID['pull-up'];
const hollow = EXERCISE_BY_ID['hollow-hold'];
const legRaise = EXERCISE_BY_ID['hanging-leg-raise'];

/** One session where every set of every exercise hit its target. */
const perfectSession = (date, sessions = [], opts = {}) => {
  const session = newStrengthSession(date, sessions, opts);
  session.id = `sx-${date}`;                 // deterministic, so ordering is stable
  for (const logged of session.exercises) {
    for (const set of logged.sets) { set.completed = true; set.tempoHeld = true; }
  }
  return session;
};

/** One session where `missing` sets of every exercise were not hit. */
const badSession = (date, sessions = [], missing = 2) => {
  const session = perfectSession(date, sessions);
  for (const logged of session.exercises) {
    for (const set of logged.sets.slice(0, missing)) set.reps = Math.max(0, set.reps - 2);
  }
  return session;
};

// ---- the programme itself -------------------------------------------------

test('every movement is complete and uniquely identified', () => {
  assert.ok(EXERCISES.length >= 8, 'the programme lost movements');
  const ids = new Set();
  for (const ex of EXERCISES) {
    assert.ok(ex.id && !ids.has(ex.id), `duplicate or missing id: ${ex.id}`);
    ids.add(ex.id);
    assert.ok(ex.name, `${ex.id} has no name`);
    assert.ok(ex.cue && ex.cue.length > 20, `${ex.id} has no usable form cue`);
    assert.ok(ex.sets > 0 && ex.startReps > 0, `${ex.id} has no starting prescription`);
    assert.ok(ex.repCeiling >= ex.startReps, `${ex.id} starts above its own ceiling`);
    assert.ok(ex.restSec > 0, `${ex.id} says nothing about rest`);
    assert.ok(ex.variations.length >= 1, `${ex.id} has no variation chain`);
    assert.ok(ex.start < ex.variations.length, `${ex.id} starts outside its own chain`);
  }
});

test('the programme starts where the spec says it does', () => {
  const s = startingState(pullUp);
  assert.equal(s.sets, 5);
  assert.equal(s.reps, 6);
  assert.equal(s.eccentricSec, 3, 'pull-ups start with a slow lowering already');
  assert.equal(variationOf(s, pullUp).name, 'Strict pull-ups');
  assert.equal(prescriptionLine(todaysPlan([])[0]), '5 × 6 · 3s down');
});

test('a unilateral movement says "each side" in its prescription', () => {
  const plan = todaysPlan([]).find(p => p.exercise.id === 'split-squat');
  assert.match(prescriptionLine(plan), /each side/);
});

// ---- the ladder -----------------------------------------------------------

test('advancing adds reps until the ceiling, then climbs the ladder', () => {
  let s = startingState(pullUp);           // 6 reps, ceiling 8, step 2, 3s down
  s = advance(s, pullUp);
  assert.equal(s.reps, 7);
  s = advance(s, pullUp);
  assert.equal(s.reps, 8, 'should sit at the ceiling');
  // At the ceiling with a 3s lowering: slow it to 5s and start the reps again.
  s = advance(s, pullUp);
  assert.equal(s.eccentricSec, 5);
  assert.equal(s.reps, 6, 'reps reset to the starting number for the new step');
});

test('the ladder runs reps → 5s eccentric → 2s pause → harder variation', () => {
  let s = startingState(pullUp);
  const seen = [];
  for (let i = 0; i < 40; i++) { seen.push(s); s = advance(s, pullUp); }

  const firstFive = seen.findIndex(x => x.eccentricSec === 5);
  const firstPause = seen.findIndex(x => x.pauseSec === 2);
  const firstArcher = seen.findIndex(x => variationOf(x, pullUp).id === 'pull-up-archer');

  assert.ok(firstFive > 0, 'the eccentric never slowed to 5 seconds');
  assert.ok(firstPause > firstFive, 'the pause arrived before the eccentric was maxed out');
  assert.ok(firstArcher > firstPause, 'the harder variation arrived before the pause was maxed out');
  // And nothing skips a rung: every step change is preceded by the ceiling.
  assert.equal(seen[firstFive - 1].reps, pullUp.repCeiling);
  assert.equal(seen[firstPause - 1].reps, pullUp.repCeiling);
  assert.equal(seen[firstArcher - 1].reps, pullUp.repCeiling);
});

test('a new variation resets the tempo as well as the reps', () => {
  let s = startingState(pullUp);
  while (variationOf(s, pullUp).id !== 'pull-up-archer') s = advance(s, pullUp);
  assert.equal(s.step, 1);
  assert.equal(s.eccentricSec, 0);
  assert.equal(s.pauseSec, 0);
  assert.equal(s.reps, pullUp.startReps);
  assert.equal(s.needsLoad, false);
});

test('when only a weighted variation is left, the app says so instead of stalling', () => {
  // This is acceptance criterion 4: pull-ups must not silently stop moving.
  let s = startingState(pullUp);
  for (let i = 0; i < 200 && !s.needsLoad; i++) s = advance(s, pullUp);
  assert.equal(s.needsLoad, true, 'pull-ups never reported needing added weight');
  assert.equal(variationOf(s, pullUp).id, 'pull-up-archer',
    'the engine moved itself onto a variation that requires weight');
  // And it holds there — no infinite climb into an imaginary variation.
  const held = advance(s, pullUp);
  assert.equal(held.reps, s.reps);
  assert.equal(variationOf(held, pullUp).id, 'pull-up-archer');
});

test('a hold adds seconds and has no eccentric or pause to climb', () => {
  let s = startingState(hollow);          // 45s, ceiling 60s
  s = advance(s, hollow);
  assert.equal(s.reps, 50);
  s = advance(s, hollow); s = advance(s, hollow);
  assert.equal(s.reps, 60, 'holds move in fives up to the ceiling');
  s = advance(s, hollow);
  assert.equal(s.eccentricSec, 0, 'invented a lowering phase for an isometric');
  assert.equal(s.needsLoad, true, 'a maxed hold should ask for load, not a fake tempo');
});

test('an exercise with a single-item chain runs out of road honestly', () => {
  let s = startingState(legRaise);
  for (let i = 0; i < 200 && !s.needsLoad; i++) s = advance(s, legRaise);
  assert.equal(s.needsLoad, true);
  assert.equal(variationOf(s, legRaise).id, 'hanging-leg-raise');
});

// ---- reading a session ----------------------------------------------------

test('a set only counts as hit if the reps AND the tempo held', () => {
  const s = { ...startingState(pullUp), sets: 2, reps: 6 };
  const done = (reps, tempoHeld) => ({ reps, tempoHeld, completed: true });
  assert.equal(exerciseOutcome(s, { sets: [done(6, true), done(6, true)] }), 'hit');
  assert.equal(exerciseOutcome(s, { sets: [done(6, true), done(6, false)] }), 'short');
  assert.equal(exerciseOutcome(s, { sets: [done(6, false), done(5, true)] }), 'miss');
  assert.equal(exerciseOutcome(s, { sets: [done(9, true), done(9, true)] }), 'hit',
    'beating the target is still hitting it');
  assert.equal(exerciseOutcome(s, { sets: [] }), 'miss', 'an untouched exercise is not a pass');
});

test('one bad session holds; two in a row regress', () => {
  const ex = pullUp;
  const miss = { sets: [] };            // nothing logged: two or more missed
  let s = startingState(ex);
  s = advance(s, ex);                   // 7 reps, so there is somewhere to fall to
  assert.equal(s.reps, 7);

  s = applyResult(s, miss, ex);
  assert.equal(s.reps, 7, 'one bad session should not move anything');
  assert.equal(s.missStreak, 1);

  s = applyResult(s, miss, ex);
  assert.equal(s.reps, 6, 'two bad sessions in a row should drop a rep');
  assert.equal(s.missStreak, 0, 'the streak resets once it has been acted on');
});

test('a single dropped set never counts towards a regression', () => {
  const ex = pullUp;
  const short = { sets: [
    { reps: 6, tempoHeld: true, completed: true },
    { reps: 6, tempoHeld: true, completed: true },
    { reps: 6, tempoHeld: true, completed: true },
    { reps: 6, tempoHeld: true, completed: true },
    { reps: 3, tempoHeld: true, completed: true },
  ] };
  let s = startingState(ex);
  s = applyResult(s, short, ex);
  s = applyResult(s, short, ex);
  s = applyResult(s, short, ex);
  assert.equal(s.reps, 6, 'a near-miss week should hold, not advance');
  assert.equal(s.missStreak, 0, 'a near-miss should not accumulate towards a regression');
});

test('regressing steps back down the ladder once the reps are at the floor', () => {
  const ex = pullUp;
  let s = { ...startingState(ex), eccentricSec: 5, reps: ex.startReps };
  s = regress(s, ex);
  assert.equal(s.eccentricSec, 3, 'should ease the tempo before anything else');
  assert.equal(s.reps, ex.repCeiling, 'the easier tempo comes with the reps it was left at');
  assert.equal(s.needsLoad, false);
});

test('regressing clears the needs-weight flag', () => {
  let s = startingState(pullUp);
  for (let i = 0; i < 200 && !s.needsLoad; i++) s = advance(s, pullUp);
  assert.equal(s.needsLoad, true);
  assert.equal(regress(s, pullUp).needsLoad, false);
});

// ---- replaying the log ----------------------------------------------------

test('the programme state is replayed from the log, in date order', () => {
  const a = perfectSession('2026-08-05');
  const b = perfectSession('2026-08-12', [a]);
  // Deliberately out of order: the engine must sort, not trust the array.
  const state = programmeState([b, a]);
  assert.equal(state['pull-up'].reps, 8, 'two clean sessions should be two reps up');
});

test('a muted exercise moves nothing, and neither does a deload', () => {
  const first = perfectSession('2026-08-05');
  const muted = perfectSession('2026-08-12', [first]);
  muted.exercises.find(e => e.exerciseId === 'pull-up').skipped = true;
  const deload = perfectSession('2026-08-19', [first, muted]);
  deload.deload = true;

  const state = programmeState([first, muted, deload]);
  assert.equal(state['pull-up'].reps, 7, 'a muted or deloaded exercise should not progress');
  assert.equal(state['inverted-row'].reps, 14,
    'the other movements should still have moved on the two non-deload sessions');
});

test("today's plan carries last session's numbers alongside the target", () => {
  const clean = perfectSession('2026-08-05');
  const advanced = todaysPlan([clean]).find(p => p.exercise.id === 'pull-up');
  assert.equal(advanced.reps, 7, 'the target should have advanced after a clean session');
  assert.equal(lastLine(advanced.last, pullUp), '6, 6, 6, 6, 6');

  // One set short of the target: last time's real numbers are still shown, and
  // the prescription holds where it was rather than climbing off a bad set.
  const short = perfectSession('2026-08-05');
  short.exercises.find(e => e.exerciseId === 'pull-up').sets[4].reps = 5;
  const held = todaysPlan([short]).find(p => p.exercise.id === 'pull-up');
  assert.equal(held.reps, 6, 'a dropped set should not advance the target');
  assert.equal(lastLine(held.last, pullUp), '6, 6, 6, 6, 5');
});

test('a hold reads back in seconds, not bare numbers', () => {
  const first = perfectSession('2026-08-05');
  assert.equal(lastLine(first.exercises.find(e => e.exerciseId === 'hollow-hold'), hollow),
    '45s, 45s, 45s');
});

// ---- deload ---------------------------------------------------------------

test(`a deload is offered every ${DELOAD_EVERY} sessions, and never forced`, () => {
  const sessions = [];
  for (let i = 0; i < DELOAD_EVERY; i++) {
    assert.equal(isDeloadDue(sessions), false, `offered early, after ${i} sessions`);
    sessions.push(perfectSession(`2026-08-${String(i + 3).padStart(2, '0')}`, sessions));
  }
  assert.equal(isDeloadDue(sessions), true, `not offered after ${DELOAD_EVERY} sessions`);

  // Taking it: the deload session itself must not immediately re-prompt.
  const taken = perfectSession('2026-09-01', sessions);
  taken.deload = true;
  assert.equal(isDeloadDue([...sessions, taken]), false);
});

test('a deload runs the same movements at half the sets and the same reps', () => {
  const sessions = [];
  for (let i = 0; i < DELOAD_EVERY; i++) {
    sessions.push(perfectSession(`2026-08-${String(i + 3).padStart(2, '0')}`, sessions));
  }
  const normal = todaysPlan(sessions).find(p => p.exercise.id === 'pull-up');
  const light = todaysPlan(sessions, { deload: true }).find(p => p.exercise.id === 'pull-up');
  assert.equal(light.reps, normal.reps, 'a deload must not change the reps');
  assert.ok(light.sets < normal.sets && light.sets >= 1, 'a deload should halve the sets');
  assert.equal(todaysPlan(sessions, { deload: true }).length, EXERCISES.length,
    'a deload drops no movement');
});

// ---- the session object ---------------------------------------------------

test('a new session freezes the targets it was started with', () => {
  const first = perfectSession('2026-08-05');
  const session = newStrengthSession('2026-08-12', [first]);
  const pull = session.exercises.find(e => e.exerciseId === 'pull-up');
  assert.equal(pull.target.reps, 7);
  assert.equal(pull.sets.length, 5);
  assert.ok(pull.sets.every(s => s.reps === 7 && s.completed === false && s.tempoHeld === true));
  // Later sessions must not rewrite what this one was asked to do.
  const later = programmeState([first, perfectSession('2026-08-12', [first])]);
  assert.equal(later['pull-up'].reps, 8);
  assert.equal(pull.target.reps, 7, 'the frozen target moved when the log did');
});

test('a muted exercise is still in the session, marked skipped', () => {
  const session = newStrengthSession('2026-08-12', [], { muted: ['pull-up'] });
  assert.equal(session.exercises.length, EXERCISES.length);
  assert.equal(session.exercises.find(e => e.exerciseId === 'pull-up').skipped, true);
  assert.equal(sessionProgress(session).total,
    session.exercises.filter(e => !e.skipped).reduce((n, e) => n + e.sets.length, 0),
    'a muted movement should not count towards the session progress');
});

test('progress counts completed sets, ignoring what is muted', () => {
  const session = newStrengthSession('2026-08-12', []);
  const totalSets = EXERCISES.reduce((n, e) => n + e.sets, 0);
  assert.deepEqual(sessionProgress(session), { done: 0, total: totalSets, pct: 0 });
  session.exercises[0].sets.forEach(s => { s.completed = true; });
  assert.equal(sessionProgress(session).done, 5);
});

test('the after-session summary names what actually changed', () => {
  const first = perfectSession('2026-08-05');
  const changes = sessionChanges([], first);
  assert.equal(changes.length, EXERCISES.length,
    'a clean session should move every movement');
  const pull = changes.find(c => c.exercise.id === 'pull-up');
  assert.match(pull.change, /7 reps/);
  const hold = changes.find(c => c.exercise.id === 'hollow-hold');
  assert.match(hold.change, /50s/, 'a hold should be summarised in seconds');

  // A session that changed nothing must say nothing, not invent movement.
  const stalled = newStrengthSession('2026-08-12', [first]);
  assert.deepEqual(sessionChanges([first], stalled), []);
});

test('history lists a movement newest first and leaves out what was muted', () => {
  const a = perfectSession('2026-08-05');
  const b = perfectSession('2026-08-12', [a]);
  b.exercises.find(e => e.exerciseId === 'pull-up').skipped = true;
  const rows = historyFor([a, b], 'pull-up');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session.date, '2026-08-05');
  assert.equal(historyFor([a, b], 'inverted-row').map(r => r.session.date).join(),
    '2026-08-12,2026-08-05');
});

test('a ballistic or held movement skips the tempo rungs and climbs load', () => {
  // Slowing a swing down is not a harder swing, it is a different and worse
  // exercise; a hold has nothing to lower. Both must go reps → load.
  for (const id of ['kb-swing', 'kb-getup', 'hollow-hold']) {
    const ex = EXERCISE_BY_ID[id];
    assert.ok(ex.isHold || ex.noTempo, `${id} should be marked as skipping tempo`);
    let s = startingState(ex);
    for (let i = 0; i < 40; i++) {
      s = advance(s, ex);
      assert.equal(s.eccentricSec, 0, `${id} grew a slow lowering`);
      assert.equal(s.pauseSec, 0, `${id} grew a pause`);
    }
  }
  // And the load rung does work: swings climb through their bells.
  const swing = EXERCISE_BY_ID['kb-swing'];
  let s = startingState(swing);
  const bells = new Set();
  for (let i = 0; i < 40; i++) { bells.add(variationOf(s, swing).name); s = advance(s, swing); }
  assert.ok(bells.size > 1, 'swings never moved onto a heavier bell');
});

test('the kettlebell work covers what the bodyweight eight never did', () => {
  const swing = EXERCISE_BY_ID['kb-swing'];
  const getup = EXERCISE_BY_ID['kb-getup'];
  assert.ok(swing && getup, 'the kettlebell movements are missing');
  // The bells the user actually owns — a variation naming a weight he does not
  // have is a prescription he cannot follow.
  const owned = ['8kg', '10kg', '16kg'];
  for (const ex of [swing, getup]) {
    for (const v of ex.variations) {
      const weight = v.name.match(/\d+kg/)?.[0];
      assert.ok(weight && owned.includes(weight), `${ex.id} names a bell not owned: ${v.name}`);
    }
  }
});

test('the warm-up rehearses the session, and never touches the programme', () => {
  // The last three deliberately mirror the session's own patterns — squat
  // before the split squat, press before the archer press, hang before the
  // pull. A generic warm-up would leave the working joints cold.
  const names = WARM_UP.map(w => w.name.toLowerCase()).join(' ');
  for (const pattern of ['squat', 'press', 'hang']) {
    assert.ok(names.includes(pattern), `nothing in the warm-up rehearses a ${pattern}`);
  }
  for (const w of WARM_UP) {
    assert.ok(w.id && w.name && w.dose, `warm-up item ${w.id} is incomplete`);
  }

  const session = newStrengthSession('2026-08-06', []);
  assert.equal(session.warmup.length, WARM_UP.length);
  assert.ok(session.warmup.every(w => w.done === false), 'a new session starts warmed up');

  // Ticking every box must move nothing: a warm-up is not a set.
  const before = sessionProgress(session);
  session.warmup.forEach(w => { w.done = true; });
  assert.deepEqual(sessionProgress(session), before, 'the warm-up counted towards the session');
  assert.deepEqual(sessionChanges([], session), [],
    'a warm-up-only session moved the programme');
  assert.equal(programmeState([session])['pull-up'].reps, EXERCISE_BY_ID['pull-up'].startReps);
});

test('the rest clock formats mm:ss and never goes negative', () => {
  assert.equal(restClock(120_000), '2:00');
  assert.equal(restClock(9_400), '0:10');
  assert.equal(restClock(0), '0:00');
  assert.equal(restClock(-500), '0:00');
});

console.log(`\n${passed} passed`);
