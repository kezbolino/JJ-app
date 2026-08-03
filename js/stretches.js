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
// The figures are app-authored SVG line art in the same visual family as the
// icons in ui.js — stroke-based, round caps, `currentColor` so they theme.
// They are drawn from the side or the front, whichever actually shows the
// point of the stretch (frog is drawn front-on because splayed knees *are* the
// stretch; a side view would hide it).
//
// This is general guidance, not physio. The view says so on screen — the app's
// standing rule is that it never claims more than it knows.

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
 * `figure` is { head: [cx, cy, r], strokes: [path d, …] } on a 120×100 canvas
 * with the ground at y=92. `ground: false` drops that line for the one pose
 * drawn from above — a floor line under a top-down view reads as a horizon and
 * makes the figure look like it is standing up.
 */
export const STRETCHES = [
  {
    id: 'neck-side',
    name: 'Neck side stretch',
    targets: 'Neck · upper traps',
    cue: 'Sit tall. Ear toward the shoulder, hand resting on your head — let the weight do it, don’t pull.',
    bilateral: true,
    figure: {
      head: [54, 32, 8.5],
      strokes: [
        'M59,41 L61,64',
        'M48,46 L74,46',
        'M74,46 L79,33 L61,27',
        'M48,46 L44,58 L47,69',
        'M61,66 L36,80 L58,86',
        'M61,66 L86,80 L64,86',
      ],
    },
  },
  {
    id: 'wrist-floor',
    name: 'Kneeling wrist stretch',
    targets: 'Wrists · forearms',
    cue: 'Kneel, palms flat on the floor, fingers pointing back at your knees. Rock your weight back gently.',
    bilateral: false,
    figure: {
      head: [52, 37, 8.5],
      strokes: [
        'M52,46 L52,70',
        'M52,70 L58,90',
        'M58,90 L34,92',
        'M57,51 L72,68 L81,89',
        'M81,89 L63,91',
      ],
    },
  },
  {
    id: 'childs-pose',
    name: 'Child’s pose',
    targets: 'Lats · shoulders · lower back',
    cue: 'Knees wide, hips back to your heels, arms reaching long in front. Breathe into your back.',
    bilateral: false,
    figure: {
      head: [84, 79, 7],
      strokes: [
        'M26,91 L58,91',
        'M30,80 L58,91',
        'M30,80 C44,63 64,72 76,86',
        'M76,87 L106,91',
      ],
    },
  },
  {
    id: 'thread-needle',
    name: 'Thread the needle',
    targets: 'Upper back · rear shoulder',
    cue: 'From all fours, slide one arm under your chest, palm up. Let that shoulder and cheek rest down.',
    bilateral: true,
    figure: {
      head: [90, 84, 8],
      strokes: [
        'M46,62 L44,90',
        'M44,90 L26,92',
        'M46,62 C60,68 72,78 80,85',
        'M80,87 L108,91',
        'M70,76 C78,63 92,61 100,68',
      ],
    },
  },
  {
    id: 'hip-flexor-lunge',
    name: 'Kneeling hip flexor lunge',
    targets: 'Hip flexors · psoas',
    cue: 'Back knee down, front foot flat. Tuck your tailbone under, then ease the hips forward.',
    bilateral: true,
    figure: {
      head: [58, 28, 9],
      strokes: [
        'M58,37 L56,62',
        'M56,62 L36,86',
        'M36,86 L22,88',
        'M56,62 L80,62',
        'M80,62 L82,86',
        'M58,44 L74,58',
        'M54,44 L46,64',
      ],
    },
  },
  {
    id: 'quad-kneel',
    name: 'Kneeling quad stretch',
    targets: 'Quads · hip flexors',
    cue: 'Same lunge, back foot lifted. Reach behind, catch the ankle, keep the tailbone tucked.',
    bilateral: true,
    figure: {
      head: [62, 30, 9],
      strokes: [
        'M62,39 L60,64',
        'M60,64 L40,86',
        'M40,86 L34,66',
        'M60,64 L84,64',
        'M84,64 L86,86',
        'M60,46 C50,52 40,60 35,65',
        'M64,46 L78,58',
      ],
    },
  },
  {
    id: 'pigeon',
    name: 'Pigeon stretch',
    targets: 'Glutes · piriformis · outer hip',
    cue: 'Front shin across, back leg long behind. Stack the hips level, then fold forward over the front leg.',
    bilateral: true,
    figure: {
      head: [66, 35, 9],
      strokes: [
        'M66,44 L64,66',
        'M64,68 L42,82 L22,91',
        'M64,68 L86,80 L52,88',
        'M58,50 L52,63 L48,79',
        'M74,50 L82,63 L86,79',
      ],
    },
  },
  {
    id: 'frog',
    name: 'Frog stretch',
    targets: 'Adductors · groin',
    cue: 'Knees wide on the floor, shins in line, forearms down. Rock the hips back until the groin says enough.',
    bilateral: false,
    figure: {
      head: [60, 40, 8],
      strokes: [
        'M60,48 L60,66',
        'M60,66 L26,74',
        'M26,74 L24,88',
        'M60,66 L94,74',
        'M94,74 L96,88',
        'M50,52 L40,64 L34,66',
        'M70,52 L80,64 L86,66',
      ],
    },
  },
  {
    id: 'ninety-ninety',
    name: '90/90 hip stretch',
    targets: 'Hip internal + external rotation',
    cue: 'Both knees bent square — one leg in front, one out behind. Sit tall, then lean over the front shin.',
    bilateral: true,
    figure: {
      head: [62, 37, 8.5],
      strokes: [
        'M62,46 L62,66',
        'M62,68 L34,74 L44,90',
        'M62,68 L88,62 L96,80',
        'M56,50 L46,64 L42,79',
        'M68,50 L76,58',
      ],
    },
  },
  {
    id: 'seated-fold',
    name: 'Seated forward fold',
    targets: 'Hamstrings · calves · lower back',
    cue: 'Legs straight out, toes pulled back. Hinge from the hips, not the spine — chest toward the shins.',
    bilateral: false,
    figure: {
      head: [70, 66, 6.5],
      strokes: [
        'M28,89 L92,91',
        'M92,91 L88,78',
        'M28,89 C31,70 44,60 58,66',
        'M58,71 L80,87',
      ],
    },
  },
  {
    id: 'supine-twist',
    name: 'Supine spinal twist',
    targets: 'Spine rotation · glutes · chest',
    cue: 'On your back, arms wide. Drop the bent knee across your body and turn your head the other way.',
    bilateral: true,
    figure: {
      ground: false,
      mat: true,
      head: [22, 50, 7.5],
      strokes: [
        'M30,52 L70,54',
        'M38,52 L34,30',
        'M38,53 L34,76',
        'M70,54 L84,76 L104,74',
        'M70,54 L106,58',
      ],
    },
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
 * Draw a figure. App-authored static markup — the paths are constants in this
 * file, never anything a user typed, so there is no injection surface here.
 */
export function stretchFigure(figure, label = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'stretch-fig');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  // A soft ground line, so the poses read as being on the floor rather than
  // floating. Drawn first so the figure sits on top of it. Omitted for the
  // top-down pose, where it would read as a horizon and stand the figure up.
  if (figure.ground !== false) {
    const ground = document.createElementNS(SVG_NS, 'line');
    ground.setAttribute('x1', '10'); ground.setAttribute('y1', '92');
    ground.setAttribute('x2', '110'); ground.setAttribute('y2', '92');
    ground.setAttribute('class', 'fig-ground');
    svg.append(ground);
  }

  // The top-down pose gets a mat outline instead. Without it a bird's-eye
  // figure is genuinely ambiguous — it reads as someone standing up and
  // leaning over, which is the opposite of "lie on your back".
  if (figure.mat) {
    const mat = document.createElementNS(SVG_NS, 'rect');
    mat.setAttribute('x', '8'); mat.setAttribute('y', '18');
    mat.setAttribute('width', '104'); mat.setAttribute('height', '72');
    mat.setAttribute('rx', '8');
    mat.setAttribute('class', 'fig-ground');
    svg.append(mat);
  }

  for (const d of figure.strokes) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }

  const [cx, cy, r] = figure.head;
  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('cx', cx); head.setAttribute('cy', cy); head.setAttribute('r', r);
  svg.append(head);

  return svg;
}
