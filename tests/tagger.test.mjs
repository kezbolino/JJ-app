// Tagger tests, including the user's corrections.
//
//   node tests/tagger.test.mjs

import assert from 'node:assert/strict';
import { suggestTags, suggestTagsOnly } from '../js/tagger.js';

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

console.log(`\n${passed} passed`);
