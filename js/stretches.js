// Two routines: the post-class cool-down, and a rest-day session.
//
// **They are not the same kind of thing, and the difference is the point.**
//
// The cool-down is passive static holds. Its honest job is to end the session
// and keep range you already have — it will *not* reduce next-day soreness
// (the meta-analytic answer on that is "no effect"), and one 30s hold a few
// times a week is maintenance, not adaptation.
//
// The rest-day routine is where range is actually built, because you are not
// fatigued and can load the end of the range. Resistance work through a full
// range produces flexibility gains comparable to static stretching *and*
// leaves you strong there — which is what holds up when someone cranks a
// joint. All of it is bodyweight; it assumes a floor, a chair and a bar.
//
// Ordering in both is a flow, not a ranking: you change position as little as
// possible. Don't shuffle it for variety. Flexibility adaptation is specific
// to the joint angle you keep loading, so rotating the list each session
// resets the stimulus — the boring sameness is the feature.
//
// TIMING. The cool-down is 10s ready + 30s hold. The rest-day session adds a
// rest phase, because strength work needs one and stretching does not: 10s
// ready + 35s work + 20s rest — except its warm-up, which is 35s of work and
// nothing else, so those four movements flow straight into one another.
//
// Segments are therefore *not* all the same length, and `segments()` below
// precomputes each one's start and end. The current segment is a lookup into
// that fixed table, which is still a pure function of elapsed milliseconds.
// The rule that matters has never been "all segments are equal" — it is that
// **nothing accumulates per tick**, because an accumulator drifts and a
// lookup cannot.
//
// Figures live in js/stretch-art.js, keyed by item id. Anything listed in
// PENDING_ART there has no drawing yet and renders without one rather than
// showing an empty box.
//
// General guidance, not physio. Nothing here knows anything about your body.

import { ART, PENDING_ART } from './stretch-art.js';

/** The cool-down's cycle, kept as named exports because tests pin them. */
export const READY_MS = 10_000;
export const HOLD_MS = 30_000;
export const SEGMENT_MS = READY_MS + HOLD_MS;

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// Routine 1 — after class. Passive holds, both sides, finish lying down.
// ---------------------------------------------------------------------------

const POST_CLASS_ITEMS = [
  {
    id: 'neck-side',
    name: 'Neck side stretch',
    targets: 'Neck · upper traps',
    cue: 'Sit tall. Ear toward the shoulder, hand resting on your head — let the weight do it, don’t pull.',
    bilateral: true,
  },
  {
    id: 'wrist-floor',
    name: 'Kneeling wrist stretch',
    targets: 'Wrists · forearm flexors',
    cue: 'Kneel, palms flat on the floor, fingers pointing back at your knees. Rock your weight back gently.',
    bilateral: false,
  },
  // The other half of the one above, and it is deliberately adjacent: same
  // kneeling set-up, hands flipped, so it costs a position change of nothing.
  // Palms-down stretches the flexors; a two-hour grip battle shortens both
  // sides and only one of them was ever being opened.
  {
    id: 'wrist-reverse',
    name: 'Reverse wrist stretch',
    targets: 'Wrists · forearm extensors',
    cue: 'Same kneel, hands flipped — backs of the hands down, fingers toward your knees. Ease back until the tops of the forearms pull.',
    bilateral: false,
  },
  {
    id: 'childs-pose',
    name: 'Child’s pose',
    targets: 'Lats · shoulders · lower back',
    cue: 'Knees wide, hips back to your heels, arms reaching long in front. Breathe into your back.',
    bilateral: false,
  },
  {
    id: 'thread-needle',
    name: 'Thread the needle',
    targets: 'Upper back · rear shoulder',
    cue: 'From all fours, slide one arm under your chest, palm up. Let that shoulder and cheek rest down.',
    bilateral: true,
  },
  {
    // Added in v27. Ankle is among the more commonly injured segments in BJJ,
    // and dorsiflexion feeds guard retention, standing up in base and squat
    // depth — nothing else in the routine touched it.
    id: 'ankle-rock',
    name: 'Half-kneeling ankle rock',
    targets: 'Ankles · calves',
    cue: 'Front foot flat, heel glued down. Drive the knee forward over the toes and rock in and out slowly.',
    bilateral: true,
  },
  {
    id: 'hip-flexor-lunge',
    name: 'Kneeling hip flexor lunge',
    targets: 'Hip flexors · psoas',
    cue: 'Back knee down, front foot flat. Tuck your tailbone under, then ease the hips forward.',
    bilateral: true,
  },
  {
    id: 'quad-kneel',
    name: 'Kneeling quad stretch',
    targets: 'Quads · hip flexors',
    cue: 'Same lunge, back foot lifted. Reach behind, catch the ankle, keep the tailbone tucked.',
    bilateral: true,
  },
  {
    id: 'pigeon',
    name: 'Pigeon stretch',
    targets: 'Glutes · piriformis · outer hip',
    cue: 'Front shin across, back leg long behind. Stack the hips level, then fold forward over the front leg.',
    bilateral: true,
  },
  {
    id: 'frog',
    name: 'Frog stretch',
    targets: 'Adductors · groin',
    cue: 'Knees wide on the floor, shins in line, forearms down. Rock the hips back until the groin says enough.',
    bilateral: false,
  },
  {
    id: 'ninety-ninety',
    name: '90/90 hip stretch',
    targets: 'Hip internal + external rotation',
    cue: 'Both knees bent square — one leg in front, one out behind. Sit tall, then lean over the front shin.',
    bilateral: true,
  },
  {
    id: 'seated-fold',
    name: 'Seated forward fold',
    targets: 'Hamstrings · calves · lower back',
    cue: 'Legs straight out, toes pulled back. Hinge from the hips, not the spine — chest toward the shins.',
    bilateral: false,
  },
  {
    // Added in v27. Thread the needle covers rotation; nothing covered
    // extension, and hours folded under side control is all flexion.
    id: 'sphinx',
    name: 'Sphinx',
    targets: 'Thoracic extension · chest · abs',
    cue: 'Lie face down, forearms under your shoulders. Lift the chest and lengthen up — open the ribs, don’t crunch the low back.',
    bilateral: false,
  },
  // The gap this routine had until v67: every other upper-body hold in it opens
  // the *back* of the shoulder (thread the needle, child's pose) or the
  // underside of the forearm, while grip fighting, framing, posting and being
  // stacked all shorten the front. Sphinx names "chest" but is a thoracic
  // press-up — this is the only thing here that actually takes the shoulder
  // into horizontal extension. Placed between the two floor positions the
  // routine already passes through, so it adds no position change.
  {
    id: 'pec-floor',
    name: 'Prone chest opener',
    targets: 'Chest · front of shoulder · biceps',
    cue: 'Face down, one arm straight out at shoulder height, palm down. Roll onto that shoulder and let the other hand walk you over until the chest opens.',
    bilateral: true,
  },
  {
    id: 'supine-twist',
    name: 'Supine spinal twist',
    targets: 'Spine rotation · glutes · chest',
    cue: 'On your back, arms wide. Drop the bent knee across your body and turn your head the other way.',
    bilateral: true,
  },
];

// ---------------------------------------------------------------------------
// Routine 2 — rest day. Bodyweight end-range strength; floor, chair and bar.
//
// This is the one loading you at end-range cold — unlike the after-class
// cool-down, there is no class beforehand to warm you up first. The `warmup`
// flag on the four items below marks that: the intro list sections them, the
// running screen badges them, and `phasesFor()` gives them **work only** — no
// countdown into a movement that needs no setup, and no rest between movements
// whose whole job is to get you warm. They flow one into the next.
// ---------------------------------------------------------------------------

const WARMUP_ITEMS = [
  {
    id: 'warmup-march',
    name: 'March in place',
    targets: 'General blood flow',
    dose: 'Steady pace',
    cue: 'Lift the knees to hip height and swing the arms. Nothing fancy — just get warm before you load anything.',
    bilateral: false,
    warmup: true,
  },
  {
    id: 'warmup-squat',
    name: 'Bodyweight squat pulses',
    targets: 'Hips · knees · ankles',
    dose: 'Continuous reps',
    cue: "Squat to a comfortable depth and stand, smooth and continuous — no pause at the bottom yet, that's the main session's job.",
    bilateral: false,
    warmup: true,
  },
  {
    id: 'warmup-arm-circle',
    name: 'Arm circles',
    targets: 'Shoulders',
    dose: 'Forward then back',
    cue: 'Big slow circles, palms leading. Halfway through, reverse direction.',
    bilateral: false,
    warmup: true,
  },
  {
    id: 'warmup-leg-swing',
    name: 'Leg swings',
    targets: 'Hips · hamstrings',
    dose: 'Front-to-back',
    cue: "Hold something for balance and swing one leg front to back within a comfortable range. Let the range grow as you go — don't force it.",
    bilateral: true,
    warmup: true,
  },
];

const REST_DAY_ITEMS = [
  ...WARMUP_ITEMS,
  {
    id: 'deep-squat-hold',
    name: 'Deep squat hold',
    targets: 'Hips · ankles · adductors',
    dose: 'Sit and settle',
    cue: 'Sink to the bottom, heels down, elbows inside the knees. Push the knees out and breathe — let it settle rather than forcing it.',
    bilateral: false,
  },
  {
    id: 'cossack-squat',
    name: 'Cossack squat',
    targets: 'Adductors · hips · knees',
    dose: '5–8 each side',
    cue: 'Wide stance, shift all the way over one bent leg, other leg straight with the toe up. Slow, and only as deep as you control.',
    bilateral: false,
  },
  {
    id: 'ninety-ninety-liftoff',
    name: '90/90 lift-off',
    targets: 'Active hip internal + external rotation',
    dose: '8–10 lifts',
    cue: 'Sit in 90/90, hands down. Lift the front shin off the floor without leaning — small range, this is the active version of the stretch.',
    bilateral: true,
  },
  {
    id: 'glute-bridge-single',
    name: 'Single-leg glute bridge',
    targets: 'Glutes · hamstrings · hip extension',
    dose: '8–12 reps',
    cue: 'One foot planted, other knee hugged in. Drive through the heel, squeeze at the top, keep the hips level.',
    bilateral: true,
  },
  {
    id: 'copenhagen',
    name: 'Copenhagen plank',
    targets: 'Adductors · groin · core',
    dose: 'Hold, or 8 lifts',
    cue: 'Top leg on the chair, forearm down, lift the hips into a straight line. Start with the bottom knee down — this is the groin-injury one.',
    bilateral: true,
  },
  {
    id: 'single-leg-rdl',
    name: 'Single-leg RDL',
    targets: 'Hamstrings · balance · hip hinge',
    dose: '8–10 reps',
    cue: 'Hinge at the hip over one leg, back leg reaching behind, spine long. Feel the hamstring load, not the low back.',
    bilateral: true,
  },
  {
    id: 'jefferson-curl',
    name: 'Jefferson curl',
    targets: 'Spinal flexion control · hamstrings',
    dose: '5–6 slow reps',
    cue: 'Bodyweight only. Roll down one vertebra at a time, legs straight, then stack back up just as slowly. Stop at anything sharp.',
    bilateral: false,
  },
  {
    id: 'thoracic-press-up',
    name: 'Prone thoracic press-up',
    targets: 'Thoracic extension · chest',
    dose: '8–10 reps',
    cue: 'Face down, hands under the shoulders. Press the chest up and let the hips stay down — extension from the ribs, not the low back.',
    bilateral: false,
  },
  {
    id: 'wall-slide',
    name: 'Scapular wall slide',
    targets: 'Shoulders · upper back',
    dose: '8–10 reps',
    cue: 'Back to the wall, forearms flat against it. Slide up keeping wrists and elbows touching — go only as far as they stay on.',
    bilateral: false,
  },
  {
    id: 'dead-hang',
    name: 'Dead hang',
    targets: 'Shoulders · lats · grip · spine',
    dose: 'Hang and relax',
    cue: 'Hang from the bar, shoulders relaxed up by your ears, breathe. Let the spine decompress after all that being folded up.',
    bilateral: false,
  },
  {
    id: 'neck-isometric',
    name: 'Neck isometrics',
    targets: 'Neck · cervical spine',
    dose: '~8s each way',
    cue: 'Hand on the head, press gently and resist so nothing moves. Front, back, then each side. Light pressure — this is not a max effort.',
    bilateral: false,
  },
  {
    id: 'bear-crawl',
    name: 'Bear crawl',
    targets: 'Shoulders · wrists · core · coordination',
    dose: 'Forward and back',
    cue: 'Knees an inch off the floor, hips low, opposite hand and foot together. Small steps, keep the hips from rolling.',
    bilateral: false,
  },
  {
    id: 'side-plank',
    name: 'Side plank',
    targets: 'Lateral core · obliques · hips',
    dose: 'Hold',
    cue: 'Forearm under the shoulder, body in one line, hips stacked and lifted. Drop the knee if the line starts sagging.',
    bilateral: true,
  },
];

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Routine 3 — Pilates. Mat work, floor only, nothing else in the room.
//
// **Why it is here at all, in one line: jiu jitsu is hours of spinal flexion
// and one-sided load, and this is the repertoire that answers both.** The
// roll-up and the teaser are literally how you come up off your back in guard;
// the side-kick series is hip stability under load, which is shrimping; the
// swan and swimming are the extension work that hours folded under side
// control never gives you.
//
// It is the third *kind* of thing in this tab, and the distinction matters as
// much as the one between the other two. The cool-down keeps range you have.
// The rest day builds range by loading its end. This trains **control** —
// moving one segment of the spine at a time, and keeping the pelvis still
// while the legs move. Nothing else in the app asks for that.
//
// TIMING, and the compromise in it. Classical mat work is counted in reps at a
// tempo, and this engine runs a clock. Rather than teach it reps — which would
// mean per-item durations, i.e. the accumulator the timeline has been designed
// against since v39 — each movement gets a fixed 45s window and you do what
// you get. `dose` says the target where a number is meaningful (the Hundred is
// five breaths in, five out) and is left off where it is not. This costs
// nothing in the engine and is honest on screen: it is a window, not a rep
// count.
//
// The three preparation items carry `warmup: true`, so they flow one into the
// next with no countdown and no rest, exactly as the rest day's do. They are
// not filler — lateral breathing and the head nod are the two things that
// decide whether the next 25 minutes work on the right muscles.
//
// Ordering is the classical progression: supine, then side, then prone, then
// seated. You change position five times in half an hour rather than thirty.
// ---------------------------------------------------------------------------

const PILATES_ITEMS = [
  {
    id: 'pil-breathing',
    name: 'Lateral breathing',
    targets: 'Ribs · diaphragm',
    dose: '10 slow breaths',
    cue: 'Lie on your back, knees bent, hands on the sides of your ribs. Breathe wide into your hands, not up into your belly. This is the whole method in one movement.',
    bilateral: false,
    warmup: true,
  },
  {
    id: 'pil-pelvic-tilt',
    name: 'Pelvic tilts',
    targets: 'Lower back · deep abdominals',
    dose: 'Continuous, small',
    cue: 'Rock the pelvis so the lower back flattens to the floor, then release. Slow and small — you are finding the range, not forcing it.',
    bilateral: false,
    warmup: true,
  },
  {
    id: 'pil-head-nod',
    name: 'Head nods',
    targets: 'Neck · deep neck flexors',
    dose: 'Continuous, tiny',
    cue: 'Nod the chin a centimetre, as if you were holding a peach under it. This teaches the neck to stop doing the abs\' job, which is how most people wreck a mat class.',
    bilateral: false,
    warmup: true,
  },
  {
    id: 'pil-pelvic-curl',
    name: 'Pelvic curl',
    targets: 'Glutes · hamstrings · spine',
    cue: 'Roll the spine off the floor one vertebra at a time, ribs down, then roll back down the same way. Bones, not a lift.',
    bilateral: false,
  },
  {
    id: 'pil-chest-lift',
    name: 'Chest lift',
    targets: 'Upper abdominals',
    cue: 'Hands behind the head, elbows wide. Curl the ribs toward the hips and lower halfway. If your neck aches, your abs were not working.',
    bilateral: false,
  },
  {
    id: 'pil-chest-lift-rot',
    name: 'Chest lift with rotation',
    targets: 'Obliques',
    cue: 'Curled up, rotate the ribcage toward one knee — the whole ribcage, not just the elbow. Stay high as you turn.',
    bilateral: true,
  },
  {
    id: 'pil-toe-taps',
    name: 'Toe taps',
    targets: 'Deep abdominals · hip flexors',
    cue: 'Tabletop legs. Lower one toe to the floor and back without the lower back lifting. The back not moving is the exercise.',
    bilateral: false,
  },
  {
    id: 'pil-hundred',
    name: 'The Hundred',
    targets: 'Abdominals · breath',
    dose: '5 in, 5 out',
    cue: 'Curled up, legs at whatever height keeps your back down, arms pumping by your sides. Breathe in for five, out for five.',
    bilateral: false,
  },
  {
    id: 'pil-roll-up',
    name: 'Roll-up',
    targets: 'Abdominals · spinal articulation',
    dose: '6 slow reps',
    cue: 'Roll up one vertebra at a time, reach past the toes, and roll back down just as slowly. This is exactly how you come up off your back in guard.',
    bilateral: false,
  },
  {
    id: 'pil-leg-circles',
    name: 'Single leg circles',
    targets: 'Hips · pelvic stability',
    cue: 'One leg to the ceiling, circle it. The pelvis must not rock — the circle is small enough when it stays still.',
    bilateral: true,
  },
  {
    id: 'pil-rolling-ball',
    name: 'Rolling like a ball',
    targets: 'Spine · balance',
    dose: '8 reps',
    cue: 'Tucked tight, hands on your shins. Roll to the shoulder blades and back up to balance. Never onto the neck.',
    bilateral: false,
  },
  {
    id: 'pil-single-leg-stretch',
    name: 'Single leg stretch',
    targets: 'Abdominals · coordination',
    cue: 'Curled up, one knee in, the other long and low. Switch. The lower the long leg goes, the harder it is.',
    bilateral: false,
  },
  {
    id: 'pil-double-leg-stretch',
    name: 'Double leg stretch',
    targets: 'Abdominals',
    cue: 'Reach arms and legs long in opposite directions, then circle the arms and pull the knees back in. Keep the back on the floor.',
    bilateral: false,
  },
  {
    id: 'pil-scissors',
    name: 'Scissors',
    targets: 'Abdominals · hamstrings',
    cue: 'Legs to the ceiling, switch them past each other with a small double pulse. Chest stays lifted.',
    bilateral: false,
  },
  {
    id: 'pil-lower-lift',
    name: 'Lower lift',
    targets: 'Lower abdominals',
    cue: 'Legs together, lower them as far as your back stays down, then lift. That limit is the whole point.',
    bilateral: false,
  },
  {
    id: 'pil-criss-cross',
    name: 'Criss-cross',
    targets: 'Obliques',
    cue: 'Elbow toward the opposite knee, rotating from the ribs. Slow beats fast here.',
    bilateral: false,
  },
  {
    id: 'pil-teaser',
    name: 'Teaser',
    targets: 'Abdominals · hip flexors',
    dose: '5 reps',
    cue: 'Knees bent, feet down. Roll up to a V, reach past the knees, roll down with control. Bend the knees as much as you need to.',
    bilateral: false,
  },
  {
    id: 'pil-side-kick',
    name: 'Side kick series',
    targets: 'Outer hip · glutes',
    cue: 'On your side, body in one line. Swing the top leg forward and back, then lift and lower it. The torso does not move — that is the exercise.',
    bilateral: true,
  },
  {
    id: 'pil-clam',
    name: 'Clam',
    targets: 'Glute medius',
    cue: 'On your side, knees bent and stacked, feet together. Open the top knee without letting the hips roll back.',
    bilateral: true,
  },
  {
    id: 'pil-side-bend',
    name: 'Side bend',
    targets: 'Obliques · shoulders',
    cue: 'Side sitting, one hand down. Press the hips to the ceiling into a long arc, then lower. Drop to a forearm if the wrist complains.',
    bilateral: true,
  },
  {
    id: 'pil-swan',
    name: 'Swan',
    targets: 'Back extensors · chest',
    cue: 'Hands under the shoulders, lengthen forward and lift the chest. This is the direct antidote to hours folded under side control.',
    bilateral: false,
  },
  {
    id: 'pil-single-leg-kick',
    name: 'Single leg kick',
    targets: 'Hamstrings · back',
    cue: 'On your forearms, chest lifted. Kick one heel toward your seat with a double pulse, then switch.',
    bilateral: false,
  },
  {
    id: 'pil-swimming',
    name: 'Swimming',
    targets: 'Whole back chain',
    dose: 'Small and fast',
    cue: 'Face down, opposite arm and leg lifted, flutter them small and fast while you breathe.',
    bilateral: false,
  },
  {
    id: 'pil-leg-pull-front',
    name: 'Leg pull front',
    targets: 'Shoulders · core',
    cue: 'A plank. Lift one leg a few centimetres without the hips shifting, then the other.',
    bilateral: false,
  },
  {
    id: 'pil-saw',
    name: 'Saw',
    targets: 'Obliques · hamstrings',
    cue: 'Sitting tall, legs wide. Rotate and reach the opposite hand past the little toe, exhaling everything out. Sit back up tall.',
    bilateral: true,
  },
  {
    id: 'pil-spine-stretch',
    name: 'Spine stretch forward',
    targets: 'Spine · hamstrings',
    cue: 'Sitting tall, legs wide. Curl forward over an imaginary beach ball, then restack the spine from the bottom.',
    bilateral: false,
  },
  {
    id: 'pil-mermaid',
    name: 'Mermaid',
    targets: 'Side body · lats',
    cue: 'Side sitting. Reach one arm overhead and over, breathing into the ribs that are stretching.',
    bilateral: true,
  },
];

/**
 * The routines. `phases` is what makes the timeline arithmetic: every segment
 * in a routine is `ready + work + rest` long, so the current segment is a
 * division rather than a running count, and a phone that sleeps mid-session
 * resumes in the right place instead of drifting.
 */
export const ROUTINES = [
  {
    id: 'post-class',
    name: 'After class',
    blurb: 'Passive holds to finish the session',
    workLabel: 'Hold',
    unit: 'stretches',
    phases: { ready: READY_MS, work: HOLD_MS, rest: 0 },
    needs: [],
    note: 'General guidance, not physio. Ease into each one and back off anything that pinches.',
    doneNote: 'Marked on your calendar. Still a cool-down, not a class.',
    items: POST_CLASS_ITEMS,
  },
  {
    id: 'rest-day',
    name: 'Rest day',
    blurb: 'Bodyweight strength at the end of the range',
    workLabel: 'Work',
    unit: 'movements',
    phases: { ready: 10_000, work: 35_000, rest: 20_000 },
    needs: ['Floor', 'Chair', 'Pull-up bar'],
    note: 'General guidance, not physio. This is the session that actually builds range — go slow, stop at anything sharp.',
    doneNote: 'Marked on your calendar as off-mat work.',
    items: REST_DAY_ITEMS,
  },
  {
    id: 'pilates',
    name: 'Pilates',
    blurb: 'Mat work for control — floor only',
    workLabel: 'Work',
    unit: 'movements',
    // No rest phase, like the cool-down: mat work flows, and the 8s between
    // movements is the position change rather than a recovery.
    phases: { ready: 8_000, work: 45_000, rest: 0 },
    needs: ['Floor'],
    // Not "Warm-up": these three set the position and the breath rather than
    // raise a temperature, and calling them a warm-up invites skipping them.
    warmupLabel: 'Set up',
    note: 'General guidance, not physio. Breathe into the ribs, and stop if your neck is doing the work.',
    doneNote: 'Marked on your calendar as off-mat work.',
    items: PILATES_ITEMS,
  },
];

export const DEFAULT_ROUTINE = 'post-class';

/** Look a routine up by id, falling back to the cool-down. */
export function getRoutine(id) {
  return ROUTINES.find(r => r.id === id) ?? ROUTINES.find(r => r.id === DEFAULT_ROUTINE);
}

/** A routine's normal segment length — every movement except the warm-up. */
export function segmentMs(routine) {
  const { ready, work, rest } = routine.phases;
  return ready + work + rest;
}

/**
 * The phases one movement runs through.
 *
 * **Warm-up movements are work only** — no countdown into them and no rest
 * after. You are marching on the spot to get warm; stopping for 20 seconds
 * between each one is the opposite of that, and a "get ready" before a movement
 * that needs no setup is just dead air. They flow one into the next, and the
 * spoken name lands as the movement starts rather than before it.
 */
export function phasesFor(routine, item) {
  if (item.warmup) return { ready: 0, work: routine.phases.work, rest: 0 };
  return routine.phases;
}

/**
 * The routine flattened into segments, which is what the timer walks.
 * A two-sided item becomes two; everything else becomes one.
 *
 * Each segment carries its own phases and its absolute `start`/`end` on the
 * routine's timeline. **This is a precomputed table, not a running total** —
 * the distinction is the whole ballgame. Up to v39 the current segment was
 * `floor(elapsed / SEGMENT)`, which only worked because every segment was the
 * same length; the warm-up broke that. What replaced it is a lookup into these
 * fixed offsets, so the current segment is still a pure function of elapsed
 * milliseconds and a phone that sleeps for a minute still resumes in exactly
 * the right place. If you ever find yourself *adding* a duration to a counter
 * on each tick, stop: that is the drift this has always been designed out of.
 */
export function segments(routine) {
  const out = [];
  let at = 0;
  const push = (item, side) => {
    const phases = phasesFor(routine, item);
    const length = phases.ready + phases.work + phases.rest;
    out.push({ item, side, phases, length, start: at, end: at + length });
    at += length;
  };
  for (const item of routine.items) {
    if (item.bilateral) { push(item, 'Left side'); push(item, 'Right side'); }
    else push(item, null);
  }
  return out;
}

/** Total length in ms. */
export function routineMs(routine) {
  const segs = segments(routine);
  return segs.length ? segs[segs.length - 1].end : 0;
}

/** Which segment is running at `ms`, or -1 past the end. Binary search. */
export function segmentAt(segs, ms) {
  let lo = 0, hi = segs.length - 1;
  if (!segs.length || ms < 0 || ms >= segs[hi].end) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms < segs[mid].end) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/** "12:00" — mm:ss, never negative. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * "Now the other side" — how many takes are recorded in audio/cues/.
 *
 * 14 of the 30 movements are two-sided, so announcing the move's name on both
 * halves means hearing the same line twice, 14 times a session. The second half
 * plays one of these instead. They are deliberately generic, so any one can
 * follow any movement and none needs re-recording if a routine changes.
 */
export const OTHER_SIDE_CUES = 6;

/**
 * Hype lines, played as a set begins — `audio/cues/hype-N.webm`.
 *
 * Deliberately *not* played every set. A line that fires every single time
 * stops being encouragement and becomes the sound the app makes; the beeps
 * alone are the baseline and these land on some of them. Same reason the
 * spoken "3, 2, 1, let's go" is rarer still.
 */
export const HYPE_CUES = 10;

/**
 * Pick a take, never the one that just played.
 *
 * Pure, and `rand` is injectable, because this is the only part of the audio
 * path that can be checked without ears: the browser caches a decoded clip, so
 * a second play of the same take fires no network request and a test watching
 * requests silently undercounts. Test the choice, not the fetch.
 *
 * Uniform over the other five rather than re-rolling until it differs — a
 * re-roll loop is unbounded in principle, and this runs mid-routine.
 */
export function pickCue(count, last, rand = Math.random) {
  // No previous take (start of a session): every one is fair game. Without
  // this branch the skip-over below shifts every result up by one and take 1
  // can never play first.
  if (!(last >= 1 && last <= count)) return 1 + Math.floor(rand() * count);
  const n = 1 + Math.floor(rand() * (count - 1));   // 1..count-1
  return n >= last ? n + 1 : n;                     // skip over `last`
}

/**
 * "Session complete" lines — `audio/cues/<voice>/finish-N.webm`.
 *
 * These follow the finish chime rather than replacing it. The chime is the
 * signal that the routine is over and it is the same three notes every time,
 * which is what makes it readable without looking; the voice is the flourish
 * on top, and a flourish that arrives instead of the signal is a worse signal.
 */
export const FINISH_CUES = 5;

export const pickOtherSide = (last, rand) => pickCue(OTHER_SIDE_CUES, last, rand);
export const pickHype = (last, rand) => pickCue(HYPE_CUES, last, rand);
export const pickFinish = (last, rand) => pickCue(FINISH_CUES, last, rand);

/** Does this item have a drawing yet? See PENDING_ART in stretch-art.js. */
export function hasArt(item) {
  return Boolean(ART[item?.id]);
}

/** Everything still waiting on a figure — surfaced so a typo can't hide here. */
export function pendingArt() {
  return ROUTINES.flatMap(r => r.items).filter(i => !hasArt(i)).map(i => i.id);
}

export { PENDING_ART };

/**
 * Draw an item's figure. App-authored static markup — the path comes from ART,
 * never from anything a user typed, so there is no injection surface.
 *
 * Returns null when there is no artwork yet, so callers can leave the space out
 * entirely rather than rendering an empty frame that reads as broken.
 *
 * `extra` exists for the strength screen, whose figures live in
 * js/strength-art.js and are imported lazily — so it hands its own lookup in
 * rather than this module importing a file the routines never draw from. It
 * *adds* to ART rather than replacing it, which is what `single-leg-rdl` needs:
 * one movement, one id, drawn by both the rest-day routine and the lift screen,
 * and its figure stays in ART. Passing nothing, or `{}` when the lazy import
 * failed offline, both mean "just the routine figures" — fewer drawings, never
 * a broken screen.
 */
export function stretchFigure(item, label = '', extra = null) {
  const art = extra?.[item?.id] ?? ART[item?.id];
  if (!art) return null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'stretch-fig');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('viewBox', art.viewBox);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', art.d);
  svg.append(p);
  return svg;
}
