// The post-class stretch routine: what to stretch, and how it's drawn.
//
// This is the cool-down, not a warm-up and not a workout. Static holds after
// training is exactly where they belong — the muscles are warm, the session is
// over, and nothing here asks you to be on the mat with a phone (the v18 round
// timer was removed for that reason; this one runs while you're winding down).
//
// The list targets the areas grappling actually taxes, drawn from the common
// recommendations across BJJ strength-and-mobility sources: hips (flexors,
// glutes, adductors, internal/external rotation), hamstrings, quads, thoracic
// spine rotation, shoulders and lats, neck, and the wrists that gripping
// wrecks. Ordered as a flow — kneeling, to all fours, to lunges, to seated, to
// lying — so you change position as little as possible and finish calm.
//
// Timing is fixed and deliberately boring: 10s to get into the shape, 30s to
// hold it. A two-sided stretch runs that twice, once per side. Eleven
// stretches, 18 holds, 12 minutes.
//
// The figures are contour line drawings, one filled path each, living in
// js/stretch-art.js — see that file for why they are split out and why their
// coordinates must not be "optimised". They fill with `currentColor`, so they
// take the app's text colour and flip with the theme.
//
// This is general guidance, not physio. The view says so on screen — the app's
// standing rule is that it never claims more than it knows.

import { ART } from './stretch-art.js';

/** Seconds to get into the shape, and to hold it. */
export const READY_MS = 10_000;
export const HOLD_MS = 30_000;

/** Every segment is the same shape, which makes the whole timeline arithmetic. */
export const SEGMENT_MS = READY_MS + HOLD_MS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The routine.
 *
 * `bilateral: true` means the stretch is one side at a time and gets two holds.
 * Each `id` is also the key into ART — a stretch without artwork would render
 * an empty frame, so `tests/stretches.test.mjs` pins that every id has one.
 */
export const STRETCHES = [
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
    id: 'supine-twist',
    name: 'Supine spinal twist',
    targets: 'Spine rotation · glutes · chest',
    cue: 'On your back, arms wide. Drop the bent knee across your body and turn your head the other way.',
    bilateral: true,
  },
];

/**
 * The routine flattened into holds, which is what the timer actually walks.
 * A two-sided stretch becomes two segments; everything else becomes one.
 */
export function segments(list = STRETCHES) {
  const out = [];
  for (const s of list) {
    if (s.bilateral) {
      out.push({ stretch: s, side: 'Left side' });
      out.push({ stretch: s, side: 'Right side' });
    } else {
      out.push({ stretch: s, side: null });
    }
  }
  return out;
}

/** Total routine length in ms — every segment is READY + HOLD. */
export function routineMs(list = STRETCHES) {
  return segments(list).length * SEGMENT_MS;
}

/** "12 min" / "12:00" — mm:ss for the clock, the loose one for prose. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Draw a stretch's figure. App-authored static markup — the path comes from
 * ART, never from anything a user typed, so there is no injection surface.
 *
 * Pass a label to have it announced; without one the figure is decorative and
 * hidden from screen readers, because the stretch's name is already on screen
 * beside it.
 */
export function stretchFigure(stretch, label = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'stretch-fig');
  svg.setAttribute('fill', 'currentColor');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  // A missing figure must not take down a routine that is mid-hold: draw an
  // empty frame and let the test suite be what catches it.
  const art = ART[stretch?.id];
  svg.setAttribute('viewBox', art ? art.viewBox : '0 0 100 100');
  if (art) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', art.d);
    svg.append(p);
  }
  return svg;
}
