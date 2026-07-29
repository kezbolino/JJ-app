// "Your game" suggestion tests — the adjacency engine behind liked moves.
//
//   node tests/moves.test.mjs

import assert from 'node:assert/strict';
import { suggestMoves, moveKey } from '../js/moves.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const keys = list => list.map(moveKey);
const techTag = (position, technique, role) => ({ kind: 'pos', position, technique, role });

test('no likes means no suggestions', () => {
  assert.deepEqual(suggestMoves([], []), []);
});

test('a liked move is never suggested back to you', () => {
  const liked = [{ position: 'half-guard', technique: 'knee-slice' }];
  const out = suggestMoves([], liked);
  assert.ok(!keys(out).includes('half-guard/knee-slice'));
});

test('suggests siblings — same position, same role', () => {
  // Knee Slice is a half-guard pass; other half-guard passes should surface.
  const out = suggestMoves([], [{ position: 'half-guard', technique: 'knee-slice' }]);
  const legWeave = out.find(s => moveKey(s) === 'half-guard/leg-weave');
  assert.ok(legWeave, 'leg weave (a sibling pass) not suggested');
  assert.match(legWeave.reason, /pass/i);
});

test('does not suggest a different role from the same position', () => {
  // Dogfight is a half-guard *sweep*; liking a *pass* should not surface it.
  const out = suggestMoves([], [{ position: 'half-guard', technique: 'knee-slice' }]);
  assert.ok(!keys(out).includes('half-guard/dogfight'));
});

test('suggests the same move in another position', () => {
  // Kimura exists in closed guard, side control, north-south. Liking one should
  // point at the others.
  const out = suggestMoves([], [{ position: 'closed-guard', technique: 'kimura-cg' }]);
  const sc = out.find(s => moveKey(s) === 'side-control/kimura-sc');
  assert.ok(sc, 'kimura elsewhere not suggested');
  assert.match(sc.reason, /kimura/i);
});

test('your own notes boost moves you log alongside a favourite', () => {
  const liked = [{ position: 'half-guard', technique: 'knee-slice' }];
  // Three classes pairing the liked knee slice with a leg drag (open guard —
  // not a structural neighbour, so only co-occurrence can lift it).
  const entries = Array.from({ length: 3 }, () => ({
    tags: [techTag('half-guard', 'knee-slice', 'pass'), techTag('open-guard', 'leg-drag', 'pass')],
  }));
  const out = suggestMoves(entries, liked);
  const legDrag = out.find(s => moveKey(s) === 'open-guard/leg-drag');
  assert.ok(legDrag, 'co-occurring move not suggested');
  assert.match(legDrag.reason, /alongside/i);
});

test('honours the limit and ranks by score', () => {
  const out = suggestMoves([], [{ position: 'half-guard', technique: 'knee-slice' }], { limit: 3 });
  assert.ok(out.length <= 3);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
});

console.log(`\n${passed} passed`);
