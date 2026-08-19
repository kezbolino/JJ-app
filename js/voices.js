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
