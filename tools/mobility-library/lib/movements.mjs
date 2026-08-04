// The library's contents, derived from the app's routines.
//
// There is deliberately no second list of exercises here. The 13 files the
// request asks for are exactly the rest-day routine in js/stretches.js, in the
// order it already runs them, so the folder on disk and the screen in your
// pocket cannot drift apart. Add a movement to the routine and it appears here;
// the only thing you owe it is a search query in queries.mjs, and the test
// suite will tell you if you forget.

import { ROUTINES, getRoutine } from '../../../js/stretches.js';
import { QUERIES } from './queries.mjs';

/** The routine the request was about; `--routine post-class` gets the other. */
export const DEFAULT_ROUTINE = 'rest-day';

export const LIBRARY_DIR = 'BJJ Mobility Library';

/** Every routine id, for `mobility list` and for argument checking. */
export function routineIds() {
  return ROUTINES.map(r => r.id);
}

/**
 * Make a name safe to write to disk on any of the three major filesystems,
 * without flattening it into a slug -- these files are for a human to scroll
 * past on a phone, so "90-90 lift-off" beats "90_90_lift_off".
 *
 * `/` and `\` become `-` (that is what turns "90/90" into "90-90"); the other
 * Windows-reserved characters are dropped; curly quotes become straight ones so
 * the name survives a round trip through a shell and a zip file.
 */
export function safeName(name) {
  const cleaned = String(name)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '')
    .replace(/[/\\]/g, '-')
    .replace(/[<>:"|?*]/g, '');
  return Array.from(cleaned)
    .filter(ch => ch.codePointAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
}

/** "01", "02" ... -- zero-padded so the folder sorts in routine order. */
export function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * The library rows for a routine: what to search for, what to call the file.
 *
 * `terms` and `search` come from queries.mjs; everything else comes from the
 * app. A movement with no query entry still appears (so it shows up in `list`
 * and in the test failure) but carries `query: null`, and the search step skips
 * it loudly rather than silently searching for its raw name.
 */
export function movements(routineId = DEFAULT_ROUTINE) {
  const routine = getRoutine(routineId);
  return routine.items.map((item, i) => {
    const q = QUERIES[item.id] ?? null;
    const n = i + 1;
    return {
      n,
      id: item.id,
      name: item.name,
      targets: item.targets,
      cue: item.cue,
      routine: routine.id,
      file: `${pad(n)} ${safeName(item.name)}`,
      query: q ? q.search : null,
      terms: q ? q.terms : [],
    };
  });
}

/** One movement by id, across every routine. Used by `mobility search <id>`. */
export function findMovement(id) {
  for (const r of ROUTINES) {
    const found = movements(r.id).find(m => m.id === id);
    if (found) return found;
  }
  return null;
}

/** Every movement in every routine -- what the drift test walks. */
export function allMovements() {
  return ROUTINES.flatMap(r => movements(r.id));
}
