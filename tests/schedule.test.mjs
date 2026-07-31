// Dates, spaced repetition, and the attendance queries that read off them.
//
// Pure node, no browser: js/dates.js and js/srs.js touch nothing but arithmetic,
// and js/store.js only reaches for IndexedDB inside functions we don't call here.
//
//   node tests/schedule.test.mjs
//
// The timezone tests are the point of this file. `toISOString()` is UTC, and an
// app you open after evening training will file classes on the wrong day west
// of Greenwich — the kind of bug that never shows up on a CI box pinned to UTC.

import assert from 'node:assert/strict';
import * as dates from '../js/dates.js';
import * as srs from '../js/srs.js';
import * as store from '../js/store.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

// ---- dates ---------------------------------------------------------------

test('localISO reads the wall clock, not UTC', () => {
  // 7:30pm on the 30th. UTC has already rolled over to the 31st in any timezone
  // west of Greenwich; the date on the user's wall has not.
  const evening = new Date(2026, 6, 30, 19, 30, 0);
  assert.equal(dates.localISO(evening), '2026-07-30');

  // Early morning, the other direction.
  const morning = new Date(2026, 6, 30, 6, 15, 0);
  assert.equal(dates.localISO(morning), '2026-07-30');
});

test('todayISO agrees with the local calendar date', () => {
  const now = new Date();
  const expected =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(dates.todayISO(), expected);
  assert.equal(store.todayISO(), expected);
});

test('addDays crosses months and years', () => {
  assert.equal(dates.addDays('2026-07-31', 1), '2026-08-01');
  assert.equal(dates.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dates.addDays('2026-03-01', -1), '2026-02-28');
});

test('weeks start on Monday', () => {
  assert.equal(dates.dayOfWeek('2026-07-27'), 0);      // a Monday
  assert.equal(dates.dayOfWeek('2026-07-26'), 6);      // the Sunday before
  assert.equal(dates.weekOf('2026-07-30'), '2026-07-27');
  assert.equal(dates.weekOf('2026-07-26'), '2026-07-20');
});

test('daysBetween is not fooled by a DST shift', () => {
  assert.equal(dates.daysBetween('2026-07-27', '2026-08-03'), 7);
  // Spans the US spring-forward; a naive midnight-to-midnight diff gives 6.958.
  assert.equal(dates.daysBetween('2026-03-01', '2026-03-31'), 30);
});

test('monthGrid pads to the first Monday and covers the month', () => {
  const grid = dates.monthGrid('2026-07-01');
  // 1 July 2026 is a Wednesday, so two blank cells lead.
  assert.equal(grid[0], null);
  assert.equal(grid[1], null);
  assert.equal(grid[2], '2026-07-01');
  assert.equal(grid.filter(Boolean).length, 31);
});

// ---- spaced repetition ----------------------------------------------------

test('a new card is due immediately', () => {
  const card = srs.fresh();
  assert.equal(card.due, '');
  assert.deepEqual(store.dueFocuses([{ front: 'a', ...card }], '2026-07-31').length, 1);
});

test('good pushes a card out along the ladder', () => {
  let card = { ...srs.fresh() };
  card = { ...card, ...srs.schedule(card, 'good', '2026-07-01') };
  assert.equal(card.interval, 1);
  assert.equal(card.due, '2026-07-02');

  card = { ...card, ...srs.schedule(card, 'good', '2026-07-02') };
  assert.equal(card.interval, 3);

  card = { ...card, ...srs.schedule(card, 'good', '2026-07-05') };
  assert.equal(card.interval, Math.round(3 * 2.5));   // interval × ease
});

test('easy goes further than good, and makes the card more forgiving', () => {
  const base = { ...srs.fresh(), reps: 2, interval: 10, ease: 2.5 };
  const good = srs.schedule(base, 'good', '2026-07-01');
  const easy = srs.schedule(base, 'easy', '2026-07-01');
  assert.ok(easy.interval > good.interval, 'easy should schedule further out');
  assert.ok(easy.ease > base.ease, 'easy should raise ease');
  assert.equal(good.ease, base.ease, 'good should leave ease alone');
});

test('again resets the card and keeps it due today', () => {
  const base = { ...srs.fresh(), reps: 4, interval: 40, ease: 2.5 };
  const again = srs.schedule(base, 'again', '2026-07-01');
  assert.equal(again.interval, 0);
  assert.equal(again.reps, 0);
  assert.equal(again.due, '2026-07-01');
  assert.ok(again.ease < base.ease, 'a lapse should make the card come back sooner in future');
});

test('ease has a floor, and intervals have a ceiling', () => {
  let card = { ...srs.fresh() };
  for (let i = 0; i < 20; i++) card = { ...card, ...srs.schedule(card, 'again', '2026-07-01') };
  assert.ok(card.ease >= 1.3, `ease fell to ${card.ease}`);

  let long = { ...srs.fresh(), reps: 5, interval: 300, ease: 2.8 };
  long = { ...long, ...srs.schedule(long, 'easy', '2026-07-01') };
  assert.ok(long.interval <= 365, `interval ran away to ${long.interval}`);
});

test('a card only counts as due on or after its due date', () => {
  const deck = [
    { front: 'due today', due: '2026-07-31' },
    { front: 'overdue', due: '2026-07-20' },
    { front: 'later', due: '2026-08-09' },
    { front: 'never seen', due: '' },
  ];
  const due = store.dueFocuses(deck, '2026-07-31').map(c => c.front);
  assert.deepEqual(due.sort(), ['due today', 'never seen', 'overdue'].sort());
  // Most overdue first, so a backlog is worked oldest-out.
  assert.equal(store.dueFocuses(deck, '2026-07-31')[0].front, 'never seen');
});

test('an old string-shaped focus still loads, and starts due', () => {
  const card = store.normalizeFocus('half guard passing');
  assert.equal(card.front, 'half guard passing');
  assert.equal(card.back, '');
  assert.equal(card.due, '');
  assert.equal(card.ease, 2.5);
});

test('a scheduled card keeps its schedule through normalisation', () => {
  const card = store.normalizeFocus({ front: 'a', back: 'b', due: '2026-09-01', interval: 12, ease: 2.1, reps: 3 });
  assert.equal(card.due, '2026-09-01');
  assert.equal(card.interval, 12);
  assert.equal(card.ease, 2.1);
});

// ---- attendance -----------------------------------------------------------

const cls = (date, patch = {}) => ({ type: 'class', date, id: date + Math.random(), ...patch });

test('the streak counts weeks trained, not consecutive days', () => {
  // Tue/Thu for three straight weeks — a day streak would read 0 the whole time.
  const entries = [
    cls('2026-07-14'), cls('2026-07-16'),
    cls('2026-07-21'), cls('2026-07-23'),
    cls('2026-07-28'), cls('2026-07-30'),
  ];
  const streak = store.weekStreak(entries, '2026-07-31');
  assert.equal(streak.current, 3);
  assert.equal(streak.longest, 3);
  assert.equal(streak.weeksTrained, 3);
});

test('an unfinished current week does not break the streak', () => {
  // Trained the last two weeks; this week has only just started.
  const entries = [cls('2026-07-15'), cls('2026-07-22')];
  assert.equal(store.weekStreak(entries, '2026-07-28').current, 2);
});

test('a missed week does break it', () => {
  const entries = [cls('2026-07-01'), cls('2026-07-15'), cls('2026-07-22')];
  const streak = store.weekStreak(entries, '2026-07-23');
  assert.equal(streak.current, 2);
  assert.equal(streak.longest, 2);
});

test('no classes means no streak, not a crash', () => {
  assert.deepEqual(store.weekStreak([], '2026-07-31'), { current: 0, longest: 0, weeksTrained: 0 });
});

test('the calendar index counts gi and no-gi per day', () => {
  const index = store.trainingIndex([
    cls('2026-07-30', { gi: 'gi' }),
    cls('2026-07-30', { gi: 'nogi' }),
    cls('2026-07-28', { gi: 'nogi' }),
    { type: 'note', date: '2026-07-29', body: 'not a class' },
  ]);
  assert.equal(index.get('2026-07-30').count, 2);
  assert.equal(index.get('2026-07-30').gi, 1);
  assert.equal(index.get('2026-07-30').nogi, 1);
  assert.equal(index.get('2026-07-28').count, 1);
  assert.equal(index.has('2026-07-29'), false, 'notes are not training days');
});

test('the nudge names a usual training day you did not log', () => {
  // Tuesdays and Thursdays for four weeks, then last Thursday missed.
  const entries = [];
  for (const monday of ['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']) {
    entries.push(cls(dates.addDays(monday, 1)));   // Tuesday
    entries.push(cls(dates.addDays(monday, 3)));   // Thursday
  }
  entries.push(cls('2026-07-28'));                 // Tuesday this week
  // Thursday 30 July is missing. Today is Friday 31st.
  const nudge = store.logNudge(entries, '2026-07-31');
  assert.equal(nudge?.date, '2026-07-30');
});

test('the nudge stays quiet without enough history to know a pattern', () => {
  assert.equal(store.logNudge([cls('2026-07-28'), cls('2026-07-30')], '2026-07-31'), null);
});

test('the nudge never fires for today', () => {
  const entries = [];
  for (const monday of ['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']) {
    entries.push(cls(dates.addDays(monday, 1)));
    entries.push(cls(dates.addDays(monday, 3)));
  }
  entries.push(cls('2026-07-28'), cls('2026-07-30'));
  // Today is Tuesday 4 Aug, a usual day, unlogged — but the day is not over.
  const nudge = store.logNudge(entries, '2026-08-04');
  assert.notEqual(nudge?.date, '2026-08-04');
});

// ---- session types and self-report ---------------------------------------

test('session counts separate competition from an ordinary class', () => {
  const counts = store.sessionCounts([
    cls('2026-07-01'),
    cls('2026-07-02'),
    cls('2026-07-03', { session: 'comp' }),
    cls('2026-07-04', { session: 'open-mat' }),
  ]);
  assert.equal(counts.null, 2);
  assert.equal(counts.comp, 1);
  assert.equal(counts['open-mat'], 1);
});

test('rounds add up; a self-report needs three before it is reported', () => {
  const two = store.rollStats([
    cls('2026-07-01', { rounds: 5, feel: 4 }),
    cls('2026-07-02', { rounds: 6, feel: 2 }),
  ]);
  assert.equal(two.rounds, 11);
  assert.equal(two.sessionsWithRounds, 2);
  assert.equal(two.feel, null, 'two ratings is not a trend');

  const three = store.rollStats([
    cls('2026-07-01', { feel: 4 }),
    cls('2026-07-02', { feel: 2 }),
    cls('2026-07-03', { feel: 3 }),
  ]);
  assert.equal(three.feel, 3);
  assert.equal(three.feelCount, 3);
});

test('a session with no rounds recorded is not a session with zero rounds', () => {
  const stats = store.rollStats([cls('2026-07-01'), cls('2026-07-02', { rounds: 4 })]);
  assert.equal(stats.rounds, 4);
  assert.equal(stats.sessionsWithRounds, 1);
});

// ---- links ----------------------------------------------------------------

test('backlinks find the other end of a link', () => {
  const a = { id: 'a', date: '2026-07-01', related: ['b'] };
  const b = { id: 'b', date: '2026-07-10', related: [] };
  const c = { id: 'c', date: '2026-07-20', related: ['b'] };
  assert.deepEqual(store.backlinksFor([a, b, c], 'b').map(e => e.id), ['a', 'c']);
  assert.deepEqual(store.backlinksFor([a, b, c], 'a'), []);
});

test('linked entries show both directions without duplicating', () => {
  const a = { id: 'a', date: '2026-07-01', related: ['b'] };
  const b = { id: 'b', date: '2026-07-10', related: ['a'] };
  const links = store.linkedEntries([a, b], a);
  assert.equal(links.length, 1, 'a mutual link is one connection, not two');
  assert.equal(links[0].entry.id, 'b');
});

test('a link to an entry that no longer exists is skipped, not rendered blank', () => {
  const a = { id: 'a', date: '2026-07-01', related: ['gone'] };
  assert.deepEqual(store.linkedEntries([a], a), []);
});

// ---- belt -----------------------------------------------------------------

test('belt standing reports the latest rank and classes since', () => {
  const entries = [
    cls('2026-01-10'), cls('2026-04-01'), cls('2026-05-05'), cls('2026-07-30'),
  ];
  const standing = store.beltStanding(entries, [
    { rank: 'white', date: '2024-01-01' },
    { rank: 'blue', date: '2026-03-01' },
  ]);
  assert.equal(standing.rank, 'blue');
  assert.equal(standing.classesSince, 3, 'only classes on or after the promotion');
  assert.equal(standing.history.length, 2);
});

test('no promotions recorded means no claim about your rank', () => {
  assert.equal(store.beltStanding([cls('2026-07-01')], []), null);
  assert.equal(store.beltStanding([], undefined), null);
});

console.log(`\n${passed} passed`);
