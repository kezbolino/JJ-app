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
// TIMING. Every segment inside one routine is the same length, which keeps the
// whole timeline a single expression over elapsed milliseconds (see
// js/views/stretch.js). The cool-down is 10s ready + 30s hold. The rest-day
// session adds a rest phase, because strength work needs one and stretching
// does not: 10s ready + 35s work + 20s rest.
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
    targets: 'Wrists · forearms',
    cue: 'Kneel, palms flat on the floor, fingers pointing back at your knees. Rock your weight back gently.',
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
// ---------------------------------------------------------------------------

const REST_DAY_ITEMS = [
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
    doneNote: 'Nothing was logged — this is just the cool-down.',
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
    doneNote: 'Nothing was logged — this is just mobility work.',
    items: REST_DAY_ITEMS,
  },
];

export const DEFAULT_ROUTINE = 'post-class';

/** Look a routine up by id, falling back to the cool-down. */
export function getRoutine(id) {
  return ROUTINES.find(r => r.id === id) ?? ROUTINES.find(r => r.id === DEFAULT_ROUTINE);
}

/** How long one segment of this routine runs, in ms. */
export function segmentMs(routine) {
  const { ready, work, rest } = routine.phases;
  return ready + work + rest;
}

/**
 * The routine flattened into segments, which is what the timer walks.
 * A two-sided item becomes two; everything else becomes one.
 */
export function segments(routine) {
  const out = [];
  for (const item of routine.items) {
    if (item.bilateral) {
      out.push({ item, side: 'Left side' });
      out.push({ item, side: 'Right side' });
    } else {
      out.push({ item, side: null });
    }
  }
  return out;
}

/** Total length in ms. */
export function routineMs(routine) {
  return segments(routine).length * segmentMs(routine);
}

/** "12:00" — mm:ss, never negative. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
 */
export function stretchFigure(item, label = '') {
  const art = ART[item?.id];
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
