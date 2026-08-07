// Tagger tests, including the user's corrections.
//
//   node tests/tagger.test.mjs

import assert from 'node:assert/strict';
import { suggestTags, suggestTagsOnly } from '../js/tagger.js';
import * as store from '../js/store.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const find = (results, position, role) =>
  results.find(r => r.tag.position === position && r.tag.role === role);

test('recognises a technique and files it under the right role', () => {
  const results = suggestTags('Knee slice pass and some leg weave');
  const kneeSlice = find(results, 'half-guard', 'pass');
  assert.ok(kneeSlice, 'knee slice not found');
  assert.equal(kneeSlice.term, 'knee slice');
});

test('longest match wins', () => {
  // "knee slice" must beat a bare "knee"-ish match, and not double-count.
  const results = suggestTags('worked the knee slice today');
  assert.equal(results.filter(r => r.tag.technique === 'knee-slice').length, 1);
});

test('a synonym maps to the canonical technique', () => {
  for (const word of ['knee cut', 'knee slide', 'knee through']) {
    const results = suggestTagsOnly(`drilled the ${word}`);
    assert.ok(results.some(t => t.technique === 'knee-slice'), `${word} did not map`);
  }
});

test('a specific technique suppresses the bare position tag', () => {
  const tags = suggestTagsOnly('knee slice from half guard');
  const bare = tags.filter(t => t.position === 'half-guard' && !t.technique);
  assert.equal(bare.length, 0, 'bare Half Guard tag was not suppressed');
});

test('word boundaries are respected', () => {
  // "guillotined" must not match "guillotine" — otherwise every tense and
  // plural quietly produces tags the user did not mean.
  const tags = suggestTagsOnly('got guillotined three times');
  assert.ok(!tags.some(t => t.technique === 'guillotine'), 'matched inside a longer word');
});

test('muting a word stops it being suggested', () => {
  const corrections = { aliases: [], muted: [{ term: 'pressure' }], updatedAt: '1' };
  const tags = suggestTagsOnly('all about pressure today', corrections);
  assert.ok(!tags.some(t => t.concept === 'Pressure'), 'muted word still suggested');
});

test('a taught word is recognised', () => {
  const corrections = {
    aliases: [{ term: 'the rodeo', tag: { kind: 'pos', position: 'half-guard', role: 'sweep', technique: 'dogfight' } }],
    muted: [],
    updatedAt: '2',
  };
  const tags = suggestTagsOnly('hit the rodeo twice', corrections);
  assert.ok(tags.some(t => t.technique === 'dogfight'), 'taught word not recognised');
});

test('a taught word overrides the shipped meaning', () => {
  const corrections = {
    aliases: [{ term: 'knee slice', tag: { kind: 'pos', position: 'mount', role: 'submit' } }],
    muted: [],
    updatedAt: '3',
  };
  const tags = suggestTagsOnly('knee slice', corrections);
  assert.ok(tags.some(t => t.position === 'mount'), 'override not applied');
  assert.ok(!tags.some(t => t.technique === 'knee-slice'), 'shipped meaning still present');
});

test('corrections take effect immediately, not on the next reload', () => {
  // The index is cached; a new updatedAt has to invalidate it.
  const base = suggestTagsOnly('pressure', { aliases: [], muted: [], updatedAt: 'a' });
  assert.ok(base.some(t => t.concept === 'Pressure'));
  const after = suggestTagsOnly('pressure', { aliases: [], muted: [{ term: 'pressure' }], updatedAt: 'b' });
  assert.ok(!after.some(t => t.concept === 'Pressure'), 'stale index served');
});

// ---- search knows what the tagger wrote down -------------------------------
// Search lives in store.js, but it is the other half of this file's subject:
// the whole point of teaching the app a word is that the entry becomes findable
// by what it is *about*, not only by the words you happened to type.

const entry = (id, body, tags) => ({ id, type: 'class', date: '2026-08-01', title: '', body, tags });

test('search finds an entry by a technique it was tagged with, not just the text', () => {
  // The gym calls it "the shoulder thing"; the override system turned that into
  // a Kimura tag. Searching the real name has to find it.
  const entries = [
    entry('a', 'worked the shoulder thing from side control', [
      { kind: 'pos', position: 'side-control', role: 'submit', technique: 'kimura-sc' },
    ]),
    entry('b', 'just some drilling', []),
  ];
  const hits = store.search(entries, 'kimura');
  assert.equal(hits.length, 1, 'the tagged technique was not searched');
  assert.equal(hits[0].id, 'a');
});

test('search finds an entry by role', () => {
  const entries = [entry('a', 'nothing useful in this text', [
    { kind: 'pos', position: 'half-guard', role: 'sweep', technique: 'dogfight' },
  ])];
  assert.equal(store.search(entries, 'sweep').length, 1, 'the role was not searched');
});

test('search still matches positions, concepts and raw text', () => {
  const entries = [
    entry('pos', 'x', [{ kind: 'pos', position: 'half-guard', role: 'sweep' }]),
    entry('con', 'x', [{ kind: 'concept', concept: 'Pressure' }]),
    entry('txt', 'lots of grip fighting today', []),
  ];
  assert.deepEqual(store.search(entries, 'half guard').map(e => e.id), ['pos']);
  assert.deepEqual(store.search(entries, 'pressure').map(e => e.id), ['con']);
  assert.deepEqual(store.search(entries, 'grip').map(e => e.id), ['txt']);
  assert.deepEqual(store.search(entries, '   ').map(e => e.id), []);
});

console.log(`\n${passed} passed`);
