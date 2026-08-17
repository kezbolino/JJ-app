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
// This one mostly cannot: eight of the ten movements are bodyweight, a pull-up
// bar and a floor. So progression climbs a four-step ladder per exercise
// instead:
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
// **`noTempo` movements skip rungs 2 and 3.** A kettlebell swing is ballistic:
// slowing one down is not a harder swing, it is a different and worse exercise.
// A hold has nothing to lower. Both climb reps and then load, and their
// `variations` are the load — 8kg, 10kg, 16kg — so the ladder keeps working
// with the rung that actually applies.
//
// **Antagonist pairing, added v49.** Ten movements at a full two minutes a set
// is 66 minutes of standing still — 75% of a 93-minute session, which is far
// past what a once-a-week accessory to jiu jitsu is worth. The fix is not
// shorter rests: the ladder only moves when you hit the target reps with the
// tempo held, so under-resting feeds missed reps into the engine and walks the
// prescription *backwards*. Instead `PAIRS` alternates a pull with a push, so
// the rest for one is the work for the other. Each movement still gets its full
// recovery — 60s, plus its partner's set, plus another 60s — and roughly 25
// minutes comes off the clock. See `restBetween()`, which is what makes it
// self-correcting if you ignore the alternation and grind one movement out.
//
// Everything below is pure: no DOM, no storage, no clock. It is the only part
// of this module worth unit-testing, and tests/strength.test.mjs does.
//
// General guidance, not a coach. Nothing here knows anything about your body.

/** Reps added per advance. Holds move in seconds, so they move in fives. */
const REP_STEP = 1;
const HOLD_STEP = 5;

/**
 * The movements, in the order they are done.
 *
 * The order is hardest-first, and from v49 it is also **pair order**: a
 * movement sits immediately next to the one it supersets with, because the
 * blocks are built by walking this array (see `sessionBlocks`). The skill-heavy
 * get-up stays early — it wants a fresh brain — and stays unpaired.
 *
 * `variations` is the chain from easiest to hardest and `start` says which one
 * the programme begins on — he is not starting at the bottom of every chain,
 * and pretending otherwise would waste months.
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
    // Added in v44, when the user turned out to own kettlebells. The most
    // grappling-specific thing you can do with one: getting up off your back
    // under load, slowly, without losing the shoulder. Early in the session
    // because it is a skill before it is a lift, and skills want a fresh brain.
    //
    // Deliberately unpaired: alternating a skill with something else is how you
    // stop paying attention to it.
    id: 'kb-getup',
    name: 'Turkish get-up',
    category: 'core',
    sets: 3,
    startReps: 3,
    repCeiling: 5,
    restSec: 90,
    unilateral: true,
    noTempo: true,
    // A get-up rep is half a minute of standing up and lying back down, not the
    // three seconds every other rep here takes. Without this the estimate on the
    // intro is out by about eight minutes on this movement alone.
    repSec: 30,
    cue: 'Slow. Eyes on the bell the whole way up and the whole way down. Stop the moment the shoulder loses its place.',
    variations: [
      { id: 'getup-8', name: '8kg' },
      { id: 'getup-10', name: '10kg' },
      { id: 'getup-16', name: '16kg' },
    ],
    start: 0,
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
    // Replaced the Nordic curl negative in v49: the user has neither the floor
    // space to fall forward in nor anything to anchor the ankles under, so the
    // movement was simply not being done. This keeps the hamstring loaded at
    // length and adds the balance and grip a Nordic never trained.
    //
    // `noTempo` for a different reason than the swing above. A slow eccentric on
    // an RDL is not wrong — it is the point — but when three bells are sitting
    // on the floor, **load is the honest next rung**. Adding a 2-second pause to
    // an 8kg hinge instead of picking up the 10kg one would take four months to
    // do what a fortnight should, so the ladder climbs reps and then weight and
    // the slow lowering lives in the cue where it belongs.
    id: 'single-leg-rdl',
    name: 'Single-leg Romanian deadlift',
    category: 'posterior',
    sets: 4,
    startReps: 8,
    repCeiling: 12,
    restSec: 120,
    unilateral: true,
    noTempo: true,
    cue: 'Hinge from the hip, back leg straight out behind you as a counterweight. Bell close to the shin, slow down, squeeze the glute at the top. Stop where the back would round.',
    variations: [
      { id: 'rdl-bw', name: 'Bodyweight' },
      { id: 'rdl-8', name: '8kg' },
      { id: 'rdl-10', name: '10kg' },
      { id: 'rdl-16', name: '16kg' },
    ],
    start: 1,
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
  {
    // The other kettlebell addition. Hip-hinge power and grip endurance, which
    // is most of what a scramble is. Last, and unpaired: it is the one movement
    // here that is also conditioning, so it goes at the end where being out of
    // breath costs nothing.
    id: 'kb-swing',
    name: 'Kettlebell swings',
    category: 'posterior',
    sets: 4,
    startReps: 12,
    repCeiling: 20,
    restSec: 90,
    noTempo: true,
    repSec: 1.5,        // ballistic — a swing is a snap, not a grind
    cue: 'Hinge, do not squat. Snap the hips and let the bell float — the arms are ropes, not levers.',
    variations: [
      { id: 'swing-10', name: '10kg, two hands' },
      { id: 'swing-16', name: '16kg, two hands' },
      { id: 'swing-16-single', name: '16kg, one hand' },
    ],
    start: 1,
  },
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

/**
 * Which movements superset with which.
 *
 * Each pair is two things that do not compete for the same muscle, so resting
 * one while working the other costs nothing. Three are a straight pull/push
 * antagonist swap; the fourth pairs a lower-body movement with a core one,
 * which is the same idea by a different route.
 *
 * The get-up and the swings are deliberately absent. The get-up is a skill and
 * alternating it with something else is how you stop paying attention to it;
 * the swings are the conditioning finisher and there is nothing left to pair
 * them with by then.
 *
 * These must stay adjacent in `EXERCISES` — `sessionBlocks` builds the blocks
 * by walking that array in order, and a pair split across the session would
 * mean walking back and forth across the room between every set.
 */
export const PAIRS = [
  ['pull-up', 'archer-press-up'],
  ['split-squat', 'hanging-leg-raise'],
  ['inverted-row', 'pike-press-up'],
  ['single-leg-rdl', 'hollow-hold'],
];

/**
 * Rest between two sets of a superset, in seconds.
 *
 * Deliberately not "half of 120". What matters is the gap between two sets of
 * **the same** movement, and that is this number twice over plus the partner's
 * working set in the middle — 60 + ~30 + 60, so about two and a half minutes,
 * which is more recovery than the unpaired version gave, not less.
 */
export const PAIRED_REST = 60;

/** The partner of an exercise, or null if it works alone. */
export function partnerOf(exerciseId) {
  const pair = PAIRS.find(p => p.includes(exerciseId));
  return pair ? pair.find(id => id !== exerciseId) : null;
}

/**
 * Group a session's movements into the blocks they are actually performed in:
 * either a superset of two, or one movement on its own.
 *
 * Takes anything with an `exerciseId` — a plan or a logged entry — so the intro
 * and the session screen can share it.
 */
export function sessionBlocks(items) {
  const idOf = it => it.exerciseId ?? it.exercise?.id;
  const out = [];
  const used = new Set();
  for (const item of items) {
    const id = idOf(item);
    if (used.has(id)) continue;
    used.add(id);
    const mate = partnerOf(id);
    const other = mate && items.find(i => idOf(i) === mate && !used.has(mate));
    if (other) {
      used.add(mate);
      out.push({ kind: 'pair', items: [item, other] });
    } else {
      out.push({ kind: 'single', items: [item] });
    }
  }
  return out;
}

/**
 * How long to rest after finishing a set of `exerciseId`.
 *
 * The short rest is only correct while you are actually alternating, so this
 * asks rather than assumes: if the partner still has a set waiting, you are
 * about to go and do it, and 60 seconds is right. If it does not — the partner
 * is muted, already finished, or you ignored the alternation and ground the
 * movement out in one block — you get the movement's own full rest, because
 * nothing is going to fill the gap.
 *
 * That is what makes the pairing safe to ignore. Doing it the old way is slower
 * but never under-rested, so it can never quietly feed missed reps into the
 * ladder.
 */
export function restBetween(exerciseId, loggedList) {
  const ex = EXERCISE_BY_ID[exerciseId];
  const full = ex?.restSec ?? 120;
  const mate = partnerOf(exerciseId);
  if (!mate) return full;
  const partner = loggedList.find(l => l.exerciseId === mate);
  if (!partner || partner.skipped) return full;
  return partner.sets.some(s => !s.completed) ? PAIRED_REST : full;
}

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
 * Self-paced, like everything else on this screen — tap each one off. It is a
 * checklist, not a routine: giving the whole thing a clock would make it the
 * stretch engine, and this session is a form. The one exception is `holdSec`,
 * on the dead hang, because "hang for 20–30 seconds" is the one item here you
 * genuinely cannot pace by feel while hanging off a bar.
 *
 * `cue` is the clip in audio/cues/ that names the movement aloud, and four of
 * the five were **already recorded** — three from the rest-day routine's own
 * warm-up and one from its dead hang. Press-ups has no clip and stays silent,
 * which is `createVoice`'s standing contract: a missing clip 404s and the
 * routine carries on rather than breaking over a sound.
 */
export const WARM_UP = [
  { id: 'wu-arm-circles', name: 'Arm circles', dose: '20 forward, 20 back', cue: 'warmup-arm-circle' },
  { id: 'wu-leg-swings', name: 'Leg swings', dose: '10 each leg, each way', cue: 'warmup-leg-swing' },
  { id: 'wu-squats', name: 'Bodyweight squats', dose: '10 reps, full depth', cue: 'warmup-squat' },
  { id: 'wu-press-ups', name: 'Press-ups', dose: '10 reps', cue: null },
  { id: 'wu-dead-hang', name: 'Dead hang', dose: '20–30 seconds', cue: 'dead-hang', holdSec: 30 },
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

  // The tempo rungs only mean something where a slow lowering does. A hold has
  // nothing to lower, and a swing is **ballistic** — a slow swing is not a
  // harder swing, it is a different and worse exercise. Those movements climb
  // reps and then load, skipping straight to the variation rung.
  if (!ex.isHold && !ex.noTempo) {
    if (next.step === 1) {
      return { ...next, step: 2, eccentricSec: 3, reps: ex.startReps };
    }
    if (next.step === 2 && next.eccentricSec < 5) {
      return { ...next, eccentricSec: 5, reps: ex.startReps };
    }
    if (next.step === 2) {
      return { ...next, step: 3, pauseSec: 2, reps: ex.startReps };
    }
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

// ---------------------------------------------------------------------------
// How long this is going to take
// ---------------------------------------------------------------------------

/** Getting set up for a movement: dragging the chair over, chalking up. */
export const SETUP_SEC = 30;
/** A controlled rep, top to top, before any prescribed tempo is added. */
export const REP_SEC = 3;
/** The warm-up checklist, which is four untimed items and one 30s hang. */
export const WARM_UP_SEC = 5 * 60;

/** Planning-time rest: if the partner is in today's session, you alternate. */
const plannedRest = (exerciseId, liveIds) => {
  const mate = partnerOf(exerciseId);
  if (mate && liveIds.has(mate)) return PAIRED_REST;
  return EXERCISE_BY_ID[exerciseId]?.restSec ?? 120;
};

/**
 * Roughly how long a session will take, in seconds, broken down.
 *
 * This exists because the number was wrong and nobody could see it.
 * `docs/STRENGTH.md` budgeted 60–75 minutes for eight movements; v44 added two
 * more and the real figure quietly became 93. A hand-written number in a doc
 * cannot notice that. This one is derived from the same `EXERCISES` the session
 * is built from, so adding a movement moves the label on the intro by itself —
 * the same discipline as `routineMs()` on the stretch routines.
 *
 * It is an estimate and says so on screen. The rest is exact — it is a timer —
 * and the working time is modelled from reps, prescribed tempo, whether the
 * movement is done on both sides, and `repSec` where a rep is not about three
 * seconds. What it cannot know is how long you spend finding your other sock.
 */
export function sessionDuration(plans = []) {
  const live = plans.filter(p => !p.muted);
  const liveIds = new Set(live.map(p => p.exercise.id));
  let workSec = 0, restSec = 0, sets = 0;

  for (const plan of live) {
    const ex = plan.exercise;
    const perRep = ex.repSec ?? REP_SEC;
    let perSet = plan.isHold
      ? plan.reps                                   // a hold's "reps" are seconds
      : plan.reps * (perRep + (plan.eccentricSec || 0) + (plan.pauseSec || 0));
    if (ex.unilateral) perSet *= 2;                 // both sides, every set
    workSec += perSet * plan.sets + SETUP_SEC;
    restSec += plan.sets * plannedRest(ex.id, liveIds);
    sets += plan.sets;
  }

  // You do not rest after the last set of the day, and at two minutes that is
  // not a rounding error.
  if (live.length) restSec -= plannedRest(live[live.length - 1].exercise.id, liveIds);
  restSec = Math.max(0, restSec);

  const warmupSec = live.length ? WARM_UP_SEC : 0;
  return {
    sets,
    workSec: Math.round(workSec),
    restSec: Math.round(restSec),
    warmupSec,
    totalSec: Math.round(workSec + restSec + warmupSec),
  };
}

/**
 * "About 1 hr 10 min" — the headline on the intro. Rounded to five minutes,
 * because a session estimate accurate to the minute would be a lie.
 */
export function durationLine(duration) {
  const mins = Math.round(duration.totalSec / 60 / 5) * 5;
  if (mins < 60) return `About ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `About ${h} hr ${m} min` : `About ${h} hr`;
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
