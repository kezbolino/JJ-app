// Data model and the queries the views ask of it.

import * as db from './db.js';
import { POSITIONS, POSITION_BY_ID, rolesFor } from './ontology.js';
import { tagKey } from './tagger.js';

export const ENTRY_TYPES = ['class', 'note', 'question', 'video', 'principle'];

/**
 * An entry is the single unit of everything: a class journal, a stray note, a
 * question, a saved video, a coach principle. One shape, one store, one search.
 *
 * {
 *   id, type, date: 'YYYY-MM-DD',
 *   coach, gi: 'gi' | 'nogi' | null,
 *   title,
 *   sections: { techniques, rolling, thoughts },   // class entries
 *   body,                                          // free text / joined sections
 *   tags: [{kind:'pos', position, role, technique} | {kind:'concept', concept}],
 *   video: { videoId, url, title, thumb } | null,
 *   createdAt, updatedAt
 * }
 */
export function newEntry(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'class',
    date: todayISO(),
    coach: '',
    gi: null,
    title: '',
    sections: { techniques: '', rolling: '', thoughts: '' },
    body: '',
    tags: [],
    video: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

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

export const deleteEntry = id => db.del('entries', id);
export const getEntry = id => db.get('entries', id);

/** All entries, newest first. */
export async function allEntries() {
  const rows = await db.getAll('entries');
  return rows.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

// ---- settings ------------------------------------------------------------

export async function getSetting(key, fallback) {
  const row = await db.get('settings', key);
  return row === undefined ? fallback : row.value;
}

export const setSetting = (key, value) => db.put('settings', { key, value });

export const getFocuses = () => getSetting('focuses', []);
export const setFocuses = list => setSetting('focuses', list);

// ---- queries -------------------------------------------------------------

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export function countClasses(entries) {
  const classes = entries.filter(e => e.type === 'class');
  const week = daysAgo(7), month = daysAgo(30);
  return {
    week: classes.filter(e => e.date >= week).length,
    month: classes.filter(e => e.date >= month).length,
    total: classes.length,
  };
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

export function search(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries.filter(e => {
    if (`${e.title} ${e.body} ${e.coach}`.toLowerCase().includes(q)) return true;
    return (e.tags ?? []).some(t => {
      const label = t.kind === 'concept' ? t.concept : POSITION_BY_ID[t.position]?.label ?? '';
      return label.toLowerCase().includes(q);
    });
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

export { rolesFor, tagKey };
