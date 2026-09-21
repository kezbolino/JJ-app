// Which voice speaks the cues.
//
// Every spoken clip exists once per voice, under `audio/cues/<voice>/<id>.webm`
// — same ids, same meanings, different reading of the same line. The scripts
// are in docs/VOICE-SCRIPTS.md; the id *is* the filename, so a line recorded
// under the wrong name is silent rather than wrong.
//
// A voice is chosen once per session and held for the whole of it. Rolling per
// cue was considered and rejected: two voices trading lines inside one hold —
// one naming the movement, another shouting three seconds later — reads as a
// bug, not as variety.

/** [value, label] — `''` is the default, as in js/appearance.js. */
export const VOICES = [['', 'Mix'], ['snoop', 'Snoop'], ['arnold', 'Arnold']];

/** The voices that actually have a folder of clips. `''` is not one of them. */
export const VOICE_IDS = VOICES.map(([value]) => value).filter(Boolean);

export const DEFAULT_VOICE = 'snoop';

/**
 * Extra takes of a line, per voice: `{ <voice>: { <id>: <how many> } }`.
 *
 * The app asks for a cue by movement id and has always got back exactly one
 * recording, so the same words land every time that movement comes round —
 * 30 movements, every session, forever. This is the record of which ids have
 * been said more than once, so `createVoice` can vary them the way `hype-N`
 * and `other-side-N` already vary.
 *
 * **Take 1 keeps the plain filename.** `<id>.webm` is the first take and
 * `<id>-2.webm`, `<id>-3.webm` the rest — so adding variety renames nothing,
 * re-downloads none of the 134 clips already on the user's phone, and a voice
 * that only ever recorded a line once needs no entry here at all.
 *
 * **It is ragged on purpose, per voice.** Snoop may have three readings of a
 * movement and Arnold one; each player only ever looks up its own voice. What
 * is *not* allowed to be ragged is a movement having no take at all in one
 * voice — that is what PENDING_CUES and its tests are for.
 *
 * Counts here are claims about files on disk, and `tests/stretches.test.mjs`
 * checks both directions: a declared take whose file is missing is silent, and
 * a `-N` file nobody declares is dead weight in the precache. Recording a new
 * take is therefore three things in one commit — the bytes, the number here,
 * and the filename in `sw.js`.
 *
 * Empty until the takes are recorded; the scripts are in
 * docs/VOICE-SCRIPTS.md.
 */
export const CUE_TAKES = {
  snoop: {},
  arnold: {},
};

/**
 * Pick a take, never the one that just played.
 *
 * Pure, and `rand` is injectable, because this is the only part of the audio
 * path that can be checked without ears: the browser caches a decoded clip, so
 * a second play of the same take fires no network request and a test watching
 * requests silently undercounts. Test the choice, not the fetch.
 *
 * Uniform over the others rather than re-rolling until it differs — a re-roll
 * loop is unbounded in principle, and this runs mid-routine.
 *
 * It lives here rather than with the routines because js/voice.js needs it to
 * choose between a movement's takes, and the routine module pulls 146 KB of
 * artwork in behind it. js/stretches.js re-exports it for its own callers.
 */
export function pickCue(count, last, rand = Math.random) {
  // No previous take (start of a session): every one is fair game. Without
  // this branch the skip-over below shifts every result up by one and take 1
  // can never play first.
  if (!(last >= 1 && last <= count)) return 1 + Math.floor(rand() * count);
  const n = 1 + Math.floor(rand() * (count - 1));   // 1..count-1
  return n >= last ? n + 1 : n;                     // skip over `last`
}

/** How many recordings of `id` this voice has. Never fewer than one. */
export function takesFor(voice, id) {
  const n = CUE_TAKES[voice]?.[id];
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/**
 * Where a take lives. Take 1 is the bare id, which is what keeps every clip
 * recorded before this change exactly where it was.
 */
export function cueFile(voice, id, take = 1) {
  return `audio/cues/${voice}/${id}${take > 1 ? `-${take}` : ''}.webm`;
}

/**
 * Resolve a setting to the voice this session will speak in.
 *
 * A named voice is returned as-is, so changing the picker takes effect on the
 * next session with no further state. Only Mix rolls, and it rolls a plain coin
 * rather than alternating strictly: "random per session" is what was asked for,
 * and with exactly two voices a never-repeat rule *is* strict alternation,
 * which is a different thing wearing the same word.
 *
 * Pure, and `rand` is injectable, for the reason `pickCue` in js/stretches.js
 * is: the choice is the only part of the audio path that can be checked without
 * ears. An unknown setting falls back rather than throwing — this is read from
 * storage a user's older version wrote.
 */
export function pickVoice(setting, rand = Math.random) {
  if (VOICE_IDS.includes(setting)) return setting;
  return VOICE_IDS[Math.floor(rand() * VOICE_IDS.length)] ?? DEFAULT_VOICE;
}

/**
 * Movements no voice can say yet — the audio equivalent of PENDING_ART.
 *
 * A missing clip has always been silent by design (`createVoice` swallows the
 * 404, so a movement added without a recording still runs), and that is exactly
 * what makes it invisible: nothing on screen differs. This set is the record of
 * which silences are deliberate. `tests/stretches.test.mjs` asserts every
 * movement in every routine is either recorded in *all* voices or listed here,
 * and that nothing here is already recorded — so a clip that lands without
 * being taken off this list, or a movement quietly added with no line, both
 * fail loudly instead of going missing on half your sessions.
 *
 * Delete an id when its line is recorded in every voice. The scripts belong in
 * docs/VOICE-SCRIPTS.md before anyone sits down at a microphone.
 */
export const PENDING_CUES = new Set([
  // v68's knee routine. Its three warm-up items reuse rest-day ids, so those
  // already have clips in both voices — the session is not mute from the off.
  'goblet-squat',
  'step-down',
  'lateral-step-down',
  'sissy-squat',
  'tib-raise',
  'soleus-raise',
  // v67's two cool-down additions. Two lines to record in both voices when
  // the Pilates batch is done — see docs/VOICE-SCRIPTS.md.
  'wrist-reverse',
  'pec-floor',
  // The Pilates routine (v64), shipped without audio on purpose — the routine
  // works from day one with beeps, and 27 lines × 2 voices is its own job.
  'pil-breathing',
  'pil-pelvic-tilt',
  'pil-head-nod',
  'pil-pelvic-curl',
  'pil-chest-lift',
  'pil-chest-lift-rot',
  'pil-toe-taps',
  'pil-hundred',
  'pil-roll-up',
  'pil-leg-circles',
  'pil-rolling-ball',
  'pil-single-leg-stretch',
  'pil-double-leg-stretch',
  'pil-scissors',
  'pil-lower-lift',
  'pil-criss-cross',
  'pil-teaser',
  'pil-side-kick',
  'pil-clam',
  'pil-side-bend',
  'pil-swan',
  'pil-single-leg-kick',
  'pil-swimming',
  'pil-leg-pull-front',
  'pil-saw',
  'pil-spine-stretch',
  'pil-mermaid',
]);
