// Spaced repetition for the "Working on" deck.
//
// The deck has existed since v6 with no scheduler at all: every card was
// equally likely, forever, so the cue you nailed last week came round as often
// as the one you keep forgetting. This is the scheduler — SM-2, trimmed to the
// three buttons a flashcard actually needs.
//
// Pure arithmetic on plain objects, no storage and no DOM, so it unit-tests in
// node like the tagger and the move engine. Same house rule as everywhere else
// in this app: literal and explainable, no model, no service.
//
// A card carries { ease, interval, reps, due, lastReview }:
//   ease      how forgiving the multiplier is, 1.3 (stubborn) … ~2.8 (easy)
//   interval  days until the next showing
//   due       'YYYY-MM-DD'; '' means never reviewed, i.e. due now
//   reps      consecutive non-"again" reviews

import { addDays, todayISO } from './dates.js';

export const GRADES = [
  ['again', 'Again'],
  ['good',  'Good'],
  ['easy',  'Easy'],
];

const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;   // a year out is as good as "you know this"

/** The schedule a brand-new card starts with: due immediately. */
export const fresh = () => ({ ease: 2.5, interval: 0, reps: 0, due: '', lastReview: '' });

/** Just the schedule fields off an arbitrary object, ignoring anything absent. */
export function pick(card) {
  const out = {};
  for (const key of ['ease', 'interval', 'reps', 'due', 'lastReview']) {
    if (card?.[key] !== undefined && card?.[key] !== null) out[key] = card[key];
  }
  return out;
}

/**
 * Grade a card and work out when it should come back.
 *
 *   again — you blanked. Back to the start of the ladder and shown again today,
 *           because a card you just failed is exactly the one worth another go.
 *   good  — 1 day, then 3, then interval × ease.
 *   easy  — the same ladder with a bonus, and the card gets more forgiving.
 *
 * Returns only the schedule fields, so the caller merges them onto the card.
 */
export function schedule(card, grade, today = todayISO()) {
  const ease = Number.isFinite(card?.ease) ? card.ease : 2.5;
  const reps = Number.isFinite(card?.reps) ? card.reps : 0;
  const interval = Number.isFinite(card?.interval) ? card.interval : 0;

  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, ease - 0.2),
      interval: 0,
      reps: 0,
      due: today,                // still due: you see it again this session
      lastReview: today,
    };
  }

  const nextEase = grade === 'easy' ? ease + 0.15 : ease;
  let next;
  if (reps === 0) next = grade === 'easy' ? 2 : 1;
  else if (reps === 1) next = grade === 'easy' ? 4 : 3;
  else next = Math.round(interval * nextEase * (grade === 'easy' ? 1.3 : 1));

  next = Math.min(MAX_INTERVAL, Math.max(1, next));

  return {
    ease: nextEase,
    interval: next,
    reps: reps + 1,
    due: addDays(today, next),
    lastReview: today,
  };
}

/** "in 3 days" / "today" — for the button labels, so the choice is informed. */
export function preview(card, grade, today = todayISO()) {
  const { interval } = schedule(card, grade, today);
  if (interval === 0) return 'today';
  if (interval === 1) return '1 day';
  if (interval < 30) return `${interval} days`;
  const months = Math.round(interval / 30);
  return months === 1 ? '1 month' : `${months} months`;
}
