// The settings that sync: what merges, how, and the file it travels in.
//
//   node tests/appstate.test.mjs
//
// Pure node — js/appstate.js touches no storage and no network, which is the
// whole reason the merge rules can be tested at all rather than hoped for.
//
// The two rules under test are not interchangeable, and getting them the wrong
// way round loses data silently in both directions: last-write-wins on an
// append-only log throws away a session logged on the other device, and union
// on an edited list resurrects a flashcard you deleted.

import assert from 'node:assert/strict';
import {
  SYNCED_SETTINGS, STATE_PATH,
  mergeAppState, appStateToMarkdown, appStateFromMarkdown,
} from '../js/appstate.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const T1 = '2026-08-01T10:00:00.000Z';
const T2 = '2026-08-02T10:00:00.000Z';

const card = front => ({ front, back: '' });
const lift = (id, date) => ({ id, date, exercises: [] });

// ---- what is on the list --------------------------------------------------

test('the deck, starred moves, promotions and both session logs all sync', () => {
  for (const key of ['focuses', 'likedMoves', 'promotions', 'strengthSessions', 'mobilitySessions']) {
    assert.ok(SYNCED_SETTINGS[key], `${key} is not synced`);
  }
});

test('a lift in progress and the sync credentials never sync', () => {
  // strengthDraft is half a workout; the rest are this device's secrets and
  // bookkeeping. If any of these ever appear here it is a bug, not a feature.
  for (const key of ['strengthDraft', 'sync', 'syncState', 'tombstones',
    'lastSyncAt', 'lastSyncError', 'settingsStamps', 'nudgeDismissedOn']) {
    assert.ok(!SYNCED_SETTINGS[key], `${key} must not sync`);
  }
});

test('every synced key declares a merge rule this module implements', () => {
  for (const [key, rule] of Object.entries(SYNCED_SETTINGS)) {
    assert.ok(['whole', 'byId'].includes(rule), `${key} has an unknown rule: ${rule}`);
  }
});

// ---- 'whole': things you edit ---------------------------------------------

test('a newer deck replaces an older one, wholesale', () => {
  const mine = { values: { focuses: [card('a')] }, stamps: { focuses: T1 } };
  const theirs = { values: { focuses: [card('a'), card('b')] }, stamps: { focuses: T2 } };

  const merged = mergeAppState(mine, theirs);
  assert.deepEqual(merged.values.focuses.map(f => f.front), ['a', 'b']);
  assert.equal(merged.stamps.focuses, T2);
  assert.deepEqual(merged.changed, ['focuses']);
});

test('deleting a card reaches the other device instead of coming back', () => {
  // This is why the deck is not a union. The remote still holds three cards;
  // the local copy is newer and has two. Union would resurrect the third.
  const mine = { values: { focuses: [card('a'), card('b')] }, stamps: { focuses: T2 } };
  const theirs = { values: { focuses: [card('a'), card('b'), card('c')] }, stamps: { focuses: T1 } };

  const merged = mergeAppState(mine, theirs);
  assert.deepEqual(merged.values.focuses.map(f => f.front), ['a', 'b'], 'a deleted card came back');
  assert.deepEqual(merged.changed, [], 'nothing local changed, so nothing should be written');
});

test('a tie leaves the local copy alone', () => {
  const mine = { values: { likedMoves: [{ position: 'mount', technique: 'armbar-mount' }] }, stamps: { likedMoves: T1 } };
  const theirs = { values: { likedMoves: [] }, stamps: { likedMoves: T1 } };

  const merged = mergeAppState(mine, theirs);
  assert.equal(merged.values.likedMoves.length, 1);
  assert.deepEqual(merged.changed, []);
});

test('a fresh device takes everything the repo has', () => {
  const merged = mergeAppState(
    { values: {}, stamps: {} },
    { values: { focuses: [card('a')], promotions: [{ rank: 'blue', date: '2026-01-01' }] },
      stamps: { focuses: T1, promotions: T1 } });

  assert.equal(merged.values.focuses.length, 1);
  assert.equal(merged.values.promotions.length, 1);
  assert.deepEqual(merged.changed.sort(), ['focuses', 'promotions']);
});

test('a key the repo has never held leaves the local one untouched', () => {
  const merged = mergeAppState(
    { values: { focuses: [card('a')] }, stamps: { focuses: T1 } },
    { values: {}, stamps: {} });

  assert.equal(merged.values.focuses.length, 1);
  assert.deepEqual(merged.changed, []);
});

// ---- 'byId': logs you append to -------------------------------------------

test('lifts from two devices both survive', () => {
  // The failure this prevents: last-write-wins here means whichever phone
  // syncs second wipes the other's session, and nothing says so.
  const mine = { values: { strengthSessions: [lift('s1', '2026-08-01')] }, stamps: { strengthSessions: T1 } };
  const theirs = { values: { strengthSessions: [lift('s2', '2026-08-02')] }, stamps: { strengthSessions: T2 } };

  const merged = mergeAppState(mine, theirs);
  assert.deepEqual(merged.values.strengthSessions.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(merged.changed, ['strengthSessions']);
  assert.equal(merged.stamps.strengthSessions, T2, 'the union must carry the later stamp');
});

test('the same session on both sides is not duplicated, and the newer wins', () => {
  const mine = { values: { strengthSessions: [{ id: 's1', date: '2026-08-01', note: 'mine' }] }, stamps: { strengthSessions: T1 } };
  const theirs = { values: { strengthSessions: [{ id: 's1', date: '2026-08-01', note: 'theirs' }] }, stamps: { strengthSessions: T2 } };

  const merged = mergeAppState(mine, theirs);
  assert.equal(merged.values.strengthSessions.length, 1);
  assert.equal(merged.values.strengthSessions[0].note, 'theirs');
});

test('an identical log on both sides is not reported as a change', () => {
  const rows = [lift('s1', '2026-08-01')];
  const merged = mergeAppState(
    { values: { strengthSessions: rows }, stamps: { strengthSessions: T1 } },
    { values: { strengthSessions: [lift('s1', '2026-08-01')] }, stamps: { strengthSessions: T2 } });

  assert.deepEqual(merged.changed, [], 'an unchanged union was written back');
});

test('mobility sessions union on their own id', () => {
  const merged = mergeAppState(
    { values: { mobilitySessions: [{ id: 'mb-2026-08-01-cooldown', date: '2026-08-01', routine: 'cooldown' }] }, stamps: { mobilitySessions: T1 } },
    { values: { mobilitySessions: [{ id: 'mb-2026-08-02-restday', date: '2026-08-02', routine: 'restday' }] }, stamps: { mobilitySessions: T2 } });

  assert.equal(merged.values.mobilitySessions.length, 2);
});

// ---- the file --------------------------------------------------------------

test('the state round-trips through markdown unchanged', () => {
  const state = {
    values: {
      focuses: [{ front: 'half guard passing', back: 'staple the knee — "don\'t chase the pass"' }],
      likedMoves: [{ position: 'half-guard', technique: 'knee-slice' }],
      promotions: [{ rank: 'blue', date: '2026-01-01' }],
      strengthMuted: ['nordic'],
      strengthSessions: [{ id: 's1', date: '2026-08-01', exercises: [{ id: 'pullup', sets: [{ reps: 5, tempo: 'ok', hit: true }] }] }],
      mobilitySessions: [{ id: 'mb-1', date: '2026-08-01', routine: 'cooldown' }],
    },
    stamps: { focuses: T1, likedMoves: T1, promotions: T1, strengthMuted: T1, strengthSessions: T2, mobilitySessions: T2 },
  };

  const back = appStateFromMarkdown(appStateToMarkdown(state));
  assert.deepEqual(back.values, state.values);
  assert.deepEqual(back.stamps, state.stamps);
});

test('the file is byte-stable, so an unchanged state is never re-committed', () => {
  // The push decides whether to upload by hashing this text. A clock anywhere
  // in it would commit an identical state on every single sync.
  const state = { values: { focuses: [card('a')] }, stamps: { focuses: T1 } };
  assert.equal(appStateToMarkdown(state), appStateToMarkdown(state));
});

test('the file says what it is and where to edit it', () => {
  const text = appStateToMarkdown({ values: { focuses: [] }, stamps: { focuses: T1 } });
  assert.match(text, /# App state/);
  assert.match(text, /edit these in the app, not here/);
  assert.match(text, /```json/);
  assert.equal(STATE_PATH, 'app-state.md');
});

test('a hand-mangled file cannot stop a sync', () => {
  for (const junk of ['', 'not markdown at all', '```json\n{ oh no', '```json\nnull\n```', undefined]) {
    const parsed = appStateFromMarkdown(junk);
    assert.deepEqual(parsed, { values: {}, stamps: {} }, `threw or misread on: ${junk}`);
  }
});

test('a key from a newer version of the app is ignored, not stored', () => {
  const text = appStateToMarkdown({ values: { focuses: [card('a')] }, stamps: { focuses: T1 } })
    .replaceAll('"focuses"', '"somethingNew"');
  assert.deepEqual(appStateFromMarkdown(text).values, {});
});

test('a value with no stamp at all is readable and loses to one that has', () => {
  const merged = mergeAppState(
    { values: { focuses: [card('old')] }, stamps: {} },
    { values: { focuses: [card('new')] }, stamps: { focuses: T1 } });
  assert.equal(merged.values.focuses[0].front, 'new');
});

console.log(`\n${passed} passed`);
