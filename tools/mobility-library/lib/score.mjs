// Rank search results for one movement. Pure -- no network, no filesystem --
// so tests/mobility.test.mjs can drive it with fixtures.
//
// The original sketch took `maxResults=1` from a query with a channel name
// glued to the front. That has two failure modes and both of them are silent:
// if the preferred channel has never covered the movement you get whatever
// video happened to rank first for a query containing their name, and if
// someone else made a better one you never see it. So: search plainly, pull
// back a page of results, and score them.
//
// Nothing here decides anything you can't check. Every candidate keeps the
// reasons it scored what it did, and `mobility search` prints them, because the
// point of the shortlist is that a person picks from it.

/**
 * Channel preference, best first. Tier 1 is the one the request named; tier 2
 * is its stated fallbacks. Tier 3 is not from the request -- it is here so a
 * movement none of the above has covered still surfaces something credible
 * rather than a random gym vlog. Edit freely; it is a preference, not a rule.
 */
export const CHANNEL_TIERS = [
  ['E3 Rehab'],
  ['Squat University', 'Strength Side', 'The Prehab Guys'],
  ['Tom Merrick', 'GMB Fitness', 'Precision Movement', 'Movement by David', 'Upright Health'],
];

const TIER_POINTS = [50, 38, 26];

/** Words that mean "this is not a demonstration of one movement". */
export const TITLE_PENALTIES = [
  ['compilation', 30],
  ['top 10', 25],
  ['top 5', 25],
  ['mistakes', 20],
  ['stop doing', 20],
  ['podcast', 40],
  ['vlog', 30],
  ['reaction', 30],
  ['full workout', 25],
  ['day in the life', 30],
  ['challenge', 20],
  ['transformation', 25],
  ['q&a', 25],
];

/** Words that mean "this is a demonstration". */
export const TITLE_BONUSES = [
  ['how to', 6],
  ['tutorial', 5],
  ['demo', 5],
  ['technique', 4],
  ['form', 4],
  ['exercise', 3],
  ['stretch', 3],
];

export const DEFAULTS = {
  // A clip for this library is a few seconds of someone holding a position.
  // Anything past a few minutes is a lesson, and you would be trimming 3% of it.
  idealMaxSeconds: 90,
  goodMaxSeconds: 240,
  tolerableMaxSeconds: 900,
  // Under this and it is probably a fragment with no setup shown.
  minSeconds: 6,
  // Below this share of the movement's terms, it is a different exercise.
  minTermCoverage: 0.5,
};

/** Channels differ by "The", capitalisation and stray punctuation. */
export function normalizeChannel(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** 0 for the top tier, 1 for the next, -1 for a channel we have no view on. */
export function channelTier(name) {
  const want = normalizeChannel(name);
  if (!want) return -1;
  for (let i = 0; i < CHANNEL_TIERS.length; i++) {
    if (CHANNEL_TIERS[i].some(c => normalizeChannel(c) === want)) return i;
  }
  return -1;
}

/**
 * What share of the movement's term groups the title satisfies. A group is
 * satisfied by any one of its alternatives, so "90/90" and "90 90" both count.
 */
export function termCoverage(title, terms) {
  if (!terms || terms.length === 0) return 1;
  const hay = ` ${String(title ?? '').toLowerCase().replace(/\s+/g, ' ')} `;
  let hit = 0;
  for (const group of terms) {
    if (group.some(word => hay.includes(String(word).toLowerCase()))) hit++;
  }
  return hit / terms.length;
}

function durationPoints(seconds, opt) {
  if (!seconds || seconds <= 0) return [0, null];
  if (seconds < opt.minSeconds) return [-10, `only ${seconds}s, probably a fragment`];
  if (seconds <= opt.idealMaxSeconds) return [25, `${seconds}s, short demo`];
  if (seconds <= opt.goodMaxSeconds) return [14, `${Math.round(seconds / 60)} min`];
  if (seconds <= opt.tolerableMaxSeconds) return [4, `${Math.round(seconds / 60)} min, will need trimming`];
  return [-20, `${Math.round(seconds / 60)} min, this is a lesson not a clip`];
}

/**
 * Score one candidate against one movement.
 *
 * `candidate` is the shape both search backends normalise to:
 *   { id, title, channel, duration (seconds), views, url, isLive, ageLimit }
 *
 * Returns `{ score, reasons, rejected }`. A rejected candidate keeps its score
 * and its reason so `--all` can show you what was thrown out and why -- a
 * shortlist that silently drops the thing you were looking for is worse than
 * no shortlist.
 */
export function scoreCandidate(candidate, movement, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const reasons = [];
  let score = 0;

  const coverage = termCoverage(candidate.title, movement.terms);
  if (coverage >= 0.999) {
    score += 30;
    reasons.push('title names the movement');
  } else {
    score += Math.round(30 * coverage);
    if (coverage > 0) reasons.push(`title matches ${Math.round(coverage * 100)}% of the terms`);
  }

  const tier = channelTier(candidate.channel);
  if (tier >= 0) {
    score += TIER_POINTS[tier];
    reasons.push(tier === 0 ? `${candidate.channel} (first choice)` : `${candidate.channel} (fallback ${tier})`);
  }

  const [durPts, durWhy] = durationPoints(candidate.duration, opt);
  score += durPts;
  if (durWhy) reasons.push(durWhy);

  const title = String(candidate.title ?? '').toLowerCase();
  for (const [word, points] of TITLE_PENALTIES) {
    if (title.includes(word)) {
      score -= points;
      reasons.push(`"${word}" in the title`);
    }
  }
  let bonus = 0;
  for (const [word, points] of TITLE_BONUSES) {
    if (title.includes(word)) bonus += points;
  }
  score += Math.min(bonus, 10);

  // Popularity is a tiebreak and nothing more. It is capped at 10 so it can
  // never outweigh being the right movement from the right channel -- views
  // measure reach, and this library is about one person's hips.
  const views = Number(candidate.views) || 0;
  if (views > 0) score += Math.min(10, Math.round(Math.log10(views) * 1.5));

  let rejected = null;
  if (coverage < opt.minTermCoverage) rejected = 'title does not look like this movement';
  else if (candidate.isLive) rejected = 'live stream';
  else if (candidate.ageLimit) rejected = 'age restricted, yt-dlp will need a login';
  else if (candidate.duration > 3600) rejected = 'over an hour';

  return { score, reasons, rejected };
}

/**
 * Score, dedupe by video id, and sort. Rejected candidates sink to the bottom
 * rather than disappearing.
 */
export function rank(candidates, movement, options = {}) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    if (!c || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ ...c, ...scoreCandidate(c, movement, options) });
  }
  out.sort((a, b) => {
    if (Boolean(a.rejected) !== Boolean(b.rejected)) return a.rejected ? 1 : -1;
    return b.score - a.score;
  });
  return out;
}
