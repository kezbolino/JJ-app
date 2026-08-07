// Dates, the deck's data shape, and the attendance queries.
//
// Pure node, no browser: js/dates.js touches nothing but arithmetic, and
// js/store.js only reaches for IndexedDB inside functions we don't call here.
//
//   node tests/schedule.test.mjs
//
// The timezone tests are the point of this file. `toISOString()` is UTC, and an
// app you open after evening training will file classes on the wrong day west
// of Greenwich — the kind of bug that never shows up on a CI box pinned to UTC.

import assert from 'node:assert/strict';
import * as dates from '../js/dates.js';
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

// ---- the deck --------------------------------------------------------------
// v20 removed the SM-2 scheduler along with the Again/Good/Easy rating that
// drove it. What is left is the normalising, which still has to cope with old
// data — including cards that carry the schedule keys that used to exist.

test('an old string-shaped focus still loads', () => {
  const card = store.normalizeFocus('half guard passing');
  assert.deepEqual(card, { front: 'half guard passing', back: '' });
});

test('a card from the spaced-repetition era loads without its schedule', () => {
  const card = store.normalizeFocus({
    front: 'a', back: 'b', due: '2026-09-01', interval: 12, ease: 2.1, reps: 3,
  });
  assert.deepEqual(card, { front: 'a', back: 'b' },
    'the dead schedule keys came back with the card');
});

test('a card with no back is still a card', () => {
  assert.deepEqual(store.normalizeFocus({ front: 'lockdown' }), { front: 'lockdown', back: '' });
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

// ---- what a class entry no longer carries ---------------------------------
// Rounds and the 1-5 self-report went in v21, the session type in v22, and the
// queries that read them went too. Pinned here because those queries are what
// the Map cards called: leave one exported with nothing writing to it and it
// quietly reports zeros forever.

test('nothing scores or categorises a session any more', () => {
  assert.equal(store.rollStats, undefined, 'rollStats is still exported');
  assert.equal(store.sessionCounts, undefined, 'sessionCounts is still exported');
  assert.equal(store.SESSION_TYPES, undefined, 'the session type list is still exported');
  assert.equal(store.SESSION_LABEL, undefined, 'the session labels are still exported');

  const fresh = store.newEntry();
  for (const key of ['rounds', 'feel', 'session']) {
    assert.equal(fresh[key], undefined, `a new entry still carries ${key}`);
  }
});

test('a training day records attendance and gi, and nothing about the kind of class', () => {
  const day = store.trainingIndex([cls('2026-07-01', { gi: 'nogi' })]).get('2026-07-01');
  assert.equal(day.count, 1);
  assert.equal(day.nogi, 1);
  assert.equal(day.sessions, undefined, 'the calendar still tracks session types');
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

// ---- attention over time ---------------------------------------------------

const tagged = (date, position) => cls(date, { tags: [{ kind: 'pos', position, role: 'sweep' }] });

test('monthlyClasses fills in the months you did nothing', () => {
  const rows = store.monthlyClasses(
    [cls('2026-06-02'), cls('2026-06-09'), cls('2026-08-03')],
    { months: 3, today: '2026-08-07' });

  assert.deepEqual(rows.map(r => r.month), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(rows.map(r => r.count), [2, 0, 1]);
});

test('monthlyClasses counts classes only, and ignores anything off the window', () => {
  const rows = store.monthlyClasses([
    cls('2026-08-01'),
    { type: 'note', date: '2026-08-02', id: 'n' },
    cls('2025-01-04'), // long before the window
  ], { months: 2, today: '2026-08-07' });

  assert.deepEqual(rows.map(r => r.count), [0, 1]);
});

test('attentionDrift shows a position fading as another arrives', () => {
  const entries = [
    tagged('2026-06-02', 'half-guard'), tagged('2026-06-09', 'half-guard'),
    tagged('2026-06-16', 'half-guard'),
    tagged('2026-07-02', 'half-guard'),
    tagged('2026-08-03', 'closed-guard'), tagged('2026-08-05', 'closed-guard'),
  ];
  const rows = store.attentionDrift(entries, { months: 3, top: 5, today: '2026-08-07' });

  const half = rows.find(r => r.position === 'half-guard');
  const closed = rows.find(r => r.position === 'closed-guard');
  assert.deepEqual(half.months.map(m => m.count), [3, 1, 0], 'half guard did not fade');
  assert.deepEqual(closed.months.map(m => m.count), [0, 0, 2], 'closed guard did not arrive');
  assert.equal(half.total, 4);
  assert.equal(rows[0].position, 'half-guard', 'rows are not busiest-first');
  assert.ok(half.label, 'a row carries no readable label');
});

test('attentionDrift counts a position once per entry, however many tags it has', () => {
  const entry = cls('2026-08-03', {
    tags: [
      { kind: 'pos', position: 'half-guard', role: 'sweep' },
      { kind: 'pos', position: 'half-guard', role: 'pass' },
      { kind: 'concept', concept: 'Pressure' },
    ],
  });
  const rows = store.attentionDrift([entry], { months: 1, today: '2026-08-07' });
  assert.equal(rows.length, 1, 'a concept tag became a position row');
  assert.equal(rows[0].total, 1, 'one entry counted twice');
});

test('attentionDrift honours `top`', () => {
  const entries = [
    tagged('2026-08-01', 'half-guard'), tagged('2026-08-02', 'half-guard'),
    tagged('2026-08-03', 'closed-guard'),
    tagged('2026-08-04', 'mount'),
  ];
  assert.equal(store.attentionDrift(entries, { months: 1, top: 2, today: '2026-08-07' }).length, 2);
});

// ---- is the backup actually working ----------------------------------------

test('syncHealth says nothing when sync is not set up', () => {
  assert.equal(store.syncHealth({ configured: false }).state, 'off');
  assert.equal(store.syncHealth({ configured: false }).message, null);
});

test('syncHealth reports a recorded failure', () => {
  const health = store.syncHealth({
    configured: true,
    lastSyncAt: '2026-08-07T09:00:00.000Z',
    lastError: { message: 'GitHub 401: Bad credentials' },
    today: '2026-08-07',
  });
  assert.equal(health.state, 'failing');
  assert.match(health.message, /Bad credentials/);
});

test('syncHealth goes stale after a week of silence, not before', () => {
  const at = day => `${day}T09:00:00.000Z`;
  const on = (last, today) =>
    store.syncHealth({ configured: true, lastSyncAt: at(last), lastError: null, today });

  assert.equal(on('2026-08-06', '2026-08-07').state, 'ok');
  assert.equal(on('2026-08-01', '2026-08-07').state, 'ok', 'six days is not stale');
  assert.equal(on('2026-07-31', '2026-08-07').state, 'stale', 'seven days should be stale');
  assert.match(on('2026-07-24', '2026-08-07').message, /24 Jul/);
});

test('syncHealth treats never-synced as stale, with something to say', () => {
  const health = store.syncHealth({ configured: true, lastSyncAt: null, today: '2026-08-07' });
  assert.equal(health.state, 'stale');
  assert.ok(health.message);
});

console.log(`\n${passed} passed`);
