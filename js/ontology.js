// The technique ontology, as data.
//
// The whole point: a tag is a (position, role) pair, never a bare word. That is
// what lets the app say "lots on half guard sweeps, nothing on passing it".
// See docs/ONTOLOGY.md — that file is the human-readable source; this is the
// machine copy. Keep them in step.
//
// This is only the *shipped* vocabulary. The user's own corrections — words
// they've taught it, words they've muted — live in js/overrides.js and are
// layered on top at tagging time. Don't edit this file on the user's behalf to
// record a personal preference; that's what overrides are for.

export const ROLES = [
  { id: 'retain',     label: 'Retain',      side: 'bottom' },
  { id: 'sweep',      label: 'Sweep',       side: 'bottom' },
  { id: 'escape',     label: 'Escape',      side: 'bottom' },
  { id: 'pass',       label: 'Pass',        side: 'top' },
  { id: 'maintain',   label: 'Maintain',    side: 'top' },
  { id: 'submit',     label: 'Submit',      side: 'either' },
  { id: 'back-take',  label: 'Back take',   side: 'either' },
  { id: 'transition', label: 'Transition',  side: 'either' },
  { id: 'takedown',   label: 'Takedown',    side: 'standing' },
  { id: 'td-defence', label: 'TD defence',  side: 'standing' },
];

export const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.id, r.label]));

// t(id, label, role, ...aka) — a technique, and the role it belongs to.
const t = (id, label, role, ...aka) => ({ id, label, role, aka });

export const POSITIONS = [
  {
    id: 'standing', label: 'Standing',
    roles: ['takedown', 'td-defence', 'submit'],
    techniques: [
      t('single-leg', 'Single Leg', 'takedown', 'single'),
      t('double-leg', 'Double Leg', 'takedown', 'double'),
      t('body-lock-td', 'Body Lock Takedown', 'takedown', 'body lock takedown'),
      t('ankle-pick', 'Ankle Pick', 'takedown'),
      t('snap-down', 'Snap Down', 'takedown', 'snapdown'),
      t('arm-drag', 'Arm Drag', 'takedown', 'armdrag'),
      t('guard-pull', 'Guard Pull', 'td-defence', 'pulling guard'),
      t('sprawl', 'Sprawl', 'td-defence'),
      t('whizzer', 'Whizzer', 'td-defence', 'overhook'),
    ],
  },
  {
    id: 'closed-guard', label: 'Closed Guard',
    roles: ['retain', 'sweep', 'submit', 'back-take', 'pass'],
    techniques: [
      t('hip-bump', 'Hip Bump', 'sweep', 'hip bump sweep'),
      t('scissor-sweep', 'Scissor Sweep', 'sweep', 'scissor'),
      t('flower-sweep', 'Flower Sweep', 'sweep', 'pendulum sweep'),
      t('armbar-cg', 'Armbar', 'submit', 'arm bar', 'juji gatame'),
      t('triangle', 'Triangle', 'submit', 'triangle choke', 'sankaku'),
      t('kimura-cg', 'Kimura', 'submit'),
      t('omoplata', 'Omoplata', 'submit'),
      t('standing-pass', 'Standing Pass', 'pass', 'stand up pass'),
      t('log-split', 'Log Split', 'pass', 'log splitter'),
    ],
  },
  {
    id: 'half-guard', label: 'Half Guard',
    roles: ['retain', 'sweep', 'submit', 'back-take', 'pass'],
    techniques: [
      t('dogfight', 'Dogfight', 'sweep'),
      t('knee-tap', 'Knee Tap', 'sweep'),
      t('underhook-sweep', 'Underhook Sweep', 'sweep'),
      t('old-school', 'Old School', 'sweep', 'old school sweep'),
      t('electric-chair', 'Electric Chair', 'sweep'),
      t('deep-half', 'Deep Half', 'retain', 'deep half guard'),
      t('lockdown', 'Lockdown', 'retain'),
      t('knee-shield', 'Knee Shield', 'retain', 'z guard', 'z-guard'),
      t('coyote', 'Coyote Guard', 'retain'),
      t('knee-slice', 'Knee Slice', 'pass', 'knee cut', 'knee slide', 'knee through'),
      t('leg-weave', 'Leg Weave', 'pass'),
      t('crossface-pressure', 'Crossface Pressure', 'pass', 'cross face', 'crossface'),
      t('body-lock-pass', 'Body Lock Pass', 'pass', 'over under'),
      t('smash-pass', 'Smash Pass', 'pass'),
    ],
  },
  {
    id: 'open-guard', label: 'Open Guard',
    roles: ['retain', 'sweep', 'submit', 'pass'],
    techniques: [
      t('de-la-riva', 'De La Riva', 'retain', 'dlr'),
      t('reverse-dlr', 'Reverse De La Riva', 'retain', 'rdlr'),
      t('spider-guard', 'Spider Guard', 'retain', 'spider'),
      t('lasso', 'Lasso Guard', 'retain', 'lasso'),
      t('collar-sleeve', 'Collar Sleeve', 'retain'),
      t('butterfly', 'Butterfly Guard', 'retain', 'butterfly'),
      t('x-guard', 'X-Guard', 'retain', 'x guard'),
      t('single-leg-x', 'Single Leg X', 'retain', 'slx', 'ashi'),
      t('shin-to-shin', 'Shin to Shin', 'retain', 'shin on shin'),
      t('k-guard', 'K-Guard', 'retain', 'k guard'),
      t('fifty-fifty', '50/50', 'retain', '50 50', 'fifty fifty'),
      t('butterfly-sweep', 'Butterfly Sweep', 'sweep', 'butterfly elevation'),
      t('toreando', 'Toreando', 'pass', 'bullfighter', 'torreando'),
      t('long-step', 'Long Step', 'pass'),
      t('leg-drag', 'Leg Drag', 'pass'),
      t('headquarters', 'Headquarters', 'pass', 'hq'),
      t('stack-pass', 'Stack Pass', 'pass', 'stack'),
    ],
  },
  {
    id: 'side-control', label: 'Side Control',
    roles: ['escape', 'maintain', 'submit', 'transition'],
    techniques: [
      t('frame-shrimp', 'Frame & Shrimp', 'escape', 'shrimp', 'shrimping'),
      t('ghost-escape', 'Ghost Escape', 'escape'),
      t('underhook-recovery', 'Underhook Recovery', 'escape'),
      t('bridge-roll-sc', 'Bridge & Roll', 'escape'),
      t('kimura-sc', 'Kimura', 'submit'),
      t('americana', 'Americana', 'submit', 'keylock', 'figure four'),
      t('arm-triangle', 'Arm Triangle', 'submit', 'head and arm'),
      t('baseball-choke', 'Baseball Choke', 'submit'),
    ],
  },
  {
    id: 'north-south', label: 'North South',
    roles: ['escape', 'maintain', 'submit'],
    techniques: [
      t('ns-choke', 'North South Choke', 'submit'),
      t('kimura-ns', 'Kimura', 'submit'),
    ],
  },
  {
    id: 'knee-on-belly', label: 'Knee on Belly',
    roles: ['escape', 'maintain', 'submit'],
    techniques: [
      t('far-side-armbar', 'Far Side Armbar', 'submit'),
      t('kob-escape', 'Knee on Belly Escape', 'escape'),
    ],
  },
  {
    id: 'mount', label: 'Mount',
    roles: ['escape', 'maintain', 'submit', 'transition'],
    techniques: [
      t('upa', 'Upa', 'escape', 'bridge and roll', 'bridge & roll'),
      t('elbow-knee', 'Elbow Knee Escape', 'escape', 'elbow escape'),
      t('hip-heist', 'Hip Heist', 'escape'),
      t('armbar-mount', 'Armbar', 'submit'),
      t('cross-collar', 'Cross Collar Choke', 'submit', 'cross choke'),
      t('ezekiel', 'Ezekiel', 'submit'),
      t('s-mount', 'S-Mount', 'maintain', 's mount'),
      t('gift-wrap', 'Gift Wrap', 'maintain'),
    ],
  },
  {
    id: 'back', label: 'Back Control',
    roles: ['escape', 'maintain', 'submit'],
    techniques: [
      t('rnc', 'Rear Naked Choke', 'submit', 'rnc', 'mata leao', 'mata leão'),
      t('bow-arrow', 'Bow & Arrow', 'submit', 'bow and arrow'),
      t('body-triangle', 'Body Triangle', 'maintain'),
      t('short-choke', 'Short Choke', 'submit'),
      t('back-escape', 'Back Escape', 'escape', 'scoot and shrug'),
    ],
  },
  {
    id: 'turtle', label: 'Turtle',
    roles: ['escape', 'retain', 'maintain', 'back-take', 'submit'],
    techniques: [
      t('granby', 'Granby Roll', 'escape', 'granby'),
      t('sit-out', 'Sit Out', 'escape', 'sitout'),
      t('peek-out', 'Peek Out', 'escape'),
      t('clock-choke', 'Clock Choke', 'submit'),
      t('seat-belt', 'Seat Belt', 'back-take', 'seatbelt'),
      t('hooks-in', 'Hooks In', 'back-take'),
    ],
  },
  {
    id: 'front-headlock', label: 'Front Headlock',
    roles: ['submit', 'back-take', 'transition'],
    techniques: [
      t('guillotine', 'Guillotine', 'submit'),
      t('darce', "D'Arce", 'submit', 'darce', 'd arce'),
      t('anaconda', 'Anaconda', 'submit'),
      t('peruvian', 'Peruvian Necktie', 'submit'),
    ],
  },
  {
    id: 'legs', label: 'Leg Entanglements',
    roles: ['submit', 'transition', 'escape'],
    techniques: [
      t('ashi', 'Ashi Garami', 'transition', 'ashi garami'),
      t('outside-ashi', 'Outside Ashi', 'transition'),
      t('saddle', 'Saddle', 'transition', '411', 'honey hole', 'inside sankaku'),
      t('straight-ankle', 'Straight Ankle Lock', 'submit', 'ankle lock'),
      t('heel-hook', 'Heel Hook', 'submit', 'heelhook'),
      t('kneebar', 'Kneebar', 'submit', 'knee bar'),
      t('toe-hold', 'Toe Hold', 'submit', 'toehold'),
      t('leg-escape', 'Leg Lock Escape', 'escape', 'hitchhiker', 'boot removal'),
    ],
  },
];

export const CONCEPTS = [
  'Pressure', 'Connection', 'Frames', 'Inside Position', 'Angle', 'Base',
  'Posture', 'Grips', 'Hip Position', 'Head Position', 'Weight Distribution',
  'Timing', 'Head and Arm Control', 'Underhooks', 'Levers',
];

// ---- lookups -------------------------------------------------------------

export const POSITION_BY_ID = Object.fromEntries(POSITIONS.map(p => [p.id, p]));

export const TECHNIQUE_BY_ID = {};
for (const p of POSITIONS) {
  for (const tech of p.techniques) {
    // Technique ids are unique per position, but a few names repeat across
    // positions (kimura, armbar). Key on position to keep them distinct.
    TECHNIQUE_BY_ID[`${p.id}/${tech.id}`] = { ...tech, position: p.id };
  }
}

export function positionLabel(id) {
  return POSITION_BY_ID[id]?.label ?? id;
}

export function techniqueLabel(positionId, techniqueId) {
  return TECHNIQUE_BY_ID[`${positionId}/${techniqueId}`]?.label ?? techniqueId;
}

/** Roles a position actually supports, in canonical order. */
export function rolesFor(positionId) {
  const pos = POSITION_BY_ID[positionId];
  if (!pos) return [];
  return ROLES.filter(r => pos.roles.includes(r.id));
}
