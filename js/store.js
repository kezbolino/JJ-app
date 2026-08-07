// Data model and the queries the views ask of it.

import * as db from './db.js';
import { POSITIONS, POSITION_BY_ID, ROLE_LABEL, rolesFor } from './ontology.js';
import { tagKey } from './tagger.js';
import { SYNCED_SETTINGS } from './appstate.js';
import { suggestMoves, moveKey } from './moves.js';
import {
  localISO, todayISO, addDays, weekOf, dayOfWeek, daysBetween,
  monthOf, recentMonths, MONTH_NAMES,
} from './dates.js';

export const ENTRY_TYPES = ['class', 'note', 'question', 'video', 'principle'];

// `SESSION_TYPES` (open mat / competition / private / seminar) lived here until
// v22, when the user asked for the picker to go. A class is a class; gi vs no-gi
// is the only thing the model still says about what kind of session it was.

/**
 * An entry is the single unit of everything: a class journal, a stray note, a
 * question, a saved video, a coach principle. One shape, one store, one search.
 *
 * {
 *   id, type, date: 'YYYY-MM-DD',
 *   gi: 'gi' | 'nogi' | null,
 *   title,
 *   sections: { techniques, rolling, thoughts },   // class entries
 *   body,                                          // free text / joined sections
 *   tags: [{kind:'pos', position, role, technique} | {kind:'concept', concept}],
 *   video: { videoId, url, title, thumb } | null,
 *   related: [entryId],           // links you drew to other entries
 *   deletedAt: ISO | null,        // in the trash, recoverable
 *   createdAt, updatedAt
 * }
 *
 * `sections.rolling` is labelled **Key details** in the form and in the backup
 * files; it was called "Rolling notes" up to v20. The storage key kept its old
 * name deliberately — renaming it would mean migrating every row already in
 * IndexedDB on the user's phone for the sake of a word, and a migration that
 * goes wrong loses notes. `js/markdown.js` still parses the old heading.
 */
export function newEntry(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'class',
    date: todayISO(),
    gi: null,
    title: '',
    sections: { techniques: '', rolling: '', thoughts: '' },
    body: '',
    tags: [],
    video: null,
    related: [],
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

// Dates live in js/dates.js and are always the user's local date, never UTC.
// Re-exported because half the app reaches for `store.todayISO()`.
export { localISO, todayISO };

/** Everything typed into an entry, as one string — for tagging and search. */
export function entryText(entry) {
  const s = entry.sections ?? {};
  return [entry.title, s.techniques, s.rolling, s.thoughts, entry.body]
    .filter(Boolean).join('\n');
}

export async function saveEntry(entry) {
  if (entry.type === 'class') entry.body = entryText({ ...entry, body: '' }).trim();
  entry.updatedAt = new Date().toISOString();
  await db.put('entries', entry);
  return entry;
}

/**
 * Write without touching `updatedAt`.
 *
 * Sync needs this. Merge order is decided by `updatedAt`, so bookkeeping
 * writes — recording what we last pushed, or storing an entry pulled from the
 * repo — must not restamp it, or every entry looks permanently newer than its
 * remote copy and the two devices push at each other forever.
 */
export async function putEntryRaw(entry) {
  await db.put('entries', entry);
  return entry;
}

export const getEntry = id => db.get('entries', id);

/** How long a trashed entry is kept before it is really gone. */
export const TRASH_DAYS = 30;

/**
 * Delete — into the trash, not off a cliff.
 *
 * The row stays, marked with `deletedAt`, and drops out of `allEntries()`, so
 * every view and the sync push stop seeing it immediately: the note leaves the
 * backup repo exactly as it did before. What is new is that the text is still
 * here for 30 days, so a mis-tap is recoverable without going and reading the
 * data repo's git history.
 *
 * The tombstone is still written at this moment, and still means "remove this
 * file from the repo". The trash is a **local** undo buffer — another device
 * pulling this deletion applies it for real. That asymmetry is deliberate:
 * making the trash itself sync would mean deleted notes lingering in the repo,
 * which is the opposite of what deleting is for.
 */
export async function deleteEntry(id) {
  const entry = await getEntry(id);
  if (!entry) return;
  await db.put('entries', { ...entry, deletedAt: new Date().toISOString() });
  if (entry.syncPath) {
    const tombstones = await getSetting('tombstones', {});
    tombstones[id] = { path: entry.syncPath, at: new Date().toISOString() };
    await setSetting('tombstones', tombstones);
  }
}

/**
 * Take an entry back out of the trash.
 *
 * The sync bookkeeping is cleared, not kept: by now the file may already have
 * been deleted from the repo, and push only re-uploads an entry whose path or
 * content hash has changed. An entry that came back with its old `syncPath`
 * and `syncHash` intact would look already-backed-up and would never be
 * written again.
 */
export async function restoreEntry(id) {
  const entry = await getEntry(id);
  if (!entry) return null;
  const { syncPath, syncHash, syncBlob, ...rest } = entry;
  const restored = { ...rest, deletedAt: null, updatedAt: new Date().toISOString() };
  await db.put('entries', restored);
  const tombstones = await getSetting('tombstones', {});
  if (tombstones[id]) { delete tombstones[id]; await setSetting('tombstones', tombstones); }
  return restored;
}

/** Really delete — from the trash, or when applying someone else's deletion. */
export const removeEntryRaw = id => db.del('entries', id);

const byNewest = (a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt);

/** Every row, trash included. Sync needs this; views should not use it. */
export async function allEntriesRaw() {
  return (await db.getAll('entries')).sort(byNewest);
}

/** All live entries, newest first. Trashed ones are not here. */
export async function allEntries() {
  return (await allEntriesRaw()).filter(e => !e.deletedAt);
}

/** What's in the trash, most recently deleted first. */
export async function trashedEntries() {
  return (await allEntriesRaw())
    .filter(e => e.deletedAt)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Days left before a trashed entry is purged (0 = due now). */
export const trashDaysLeft = entry =>
  Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(entry.deletedAt)) / 864e5));

/**
 * Drop anything that has sat in the trash past its 30 days. Called on boot;
 * the repo copy went at delete time, so this is the last copy going.
 */
export async function purgeTrash() {
  let purged = 0;
  for (const entry of await trashedEntries()) {
    if (trashDaysLeft(entry) <= 0) { await removeEntryRaw(entry.id); purged++; }
  }
  return purged;
}

// ---- settings ------------------------------------------------------------

export async function getSetting(key, fallback) {
  const row = await db.get('settings', key);
  return row === undefined ? fallback : row.value;
}

/**
 * Write a setting, and — for the ones that sync — record *when*.
 *
 * The stamp is the merge key, exactly as `updatedAt` is for an entry, and it
 * carries the same trap. **Never use `setSetting` for sync bookkeeping; use
 * `putSettingRaw`.** Restamping while applying what the repo sent makes the
 * local copy look permanently newer than the remote one, so two devices push
 * the same value at each other forever. This is the settings-shaped version of
 * the `saveEntry` / `putEntryRaw` rule in CLAUDE.md.
 */
export async function setSetting(key, value) {
  await db.put('settings', { key, value });
  if (SYNCED_SETTINGS[key]) await stampSetting(key, new Date().toISOString());
}

const STAMPS_KEY = 'settingsStamps';

/** When each synced setting last changed on *this* device. Never leaves it. */
export async function getSettingStamps() {
  const row = await db.get('settings', STAMPS_KEY);
  return row?.value && typeof row.value === 'object' ? row.value : {};
}

// Written through db.put rather than setSetting, or stamping would recurse.
async function stampSetting(key, at) {
  const stamps = await getSettingStamps();
  await db.put('settings', { key: STAMPS_KEY, value: { ...stamps, [key]: at } });
}

/**
 * Apply a value that came from the repo, keeping the remote's timestamp.
 * The sync's only writer — see the warning on `setSetting`.
 */
export async function putSettingRaw(key, value, at) {
  await db.put('settings', { key, value });
  if (SYNCED_SETTINGS[key]) await stampSetting(key, at ?? '');
}

/** The synced settings as they stand, for handing to `mergeAppState`. */
export async function readAppState() {
  const values = {};
  for (const key of Object.keys(SYNCED_SETTINGS)) {
    const row = await db.get('settings', key);
    if (row !== undefined) values[key] = row.value;
  }
  return { values, stamps: await getSettingStamps() };
}

// "Things you're working on" — flashcards. Each is { front, back }: front is
// the thing (e.g. "half guard passing"), back is your cues/notes to drill.
// Stored as objects, but old installs saved plain strings, so normalise on read
// and never assume the shape coming out of IndexedDB.
// A card is just { front, back }. Old installs may hold a bare string from
// before the deck had two sides, so normalising on read has to cope with that.
//
// v20 removed the spaced-repetition schedule that used to live here too. It
// was driven by an Again/Good/Easy rating after each flip, and once that
// prompt went there was nothing left to feed the scheduler — a scheduler with
// no input is not a gentler scheduler, it is a dead one. Cards that still
// carry the old `due`/`ease`/`interval` keys simply drop them here.
export function normalizeFocus(f) {
  if (typeof f === 'string') return { front: f, back: '' };
  return { front: String(f?.front ?? ''), back: String(f?.back ?? '') };
}

export async function getFocuses() {
  const list = await getSetting('focuses', []);
  return (Array.isArray(list) ? list : []).map(normalizeFocus).filter(f => f.front);
}
export const setFocuses = list => setSetting('focuses', list.map(normalizeFocus));

// ---- belt ----------------------------------------------------------------
// Promotions the user has actually been given: [{ rank, date }]. The app does
// not infer, estimate or predict a rank — it only repeats what you told it,
// alongside a count of the classes you have logged since. Time-to-next-belt is
// deliberately absent: that is somebody else's decision, not a number.

export const getPromotions = () => getSetting('promotions', []);
export const setPromotions = list => setSetting('promotions',
  [...list].filter(p => p?.rank && p?.date).sort((a, b) => a.date.localeCompare(b.date)));

/** Current rank, when it was awarded, and classes logged since. null if unset. */
export function beltStanding(entries, promotions) {
  const list = [...(promotions ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const current = list[list.length - 1];
  if (!current) return null;
  const since = entries.filter(e => e.type === 'class' && e.date >= current.date).length;
  return { rank: current.rank, date: current.date, classesSince: since, history: list };
}

// Liked moves — the seed for "Your game" suggestions. A move is { position,
// technique }. Stored as a setting, and synced since v46 — see
// js/appstate.js, which owns the list of which settings travel and how.
export const getLikedMoves = () => getSetting('likedMoves', []);
export const setLikedMoves = list => setSetting('likedMoves', list);

/** Star or unstar a move; returns the new list. */
export async function toggleLikedMove(move) {
  const liked = await getLikedMoves();
  const has = liked.some(m => moveKey(m) === moveKey(move));
  const next = has
    ? liked.filter(m => moveKey(m) !== moveKey(move))
    : [...liked, { position: move.position, technique: move.technique }];
  await setLikedMoves(next);
  return next;
}

// ---- strength sessions ----------------------------------------------------
// The once-a-week bodyweight lift (js/strength.js). Kept as settings rows, not
// as `entries`, and that is a deliberate call worth knowing about:
//
//   - An entry's backup format is a **fixed tiny grammar** of front-matter
//     scalars and inline lists (js/markdown.js). A session is an array of
//     exercises each holding an array of sets — there is no honest way to write
//     that in that grammar, and adding YAML to do it is exactly what
//     CLAUDE.md says not to do.
//   - Settings ride along in Library → Export/Import for free, and are not on
//     the DEVICE_LOCAL_SETTINGS skip list, so a restored phone gets the log
//     back.
//
// They **do** sync, as of v46 — not as notes, but in `app-state.md`, unioned by
// id so a session logged on the phone and one logged on the laptop both
// survive. js/appstate.js explains why that is a union and the deck is not.
// Nothing here deletes a session; if that is ever added it needs a tombstone,
// or the other device puts it straight back.

/** Every completed session, oldest first. */
export async function getStrengthSessions() {
  const list = await getSetting('strengthSessions', []);
  return Array.isArray(list) ? [...list].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)) : [];
}

export const setStrengthSessions = list => setSetting('strengthSessions', list);

/**
 * The session currently being worked through, or null.
 *
 * A lift runs over an hour and gets logged set by set, so it has to survive the
 * app being closed, the phone locking, and the router clearing the screen. It
 * is written back on every tap rather than held in memory.
 */
export const getStrengthDraft = () => getSetting('strengthDraft', null);
export const setStrengthDraft = draft => setSetting('strengthDraft', draft);
export const clearStrengthDraft = () => setSetting('strengthDraft', null);

/** File a finished session and clear the draft. Returns the new list. */
export async function saveStrengthSession(session) {
  const sessions = await getStrengthSessions();
  const next = [...sessions.filter(s => s.id !== session.id), session];
  await setStrengthSessions(next);
  await clearStrengthDraft();
  return next;
}

// ---- mobility sessions ----------------------------------------------------
// A finished cool-down or rest-day routine. Same storage call as strength
// sessions and the same trade-off: a settings row, so it rides along in
// Export/Import and does not yet sync to the notes repo.
//
// These are **not** classes and must never be counted as one. A cool-down is
// something you did after training, not training; the calendar marks it apart
// and no class count, streak or coverage figure reads this list.

export async function getMobilitySessions() {
  const list = await getSetting('mobilitySessions', []);
  return Array.isArray(list) ? list : [];
}

/** Record a finished routine. One row per routine per day — going again on the
 *  same evening is the same session as far as the calendar is concerned. */
export async function logMobilitySession(routineId, date = todayISO()) {
  const sessions = await getMobilitySessions();
  if (sessions.some(s => s.date === date && s.routine === routineId)) return sessions;
  const next = [...sessions, { id: `mb-${date}-${routineId}`, date, routine: routineId }];
  await setSetting('mobilitySessions', next);
  return next;
}

/** Exercises muted while something is sore — skipped, without skipping the lot. */
export const getMutedExercises = () => getSetting('strengthMuted', []);
export async function toggleMutedExercise(id) {
  const muted = await getMutedExercises();
  const next = muted.includes(id) ? muted.filter(m => m !== id) : [...muted, id];
  await setSetting('strengthMuted', next);
  return next;
}

/**
 * Classes and lifts in one week's count.
 *
 * The honest version of a load metric: it counts sessions, which is a fact, and
 * says nothing about intensity, which it cannot know. Same rule as coverage —
 * the app reports what was written down, never how hard you worked.
 */
export function weekLoad(entries, strengthSessions, today = todayISO()) {
  const since = addDays(today, -6);
  const inWeek = d => d >= since && d <= today;
  return {
    classes: entries.filter(e => e.type === 'class' && inWeek(e.date)).length,
    lifts: (strengthSessions ?? []).filter(s => inWeek(s.date)).length,
  };
}

// ---- queries -------------------------------------------------------------

const daysAgo = n => addDays(todayISO(), -n);

export function countClasses(entries) {
  const classes = entries.filter(e => e.type === 'class');
  const week = daysAgo(7), month = daysAgo(30);
  return {
    week: classes.filter(e => e.date >= week).length,
    month: classes.filter(e => e.date >= month).length,
    total: classes.length,
  };
}

/** Gi vs no-gi split across class entries that recorded one. null if none did. */
export function giRatio(entries) {
  const withGi = entries.filter(e => e.type === 'class' && (e.gi === 'gi' || e.gi === 'nogi'));
  if (!withGi.length) return null;
  const gi = withGi.filter(e => e.gi === 'gi').length;
  return { gi, nogi: withGi.length - gi, pct: Math.round((gi / withGi.length) * 100) };
}

/**
 * Entries not yet mirrored to the backup repo: never pushed (no syncPath), or
 * edited since the last sync. Only meaningful once sync is configured.
 */
export function pendingSync(entries, lastSyncAt) {
  return entries.filter(e =>
    !e.syncPath || (lastSyncAt && e.updatedAt && e.updatedAt > lastSyncAt)).length;
}

/** A backup this old is a problem whether or not anything reported an error. */
export const SYNC_STALE_DAYS = 7;

/**
 * Is the backup actually working? Pure, so the thresholds are testable.
 *
 * `pendingSync` above answers "is there anything waiting", which is normal and
 * happens every time you write a note. This answers the different and much more
 * serious question "has the mirror stopped moving" — a token expires (GitHub
 * caps fine-grained PATs at a year and they can be revoked sooner), the daily
 * sync fails quietly from then on, and the only local copy of the journal is
 * one phone. Silence is not evidence that it worked.
 *
 *   off      — sync isn't set up; nothing to report
 *   failing  — the last attempt threw
 *   stale    — nothing has succeeded in a week (or ever)
 *   ok       — synced recently
 */
export function syncHealth({ configured, lastSyncAt, lastError, today = todayISO() } = {}) {
  if (!configured) return { state: 'off', message: null };
  if (lastError) {
    return { state: 'failing', message: `Backup failed — ${lastError.message}` };
  }
  if (!lastSyncAt) {
    return { state: 'stale', message: 'Nothing has been backed up yet.' };
  }
  const since = lastSyncAt.slice(0, 10);
  const days = daysBetween(since, today);
  if (days >= SYNC_STALE_DAYS) {
    return { state: 'stale', message: `Not backed up since ${shortDate(since)}.` };
  }
  return { state: 'ok', message: null };
}

/** '2026-07-24' → '24 Jul'. Local to this file; the views have their own. */
function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1].slice(0, 3)}`;
}

/**
 * Coverage: how many entries touch each (position, role) cell.
 * This is the matrix everything downstream reads — the pentagon, the gap
 * prompts, the technique pages.
 */
export function coverage(entries) {
  const map = {};
  for (const pos of POSITIONS) {
    map[pos.id] = { total: 0, roles: Object.fromEntries(pos.roles.map(r => [r, 0])) };
  }
  for (const entry of entries) {
    const seen = new Set();
    for (const tag of entry.tags ?? []) {
      if (tag.kind !== 'pos') continue;
      const cell = map[tag.position];
      if (!cell) continue;
      // Count a position once per entry, even if several of its techniques
      // are mentioned — otherwise a detailed entry outweighs five sparse ones.
      if (!seen.has(tag.position)) { cell.total++; seen.add(tag.position); }
      const roleKey = `${tag.position}/${tag.role}`;
      if (tag.role && cell.roles[tag.role] !== undefined && !seen.has(roleKey)) {
        cell.roles[tag.role]++;
        seen.add(roleKey);
      }
    }
  }
  return map;
}

/**
 * Coverage gaps: a role with nothing in it, sitting next to a role with plenty,
 * on the same position.
 *
 * This is deliberately a claim about your *notes*, not your *skill* — "you've
 * written a lot about half guard sweeps, how's your half guard passing?" We
 * cannot know what you're good at, only what you've written down.
 */
export function findGaps(entries, { minFilled = 3 } = {}) {
  const cov = coverage(entries);
  const gaps = [];
  for (const pos of POSITIONS) {
    const cell = cov[pos.id];
    if (!cell.total) continue;
    const counts = Object.entries(cell.roles);
    const filled = counts.filter(([, n]) => n >= minFilled);
    const empty = counts.filter(([, n]) => n === 0);
    if (!filled.length || !empty.length) continue;
    const [topRole, topCount] = filled.sort((a, b) => b[1] - a[1])[0];
    for (const [emptyRole] of empty) {
      gaps.push({ position: pos.id, filledRole: topRole, filledCount: topCount, emptyRole });
    }
  }
  return gaps.sort((a, b) => b.filledCount - a.filledCount);
}

/** What the gym has actually been drilling, read back off your own entries. */
export function recentThemes(entries, lastN = 5) {
  const classes = entries.filter(e => e.type === 'class').slice(0, lastN);
  const tally = {};
  for (const entry of classes) {
    const seen = new Set();
    for (const tag of entry.tags ?? []) {
      if (tag.kind !== 'pos' || seen.has(tag.position)) continue;
      seen.add(tag.position);
      tally[tag.position] = (tally[tag.position] ?? 0) + 1;
    }
  }
  return {
    classes: classes.length,
    themes: Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([position, count]) => ({ position, count })),
  };
}

export function entriesForPosition(entries, positionId, role = null) {
  return entries.filter(e =>
    (e.tags ?? []).some(t =>
      t.kind === 'pos' && t.position === positionId && (!role || t.role === role))
  );
}

/**
 * Everything a tag knows, as words. Position, technique and role — not just the
 * position, which is all this used to match.
 *
 * The difference shows up exactly where the override system is meant to help:
 * teach the app that your gym's "the shoulder thing" means Kimura, write that
 * phrase in a note, then search "kimura". The app knows the entry is about a
 * Kimura; before this it wouldn't say so. Hand-added tags had the same blind
 * spot — nothing about them is in the body text at all.
 */
function tagWords(tag) {
  if (tag.kind === 'concept') return tag.concept ?? '';
  const pos = POSITION_BY_ID[tag.position];
  const technique = tag.technique && pos?.techniques.find(t => t.id === tag.technique);
  return [pos?.label ?? tag.position, technique?.label, ROLE_LABEL[tag.role]]
    .filter(Boolean).join(' ');
}

export function search(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries.filter(e => {
    if (`${e.title} ${e.body}`.toLowerCase().includes(q)) return true;
    return (e.tags ?? []).some(t => tagWords(t).toLowerCase().includes(q));
  });
}

/** Positions that have anything at all, busiest first. */
export function activePositions(entries) {
  const cov = coverage(entries);
  return POSITIONS
    .map(p => ({ ...p, count: cov[p.id].total, roles: cov[p.id].roles }))
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---- attendance over time ------------------------------------------------
// All of this is derived from `entry.date` alone. Attendance is a fact — you
// were there or you weren't — so unlike coverage it needs no hedging, and
// unlike coverage it says something real in week one. That is the point: it is
// the part of the app that works before there is any history to read.

/**
 * date → what happened that day. The calendar grid reads this.
 *
 * Strength sessions land in the same index as classes, marked separately, so
 * the one calendar shows everything you did rather than making the lift a
 * second calendar somewhere else. A day can hold both, and often should: the
 * rule the programme is built on is lift *after* jiu jitsu, never before.
 */
export function trainingIndex(entries, strengthSessions = [], mobilitySessions = []) {
  const index = new Map();
  const dayFor = date => {
    const day = index.get(date) ?? { count: 0, gi: 0, nogi: 0, lifts: 0, mobility: 0, ids: [] };
    index.set(date, day);
    return day;
  };

  for (const entry of entries) {
    if (entry.type !== 'class') continue;
    const day = dayFor(entry.date);
    day.count++;
    if (entry.gi === 'gi') day.gi++;
    if (entry.gi === 'nogi') day.nogi++;
    day.ids.push(entry.id);
  }
  for (const session of strengthSessions) dayFor(session.date).lifts++;
  for (const session of mobilitySessions) dayFor(session.date).mobility++;
  return index;
}

/**
 * Streaks, counted in **weeks trained**, not consecutive days.
 *
 * A day streak is the wrong shape for this sport. Nobody trains seven days a
 * week, so a daily streak breaks every single week and stops meaning anything;
 * worse, it punishes exactly the rest days that make training sustainable. A
 * week counts if it holds at least one class, which is a target a Tuesday /
 * Thursday practitioner actually hits.
 *
 * The current week never breaks the streak, because it isn't over yet.
 */
export function weekStreak(entries, today = todayISO()) {
  const weeks = new Set(
    entries.filter(e => e.type === 'class').map(e => weekOf(e.date)));
  if (!weeks.size) return { current: 0, longest: 0, weeksTrained: 0 };

  let longest = 0, run = 0, previous = null;
  for (const week of [...weeks].sort()) {
    run = previous && daysBetween(previous, week) === 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = week;
  }

  let cursor = weekOf(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);   // this week is still open
  let current = 0;
  while (weeks.has(cursor)) { current++; cursor = addDays(cursor, -7); }

  return { current, longest, weeksTrained: weeks.size };
}

/**
 * A missed training day, or null.
 *
 * The honest version of a reminder. There is no notification here — Chrome's
 * web push needs Google's push service, and this phone is de-Googled, so a
 * scheduled notification is not a promise this app can keep (see
 * docs/ENHANCEMENTS.md §7). Instead: when you open the app, if a day you
 * usually train has gone by unlogged, say so and offer to log it.
 *
 * "Usually" is read off your own last eight weeks — a weekday you trained at
 * least twice. Below six classes there is no pattern to speak of and it stays
 * quiet rather than guessing.
 */
export function logNudge(entries, today = todayISO()) {
  const classes = entries.filter(e => e.type === 'class');
  if (classes.length < 6) return null;

  const since = addDays(today, -56);
  const tally = {};
  for (const entry of classes) {
    if (entry.date < since) continue;
    const day = dayOfWeek(entry.date);
    tally[day] = (tally[day] ?? 0) + 1;
  }
  const usual = new Set(Object.entries(tally).filter(([, n]) => n >= 2).map(([d]) => Number(d)));
  if (!usual.size) return null;

  const logged = new Set(classes.map(e => e.date));
  // From yesterday backwards: today isn't missed until it's over.
  for (let back = 1; back <= 7; back++) {
    const date = addDays(today, -back);
    if (usual.has(dayOfWeek(date)) && !logged.has(date)) return { date };
  }
  return null;
}

// ---- attention over time --------------------------------------------------
// Everything above this line is all-time or a fixed recent window, and that is
// the largest gap against what this app is for: `docs/VISION.md` is about
// patterns in your game *over years*. Attention accumulates and never decays,
// so two years in, a player who has rebuilt their whole game around leg
// entanglements still sees a map dominated by the closed guard they drilled in
// year one. These two queries are the time dimension.
//
// Same discipline as the rest of the map: this is attention over time, never
// skill over time. A position fading out means you stopped writing about it.

/** Classes per calendar month, oldest first, including months with none. */
export function monthlyClasses(entries, { months = 6, today = todayISO() } = {}) {
  const counts = {};
  for (const entry of entries) {
    if (entry.type !== 'class') continue;
    const ym = monthOf(entry.date);
    counts[ym] = (counts[ym] ?? 0) + 1;
  }
  return recentMonths(months, today).map(month => ({ month, count: counts[month] ?? 0 }));
}

/**
 * The busiest positions, each with its month-by-month entry count.
 *
 * A position is counted once per entry however many of its techniques were
 * tagged — same rule as `recentThemes`, so a note that names four half guard
 * sweeps doesn't read as four sessions of half guard.
 *
 * `total` is over the window, not all time, because the ranking should answer
 * "what have you been on lately", not "what have you ever done".
 */
export function attentionDrift(entries, { months = 6, top = 5, today = todayISO() } = {}) {
  const window = recentMonths(months, today);
  const inWindow = new Set(window);
  const byPosition = {};

  for (const entry of entries) {
    const ym = monthOf(entry.date ?? '');
    if (!inWindow.has(ym)) continue;
    const seen = new Set();
    for (const tag of entry.tags ?? []) {
      if (tag.kind !== 'pos' || seen.has(tag.position)) continue;
      seen.add(tag.position);
      const row = byPosition[tag.position] ??= { counts: {}, total: 0 };
      row.counts[ym] = (row.counts[ym] ?? 0) + 1;
      row.total++;
    }
  }

  return Object.entries(byPosition)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, top)
    .map(([position, row]) => ({
      position,
      label: POSITION_BY_ID[position]?.label ?? position,
      total: row.total,
      months: window.map(month => ({ month, count: row.counts[month] ?? 0 })),
    }));
}

// Two queries about the *kind* of session lived here and are gone:
// `rollStats` (v21 — rounds rolled and a 1–5 self-report) and `sessionCounts`
// (v22 — the split across open mat / competition / private / seminar). Both went
// with the form fields that fed them, at the user's request. Nothing reads
// `entry.rounds`, `entry.feel` or `entry.session` any more.

// ---- links between entries ------------------------------------------------
// Tags connect an entry to a *position*. These connect an entry to another
// entry — "this is the same problem as three weeks ago" — which is the part of
// the vision's knowledge graph that tags alone can never express.

/** Entries that link *to* this one. The other half of a link. */
export const backlinksFor = (entries, id) =>
  entries.filter(e => (e.related ?? []).includes(id));

/** Both directions at once, deduped — what the entry is connected to. */
export function linkedEntries(entries, entry) {
  if (!entry) return [];
  const byId = new Map(entries.map(e => [e.id, e]));
  const seen = new Set([entry.id]);
  const out = [];
  for (const id of entry.related ?? []) {
    const other = byId.get(id);
    if (other && !seen.has(id)) { seen.add(id); out.push({ entry: other, direction: 'out' }); }
  }
  for (const other of backlinksFor(entries, entry.id)) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    out.push({ entry: other, direction: 'in' });
  }
  return out;
}

/** Link two entries. One-directional in storage; both ends show it. */
export async function linkEntries(fromId, toId) {
  if (fromId === toId) return null;
  const from = await getEntry(fromId);
  if (!from) return null;
  const related = new Set(from.related ?? []);
  related.add(toId);
  return putEntryRaw({ ...from, related: [...related] });
}

export async function unlinkEntries(fromId, toId) {
  for (const [a, b] of [[fromId, toId], [toId, fromId]]) {
    const entry = await getEntry(a);
    if (!entry?.related?.includes(b)) continue;
    await putEntryRaw({ ...entry, related: entry.related.filter(id => id !== b) });
  }
}

export { rolesFor, tagKey, suggestMoves };
