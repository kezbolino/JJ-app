// The strength programme and its progression engine.
//
// **Why this exists at all.** The user lifts once a week. Once a week means he
// will not remember what he did last time, so a module that only records
// numbers has failed — a notes app does that. The whole value is here, in
// `programmeState()`: replay the log, and the app can say exactly what to do
// today without anybody having to think.
//
// **Why it is not the stretch engine.** The two routines in js/stretches.js are
// timelines: every segment is the same length, the current one is a division
// over elapsed milliseconds, and nothing is written down. A lift is the
// opposite — self-paced, and the numbers are the point. Sharing an engine
// between them would mean bending one of the two out of shape. They share a
// section (Off mat) and a beeper, and nothing else.
//
// **The progression problem.** Standard workout apps progress by adding weight.
// There is no weight here: a pull-up bar and a floor. So progression climbs a
// four-step ladder per exercise instead:
//
//   1. add reps, up to a ceiling
//   2. slow the lowering — 3 seconds, then 5
//   3. add a 2-second pause at the bottom
//   4. change to a harder variation, and start again at step 1
//
// An exercise sitting at step 3, 5 seconds down, at its rep ceiling, with no
// harder bodyweight variation left has genuinely run out of road. That is what
// `needsLoad` means, and surfacing it is the difference between the programme
// stalling loudly and stalling silently.
//
// Everything below is pure: no DOM, no storage, no clock. It is the only part
// of this module worth unit-testing, and tests/strength.test.mjs does.
//
// General guidance, not a coach. Nothing here knows anything about your body.

/** Reps added per advance. Holds move in seconds, so they move in fives. */
const REP_STEP = 1;
const HOLD_STEP = 5;

/**
 * The eight movements, in the order they are done: hardest first, while you
 * are freshest. `variations` is the chain from easiest to hardest and `start`
 * says which one the programme begins on — he is not starting at the bottom of
 * every chain, and pretending otherwise would waste months.
 *
 * `needsLoad` on a variation marks the point where bodyweight runs out. The
 * engine will never move you onto one of those on its own; it flags the
 * exercise instead, because "put on a weight vest" is a decision, not a rep.
 */
export const EXERCISES = [
  {
    id: 'pull-up',
    name: 'Pull-ups',
    category: 'pull',
    sets: 5,
    startReps: 6,
    repCeiling: 8,
    restSec: 120,
    // The programme starts these with a slow lowering already, so they start
    // partway up the ladder rather than at step 1.
    startStep: 2,
    startEccentric: 3,
    cue: 'Full hang at the bottom, chest to the bar, no kipping.',
    variations: [
      { id: 'pull-up-negative', name: 'Negatives' },
      { id: 'pull-up-strict', name: 'Strict pull-ups' },
      { id: 'pull-up-archer', name: 'Archer pull-ups' },
      { id: 'pull-up-weighted', name: 'Weighted pull-ups', needsLoad: true },
    ],
    start: 1,
  },
  {
    id: 'split-squat',
    name: 'Bulgarian split squat',
    category: 'legs',
    sets: 4,
    startReps: 10,
    repCeiling: 12,
    restSec: 120,
    unilateral: true,
    cue: 'Back foot on the chair, front shin upright, knee tracks over the toes.',
    variations: [
      { id: 'split-squat-bw', name: 'Bodyweight' },
      { id: 'split-squat-paused', name: 'Paused' },
      { id: 'split-squat-loaded', name: 'Loaded', needsLoad: true },
    ],
    start: 0,
  },
  {
    id: 'archer-press-up',
    name: 'Archer press-ups',
    category: 'push',
    sets: 4,
    startReps: 6,
    repCeiling: 10,
    restSec: 120,
    unilateral: true,
    cue: 'Weight over the bending arm, the other stays straight. Hips level.',
    variations: [
      { id: 'press-up-standard', name: 'Standard press-ups' },
      { id: 'press-up-elevated', name: 'Feet-elevated press-ups' },
      { id: 'press-up-archer', name: 'Archer press-ups' },
      { id: 'press-up-one-arm', name: 'One-arm progression' },
    ],
    start: 2,
  },
  {
    id: 'inverted-row',
    name: 'Inverted rows',
    category: 'pull',
    sets: 4,
    startReps: 12,
    repCeiling: 15,
    restSec: 120,
    cue: 'Body in one line, pull the chest to the bar, pause a beat at the top.',
    variations: [
      { id: 'row-floor', name: 'Feet on the floor' },
      { id: 'row-elevated', name: 'Feet elevated' },
      { id: 'row-archer', name: 'Archer rows' },
    ],
    start: 1,
  },
  {
    id: 'nordic-curl',
    name: 'Nordic curl negatives',
    category: 'posterior',
    sets: 4,
    startReps: 4,
    repCeiling: 6,
    restSec: 120,
    cue: 'Ankles anchored, hips locked out. Lower as slowly as you can, catch with the hands.',
    variations: [
      { id: 'nordic-assisted', name: 'Partial, hand assisted' },
      { id: 'nordic-negative', name: 'Full negative' },
      { id: 'nordic-slow', name: 'Slow negative' },
    ],
    start: 1,
  },
  {
    id: 'pike-press-up',
    name: 'Pike press-ups',
    category: 'push',
    sets: 3,
    startReps: 10,
    repCeiling: 12,
    restSec: 90,
    cue: 'Hips high, head between the hands, crown to the floor.',
    variations: [
      { id: 'pike-floor', name: 'Floor pike' },
      { id: 'pike-elevated', name: 'Feet elevated' },
      { id: 'pike-wall-handstand', name: 'Wall handstand' },
    ],
    start: 1,
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging leg raises',
    category: 'core',
    sets: 3,
    startReps: 10,
    repCeiling: 12,
    restSec: 90,
    cue: 'No swing. Curl the pelvis up rather than just lifting the legs.',
    variations: [{ id: 'hanging-leg-raise', name: 'Hanging leg raises' }],
    start: 0,
  },
  {
    id: 'hollow-hold',
    name: 'Hollow body hold',
    category: 'core',
    sets: 3,
    isHold: true,
    startReps: 45,        // seconds, for a hold
    repCeiling: 60,
    restSec: 90,
    cue: 'Low back flat on the floor. Lower the arms and legs until it is nearly breaking.',
    variations: [{ id: 'hollow-hold', name: 'Hollow body hold' }],
    start: 0,
  },
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

/**
 * The warm-up, run before exercise 1.
 *
 * These are the five from the programme brief, and the list is better than a
 * generic one because the last three **rehearse the session's own patterns** —
 * you squat before you split squat, press before you archer press, and hang
 * before you pull. The first two just move blood.
 *
 * Deliberately *not* the rest-day routine's warm-up. That one exists to get you
 * warm before loading end-range mobility cold, so it is marching and swinging;
 * this one exists to get you ready to pull your bodyweight off a bar. Porting
 * one to the other would leave you warm and still cold on the exact joints
 * about to do the work.
 *
 * Untimed and self-paced, like everything else on this screen — tap each one
 * off. It is a checklist, not a routine: giving it a clock would make it the
 * stretch engine, and this session is a form.
 */
export const WARM_UP = [
  { id: 'wu-arm-circles', name: 'Arm circles', dose: '20 forward, 20 back' },
  { id: 'wu-leg-swings', name: 'Leg swings', dose: '10 each leg, each way' },
  { id: 'wu-squats', name: 'Bodyweight squats', dose: '10 reps, full depth' },
  { id: 'wu-press-ups', name: 'Press-ups', dose: '10 reps' },
  { id: 'wu-dead-hang', name: 'Dead hang', dose: '20–30 seconds' },
];

/** How many sessions between deload prompts. */
export const DELOAD_EVERY = 7;

const unit = ex => (ex.isHold ? 'seconds' : 'reps');
const stepFor = ex => (ex.isHold ? HOLD_STEP : REP_STEP);

/** Where an exercise sits before anything has been logged against it. */
export function startingState(ex) {
  return {
    exerciseId: ex.id,
    variation: ex.start ?? 0,
    step: ex.startStep ?? 1,
    sets: ex.sets,
    reps: ex.startReps,
    eccentricSec: ex.startEccentric ?? 0,
    pauseSec: 0,
    needsLoad: false,
    missStreak: 0,
  };
}

/** The variation this state is on. */
export const variationOf = (state, ex) =>
  ex.variations[Math.min(state.variation, ex.variations.length - 1)];

/**
 * Move up. Reps first, always — the ladder step only changes once the rep
 * ceiling is reached, and reaching it resets the reps so the new, harder
 * version starts from a number you can actually hit.
 *
 * A hold has no lowering phase and no bottom to pause at, so steps 2 and 3 are
 * meaningless for one: it adds seconds until the ceiling and is then out of
 * road. Saying so is more honest than inventing a tempo for an isometric.
 */
export function advance(state, ex) {
  const next = { ...state, missStreak: 0 };
  if (next.reps < ex.repCeiling) {
    next.reps = Math.min(ex.repCeiling, next.reps + stepFor(ex));
    return next;
  }

  if (ex.isHold) return { ...next, needsLoad: true };

  if (next.step === 1) {
    return { ...next, step: 2, eccentricSec: 3, reps: ex.startReps };
  }
  if (next.step === 2 && next.eccentricSec < 5) {
    return { ...next, eccentricSec: 5, reps: ex.startReps };
  }
  if (next.step === 2) {
    return { ...next, step: 3, pauseSec: 2, reps: ex.startReps };
  }

  // Step 3 at the ceiling with a 5-second lowering: the ladder is spent.
  const harder = ex.variations[next.variation + 1];
  if (harder && !harder.needsLoad) {
    return {
      ...next, variation: next.variation + 1, step: 1,
      eccentricSec: 0, pauseSec: 0, reps: ex.startReps, needsLoad: false,
    };
  }
  // Either there is no harder version, or the only one left needs weight.
  // Hold the prescription and say so, rather than silently stalling.
  return { ...next, step: 4, needsLoad: true };
}

/** Move down. The mirror of advance: reps first, then the ladder, then back
 * to the easier variation. Regressing always clears `needsLoad` — you are no
 * longer at the top of the chain, so the vest prompt no longer applies. */
export function regress(state, ex) {
  const next = { ...state, missStreak: 0, needsLoad: false };
  if (next.reps > ex.startReps) {
    next.reps = Math.max(ex.startReps, next.reps - stepFor(ex));
    return next;
  }
  if (ex.isHold) return next;

  if (next.step >= 3) {
    return { ...next, step: 2, pauseSec: 0, eccentricSec: 5, reps: ex.repCeiling };
  }
  if (next.step === 2 && next.eccentricSec > 3) {
    return { ...next, eccentricSec: 3, reps: ex.repCeiling };
  }
  if (next.step === 2) {
    return { ...next, step: 1, eccentricSec: 0, reps: ex.repCeiling };
  }
  if (next.variation > 0) {
    return {
      ...next, variation: next.variation - 1, step: ex.startStep ?? 1,
      eccentricSec: ex.startEccentric ?? 0, pauseSec: 0, reps: ex.startReps,
    };
  }
  return next;   // already at the bottom of the programme: nowhere to go
}

/**
 * How one exercise went, from the sets that were logged against it.
 *
 * A set counts as hit only if it reached the target *and* the tempo held —
 * twelve fast reps are not twelve slow ones, and the whole ladder is built on
 * that distinction.
 */
export function exerciseOutcome(state, logged) {
  const sets = (logged?.sets ?? []).filter(s => s.completed);
  const hit = sets.filter(s => (s.reps ?? 0) >= state.reps && s.tempoHeld !== false).length;
  const missed = state.sets - hit;
  if (missed <= 0) return 'hit';
  if (missed >= 2) return 'miss';
  return 'short';    // one set down: hold the prescription, don't count it as a miss
}

/**
 * Apply one session's result to one exercise.
 *
 * Two missed sets is a bad session; two bad sessions in a row is a
 * prescription that is too hard, and only then does it come back down. One bad
 * week is a bad week — everyone has them, and a programme that regresses on
 * every one of them never goes anywhere.
 */
export function applyResult(state, logged, ex) {
  const outcome = exerciseOutcome(state, logged);
  if (outcome === 'hit') return advance(state, ex);
  if (outcome === 'short') return { ...state, missStreak: 0 };
  if (state.missStreak >= 1) return regress(state, ex);
  return { ...state, missStreak: state.missStreak + 1 };
}

/**
 * Replay the whole log to work out where every exercise now stands.
 *
 * Derived rather than stored, deliberately. A stored counter drifts the moment
 * anything is edited or deleted, and drift in this particular number is
 * invisible — you would just be told to do the wrong thing forever. Replaying
 * 50-odd sessions costs nothing.
 */
export function programmeState(sessions = []) {
  const state = {};
  for (const ex of EXERCISES) state[ex.id] = startingState(ex);

  const ordered = [...sessions].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  for (const session of ordered) {
    // A deload is a week off at half volume. It is not a test of anything, so
    // it moves nothing in either direction.
    if (session.deload) continue;
    for (const logged of session.exercises ?? []) {
      const ex = EXERCISE_BY_ID[logged.exerciseId];
      if (!ex || logged.skipped) continue;      // muted while something was sore
      state[ex.id] = applyResult(state[ex.id], logged, ex);
    }
  }
  return state;
}

/** What to actually do today, per exercise, in the order they are done. */
export function todaysPlan(sessions = [], { deload = false, muted = [] } = {}) {
  const state = programmeState(sessions);
  const last = lastSessionFor(sessions);
  return EXERCISES.map(ex => {
    const s = state[ex.id];
    const sets = deload ? Math.max(1, Math.round(s.sets / 2)) : s.sets;
    return {
      exercise: ex,
      state: s,
      variation: variationOf(s, ex),
      sets,
      reps: s.reps,
      isHold: Boolean(ex.isHold),
      unit: unit(ex),
      eccentricSec: s.eccentricSec,
      pauseSec: s.pauseSec,
      needsLoad: s.needsLoad,
      muted: muted.includes(ex.id),
      last: last?.exercises?.find(e => e.exerciseId === ex.id) ?? null,
    };
  });
}

/** The most recent completed session, or null. */
export function lastSessionFor(sessions = []) {
  const ordered = [...sessions].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  return ordered[ordered.length - 1] ?? null;
}

/**
 * Is a deload due? Every seventh completed session, and only offered — the
 * spec is explicit that it must not be forced, and a deload you did not want
 * is just a wasted week.
 */
export function isDeloadDue(sessions = []) {
  const done = sessions.length;
  if (!done || done % DELOAD_EVERY !== 0) return false;
  return !lastSessionFor(sessions)?.deload;
}

/** "5 × 6 · 3s down · 2s pause" — one line, the whole prescription. */
export function prescriptionLine(plan) {
  const target = plan.isHold ? `${plan.reps}s` : String(plan.reps);
  const bits = [`${plan.sets} × ${target}`];
  if (plan.exercise.unilateral) bits[0] += ' each side';
  if (plan.eccentricSec) bits.push(`${plan.eccentricSec}s down`);
  if (plan.pauseSec) bits.push(`${plan.pauseSec}s pause`);
  return bits.join(' · ');
}

/** "6, 6, 6, 5, 5" — what was actually done last time, for reference. */
export function lastLine(logged, ex) {
  const sets = (logged?.sets ?? []).filter(s => s.completed);
  if (!sets.length) return null;
  const suffix = ex?.isHold ? 's' : '';
  return sets.map(s => `${s.reps}${suffix}`).join(', ');
}

/** Every session that touched an exercise, newest first — the history view. */
export function historyFor(sessions, exerciseId) {
  return [...sessions]
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
    .map(session => ({
      session,
      logged: (session.exercises ?? []).find(e => e.exerciseId === exerciseId) ?? null,
    }))
    .filter(row => row.logged && !row.logged.skipped);
}

/**
 * A blank session, ready to be filled in. Targets are frozen onto it at the
 * moment it starts: what you were asked to do that day is part of the record,
 * and re-deriving it later from a log that has since moved on would rewrite
 * history.
 */
export function newStrengthSession(date, sessions = [], { deload = false, muted = [] } = {}) {
  return {
    id: `sx-${date}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    deload,
    // Ticked off as you go. Deliberately outside `exercises`, so it can never
    // reach the progression engine — a warm-up is not a set and must not move
    // a prescription in either direction.
    warmup: WARM_UP.map(w => ({ id: w.id, done: false })),
    exercises: todaysPlan(sessions, { deload, muted }).map(plan => ({
      exerciseId: plan.exercise.id,
      variationId: plan.variation.id,
      target: {
        sets: plan.sets, reps: plan.reps,
        eccentricSec: plan.eccentricSec, pauseSec: plan.pauseSec,
      },
      skipped: plan.muted,
      sets: Array.from({ length: plan.sets }, () => ({
        reps: plan.reps, tempoHeld: true, completed: false,
      })),
      note: '',
    })),
  };
}

/** How much of a started session is done — for the progress rail. */
export function sessionProgress(session) {
  let done = 0, total = 0;
  for (const logged of session?.exercises ?? []) {
    if (logged.skipped) continue;
    total += logged.sets.length;
    done += logged.sets.filter(s => s.completed).length;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * What changed for next time — the summary shown after saving.
 *
 * This is the payoff of the whole module: proof the numbers moved, which with
 * bodyweight progression very rarely *feels* true.
 */
export function sessionChanges(sessionsBefore, session) {
  const before = programmeState(sessionsBefore);
  const after = programmeState([...sessionsBefore, session]);
  const out = [];
  for (const ex of EXERCISES) {
    const a = before[ex.id], b = after[ex.id];
    if (!a || !b) continue;
    let change = null;
    if (b.variation > a.variation) change = `moved up to ${variationOf(b, ex).name.toLowerCase()}`;
    else if (b.variation < a.variation) change = `stepped back to ${variationOf(b, ex).name.toLowerCase()}`;
    else if (b.needsLoad && !a.needsLoad) change = 'is out of bodyweight road — it needs added weight';
    else if (b.pauseSec > a.pauseSec) change = `adds a ${b.pauseSec}s pause`;
    else if (b.eccentricSec > a.eccentricSec) change = `slows to ${b.eccentricSec}s down`;
    else if (b.eccentricSec < a.eccentricSec) change = `eases to ${b.eccentricSec}s down`;
    else if (b.reps > a.reps) change = `goes to ${b.reps}${ex.isHold ? 's' : ' reps'}`;
    else if (b.reps < a.reps) change = `drops to ${b.reps}${ex.isHold ? 's' : ' reps'}`;
    if (change) out.push({ exercise: ex, change });
  }
  return out;
}

/** mm:ss for the rest timer. */
export function restClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
