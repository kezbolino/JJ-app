// The settings that ride along with the notes, and how two devices' copies are
// reconciled.
//
// Entries have synced since v0.1. Everything else — the flashcard deck, your
// starred moves, your belt promotions, every lift and every off-mat routine —
// has lived in one browser's IndexedDB and nowhere else. Library → Export was
// the only backup, and the deck that is the front door of Home existed on
// exactly one phone.
//
// This module is pure: an allowlist, a merge, and a serialiser. It touches no
// storage and no network, which is what lets the merge rules be tested in node
// rather than guessed at.
//
// ---------------------------------------------------------------------------
// Two merge rules, because these are two different kinds of data
// ---------------------------------------------------------------------------
//
//   'whole'  A value you *edit*. The deck, the starred moves, your promotions.
//            Last write wins on the whole value, keyed by when it was last
//            changed. Removing the third card has to survive reaching the other
//            device, and it only can if the newer copy replaces the older one
//            outright.
//
//   'byId'   A log you *append to*. Lifts and finished routines. These are
//            unioned by id: a session logged on the phone and one logged on the
//            laptop must both survive, and last-write-wins would silently throw
//            one away. Where both sides hold the same id, the newer side wins
//            that record.
//
// Nothing in the app deletes a strength or mobility session today. If a delete
// is ever added, union is no longer enough on its own — it will need a
// tombstone, exactly as entry deletion does, or the other device will put it
// straight back. Read the sync notes in CLAUDE.md before adding one.

export const SYNCED_SETTINGS = {
  focuses: 'whole',
  likedMoves: 'whole',
  promotions: 'whole',
  strengthMuted: 'whole',
  strengthSessions: 'byId',
  mobilitySessions: 'byId',
};

// Deliberately absent, so nobody has to guess whether it was an oversight:
//
//   strengthDraft      a lift in progress. Half a session arriving on another
//                      phone mid-workout is worse than not having it.
//   nudgeDismissedOn   "I saw today's nudge" is about this screen, not this
//                      user.
//   ontologyOverrides  already syncs, in its own file, since v0.2.
//   settingsStamps     the bookkeeping below. Never travels; each device keeps
//                      its own view of when it last changed something.
//   sync / syncState / tombstones / lastSyncAt / lastSyncError
//                      credentials and per-device sync bookkeeping. These must
//                      never leave the device — see CLAUDE.md.

export const STATE_PATH = 'app-state.md';

const idOf = record => record?.id ?? null;

/**
 * Reconcile two devices' state. Neither side is authoritative — the newer
 * stamp is, per key.
 *
 * Returns the merged `{ values, stamps }` plus `changed`: the keys whose local
 * value actually moved. The caller writes only those back, so a sync that
 * changes nothing writes nothing.
 */
export function mergeAppState(mine, theirs) {
  const values = {};
  const stamps = {};
  const changed = [];

  for (const [key, rule] of Object.entries(SYNCED_SETTINGS)) {
    const mineHas = key in (mine.values ?? {});
    const theirsHas = key in (theirs.values ?? {});
    const mineAt = mine.stamps?.[key] ?? '';
    const theirsAt = theirs.stamps?.[key] ?? '';

    if (!theirsHas) {
      // They have never had this key. Ours stands; nothing to merge.
      if (mineHas) { values[key] = mine.values[key]; stamps[key] = mineAt; }
      continue;
    }
    if (!mineHas) {
      values[key] = theirs.values[key];
      stamps[key] = theirsAt;
      changed.push(key);
      continue;
    }

    if (rule === 'byId') {
      const merged = unionById(mine.values[key], theirs.values[key], theirsAt > mineAt);
      values[key] = merged;
      // The stamp is the later of the two: the union holds both sides' work, so
      // claiming the older time would make a device that already has all of it
      // look out of date and push the same thing back.
      stamps[key] = theirsAt > mineAt ? theirsAt : mineAt;
      if (!sameJson(merged, mine.values[key])) changed.push(key);
      continue;
    }

    // 'whole': newer wins outright. A tie keeps the local copy — ties happen
    // when neither has changed since the last sync, and doing nothing is right.
    if (theirsAt > mineAt) {
      values[key] = theirs.values[key];
      stamps[key] = theirsAt;
      if (!sameJson(theirs.values[key], mine.values[key])) changed.push(key);
    } else {
      values[key] = mine.values[key];
      stamps[key] = mineAt;
    }
  }

  return { values, stamps, changed };
}

/** Union two lists of records by id, preferring `theirs` on a clash if asked. */
function unionById(mine, theirs, theirsWinsClashes) {
  const a = Array.isArray(mine) ? mine : [];
  const b = Array.isArray(theirs) ? theirs : [];
  const byId = new Map();
  // Records with no id at all can't be reconciled, so they are kept as they
  // are on each side rather than being silently dropped or duplicated.
  const keyFor = (record, side, i) => idOf(record) ?? `${side}:${i}`;

  for (const [i, record] of a.entries()) byId.set(keyFor(record, 'a', i), record);
  for (const [i, record] of b.entries()) {
    const key = keyFor(record, 'b', i);
    if (!byId.has(key) || theirsWinsClashes) byId.set(key, record);
  }
  return [...byId.values()];
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------
//
// This one is JSON in a fenced block, and it is the only file in the backup
// repo that is. Notes are prose with a flat front matter you can read and edit
// by hand; a flashcard deck and a strength session are nested records, and
// inventing a second bespoke grammar for them would mean a second parser to
// keep from rotting. CLAUDE.md's "no YAML, fixed tiny grammar" rule is about
// the *note* format, and it stays exactly as it was.
//
// It is still a .md file with a heading and an explanation, so it reads as
// something on github.com rather than as an unexplained blob.

const FENCE = '```';

export function appStateToMarkdown({ values, stamps }) {
  const payload = { stamps: {}, values: {} };
  // Fixed key order, so an unchanged state always serialises to the same bytes
  // and the push can tell "nothing happened" from "something did".
  for (const key of Object.keys(SYNCED_SETTINGS)) {
    if (!(key in (values ?? {}))) continue;
    payload.values[key] = values[key];
    payload.stamps[key] = stamps?.[key] ?? '';
  }

  // The header date is the newest stamp in the payload, never `now`. The push
  // decides whether to upload by hashing this text, so a clock in it would make
  // the file differ on every sync and commit an identical state forever.
  const updated = Object.values(payload.stamps).sort().pop() ?? '';

  return [
    '---',
    `updated: ${updated}`,
    '---',
    '',
    '# App state',
    '',
    'Your flashcard deck, starred moves, belt promotions and off-mat sessions.',
    'Written by JUJI — edit these in the app, not here.',
    '',
    'This one is machine-written JSON, unlike the notes: these are nested',
    'records rather than the flat fields a note is made of.',
    '',
    FENCE + 'json',
    JSON.stringify(payload, null, 2),
    FENCE,
    '',
  ].join('\n');
}

/** Never throws: a hand-mangled file must not be able to stop a sync. */
export function appStateFromMarkdown(text) {
  const empty = { values: {}, stamps: {} };
  if (typeof text !== 'string') return empty;
  const start = text.indexOf(FENCE + 'json');
  if (start === -1) return empty;
  const from = text.indexOf('\n', start);
  const end = text.indexOf(FENCE, from);
  if (from === -1 || end === -1) return empty;

  let parsed;
  try { parsed = JSON.parse(text.slice(from + 1, end)); } catch { return empty; }
  if (!parsed || typeof parsed !== 'object') return empty;

  // Only keys we know about come back in. A file written by a newer version
  // carrying a key this one has never heard of is ignored rather than stored —
  // storing it would mean writing it back out again as if it were ours.
  const values = {}, stamps = {};
  for (const key of Object.keys(SYNCED_SETTINGS)) {
    if (!parsed.values || !(key in parsed.values)) continue;
    values[key] = parsed.values[key];
    stamps[key] = typeof parsed.stamps?.[key] === 'string' ? parsed.stamps[key] : '';
  }
  return { values, stamps };
}
