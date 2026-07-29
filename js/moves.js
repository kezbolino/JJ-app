// "Your game" — the moves you like, and moves adjacent to them worth drilling.
//
// A move is a (position, technique) pair, the same shape a technique tag uses.
// Adjacency is literal and explainable — no AI, in keeping with the tagger:
//
//   +3  a sibling: same position, same role as one you like
//        (like Knee Slice → the other half-guard passes)
//   +3  the same move in a different position
//        (like Kimura from closed guard → Kimura from side control)
//   +2  per class you've journaled it in alongside a move you like, capped
//        (your own training history, so it only kicks in once there is some)
//
// Scores from several liked moves add up; the strongest single reason is the
// one shown. This reports what is *related*, never what you are *good at*.

import {
  POSITIONS, POSITION_BY_ID, TECHNIQUE_BY_ID, ROLE_LABEL,
  positionLabel, techniqueLabel,
} from './ontology.js';

export const moveKey = m => `${m.position}/${m.technique}`;

/** The ontology record for a move, or null if it's not a known technique. */
export const moveInfo = m => TECHNIQUE_BY_ID[moveKey(m)] ?? null;

/**
 * Rank moves adjacent to the ones in `liked`, drawing on the shipped ontology
 * and — where there's history — the user's own entries. Already-liked moves are
 * never suggested back. Returns [{ position, technique, role, reason, score }].
 */
export function suggestMoves(entries, liked, { limit = 8 } = {}) {
  const likedKeys = new Set((liked ?? []).map(moveKey));
  if (!likedKeys.size) return [];

  // Personal signal: candidates that share an entry with something you like.
  const coBoost = {};
  for (const entry of entries ?? []) {
    const keys = (entry.tags ?? [])
      .filter(t => t.kind === 'pos' && t.technique)
      .map(t => `${t.position}/${t.technique}`);
    const set = new Set(keys);
    if (![...set].some(k => likedKeys.has(k))) continue;
    for (const k of set) if (!likedKeys.has(k)) coBoost[k] = (coBoost[k] ?? 0) + 1;
  }

  const acc = {}; // key -> { score, bestPts, reason }
  const add = (key, pts, reason) => {
    if (likedKeys.has(key) || !TECHNIQUE_BY_ID[key]) return;
    const cur = acc[key] ?? (acc[key] = { score: 0, bestPts: 0, reason: '' });
    cur.score += pts;
    if (pts > cur.bestPts) { cur.bestPts = pts; cur.reason = reason; }
  };

  for (const m of liked ?? []) {
    const info = TECHNIQUE_BY_ID[moveKey(m)];
    if (!info) continue;
    const role = info.role;
    const name = info.label.toLowerCase();

    // Siblings: same position, same role.
    for (const t of POSITION_BY_ID[m.position].techniques) {
      if (t.id === m.technique || t.role !== role) continue;
      add(`${m.position}/${t.id}`, 3,
        `Another ${(ROLE_LABEL[role] ?? role).toLowerCase()} from ${positionLabel(m.position)}`);
    }

    // The same move, somewhere else on the body of positions.
    for (const p of POSITIONS) {
      if (p.id === m.position) continue;
      for (const t of p.techniques) {
        if (t.label.toLowerCase() === name) {
          add(`${p.id}/${t.id}`, 3, `${info.label} from ${positionLabel(p.id)}`);
        }
      }
    }
  }

  for (const [key, count] of Object.entries(coBoost)) {
    add(key, Math.min(count, 2) * 2, 'You train this alongside your picks');
  }

  return Object.entries(acc)
    .map(([key, v]) => {
      const info = TECHNIQUE_BY_ID[key];
      return { position: info.position, technique: info.id, role: info.role, reason: v.reason, score: v.score };
    })
    .sort((a, b) =>
      b.score - a.score ||
      techniqueLabel(a.position, a.technique).localeCompare(techniqueLabel(b.position, b.technique)))
    .slice(0, limit);
}
