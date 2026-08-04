// What to type into YouTube for each movement, and how to tell a hit from a
// miss once results come back.
//
// This file exists because the app's names are written for the app, not for a
// search box: "90/90 lift-off" is clear on screen and useless as a query, and
// "Frog stretch" without the word "hip" returns actual frogs.
//
// Two fields per movement:
//
//   search  the query string. Written plainly — no channel name in here, since
//           channel preference is a *ranking* signal in score.mjs, not a
//           filter baked into the search. Searching "E3 Rehab X" and taking the
//           first result (what the original sketch did) means you never see the
//           better video from someone else.
//
//   terms   groups of words used to check a result is actually the right
//           movement. A group is satisfied if *any* of its alternatives appears
//           in the title, and the score is the fraction of groups satisfied —
//           so "Cossack Squat Tutorial" scores full marks and "Squat Mobility
//           for Beginners" does not.
//
// Keyed by the item ids in js/stretches.js. tests/mobility.test.mjs fails if a
// routine gains a movement with no entry here, or if an entry names an id no
// routine uses — same guard as PENDING_ART in js/stretch-art.js, and for the
// same reason: a typo here would silently search for nothing forever.

export const QUERIES = {
  // --- Rest day: bodyweight end-range strength -----------------------------
  'deep-squat-hold': {
    search: 'deep squat hold mobility exercise',
    terms: [['deep', 'bottom', 'third world', 'asian'], ['squat']],
  },
  'cossack-squat': {
    search: 'cossack squat how to',
    terms: [['cossack'], ['squat']],
  },
  'ninety-ninety-liftoff': {
    search: '90 90 hip lift off exercise',
    terms: [['90/90', '90 90', '9090'], ['lift', 'liftoff', 'lift-off']],
  },
  'glute-bridge-single': {
    search: 'single leg glute bridge how to',
    terms: [['single leg', 'single-leg', 'one leg', 'one-leg'], ['glute'], ['bridge']],
  },
  copenhagen: {
    search: 'copenhagen plank adductor exercise',
    terms: [['copenhagen'], ['plank', 'adductor', 'side plank']],
  },
  'single-leg-rdl': {
    search: 'single leg romanian deadlift bodyweight form',
    terms: [['single leg', 'single-leg', 'one leg', 'one-leg'], ['rdl', 'romanian', 'deadlift']],
  },
  'jefferson-curl': {
    search: 'jefferson curl how to',
    terms: [['jefferson'], ['curl']],
  },
  'thoracic-press-up': {
    search: 'prone press up thoracic extension exercise',
    terms: [['prone', 'thoracic', 'cobra'], ['press up', 'press-up', 'pressup', 'extension']],
  },
  'wall-slide': {
    search: 'scapular wall slide exercise how to',
    terms: [['wall'], ['slide', 'slides']],
  },
  'dead-hang': {
    search: 'dead hang how to shoulder',
    terms: [['dead hang', 'dead-hang', 'deadhang', 'passive hang'], ['hang', 'bar', 'shoulder']],
  },
  'neck-isometric': {
    search: 'neck isometric exercise how to',
    terms: [['neck', 'cervical'], ['isometric', 'isometrics']],
  },
  'bear-crawl': {
    search: 'bear crawl how to form',
    terms: [['bear'], ['crawl', 'crawls', 'crawling']],
  },
  'side-plank': {
    search: 'side plank how to form',
    terms: [['side'], ['plank']],
  },

  // --- After class: passive holds ------------------------------------------
  'neck-side': {
    search: 'lateral neck stretch upper trap how to',
    terms: [['neck', 'trap', 'traps', 'cervical'], ['stretch', 'stretches']],
  },
  'wrist-floor': {
    search: 'kneeling wrist stretch fingers backwards',
    terms: [['wrist', 'wrists', 'forearm'], ['stretch', 'stretches', 'mobility']],
  },
  'childs-pose': {
    search: 'childs pose stretch how to',
    terms: [["child's pose", 'childs pose', 'child pose', 'balasana'], ['pose', 'stretch']],
  },
  'thread-needle': {
    search: 'thread the needle stretch thoracic',
    terms: [['thread'], ['needle']],
  },
  'ankle-rock': {
    search: 'half kneeling ankle dorsiflexion mobility drill',
    terms: [['ankle', 'ankles', 'dorsiflexion'], ['mobility', 'rock', 'rocking', 'stretch', 'drill']],
  },
  'hip-flexor-lunge': {
    search: 'kneeling hip flexor stretch how to',
    terms: [['hip flexor', 'hip flexors', 'psoas', 'couch'], ['stretch', 'lunge', 'kneeling']],
  },
  'quad-kneel': {
    search: 'kneeling quad stretch how to',
    terms: [['quad', 'quads', 'quadriceps'], ['stretch', 'kneeling', 'lunge']],
  },
  pigeon: {
    search: 'pigeon pose stretch how to hip',
    terms: [['pigeon'], ['stretch', 'pose']],
  },
  frog: {
    search: 'frog stretch hip adductor how to',
    terms: [['frog'], ['stretch', 'pose', 'hip', 'adductor']],
  },
  'ninety-ninety': {
    search: '90 90 hip stretch how to',
    terms: [['90/90', '90 90', '9090'], ['hip', 'hips', 'stretch']],
  },
  'seated-fold': {
    search: 'seated forward fold hamstring stretch how to',
    terms: [['seated', 'sitting'], ['forward fold', 'fold', 'bend', 'hamstring']],
  },
  sphinx: {
    search: 'sphinx pose stretch how to',
    terms: [['sphinx'], ['pose', 'stretch', 'extension']],
  },
  'supine-twist': {
    search: 'supine spinal twist stretch how to',
    terms: [['supine', 'lying', 'reclined', 'reclining'], ['twist', 'rotation']],
  },
};
