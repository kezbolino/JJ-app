// Round-trip test for the markdown serialiser.
//
// This is the only thing standing between the user and a corrupted backup: if
// toMarkdown → fromMarkdown loses a field, notes rot silently in the repo.
//
//   node tests/markdown.test.mjs

import assert from 'node:assert/strict';
import { toMarkdown, fromMarkdown, pathFor, buildIndex } from '../js/markdown.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n ', e.message); process.exitCode = 1; }
};

const classEntry = {
  id: '3f2a1b9c-0000-4000-8000-000000000001',
  type: 'class',
  date: '2026-07-27',
  coach: 'John',
  gi: 'gi',
  title: '',
  sections: {
    techniques: 'Knee slice pass\nLeg weave pass',
    rolling: 'Passed Steve twice. Got guillotined three times.',
    thoughts: 'Keep the hips lower.',
  },
  body: '',
  tags: [
    { kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' },
    { kind: 'pos', position: 'half-guard', role: null },
    { kind: 'concept', concept: 'Pressure' },
  ],
  video: null,
  createdAt: '2026-07-27T18:00:00.000Z',
  updatedAt: '2026-07-27T19:30:00.000Z',
};

test('class entry survives a round trip', () => {
  const back = fromMarkdown(toMarkdown(classEntry));
  for (const key of ['id', 'type', 'date', 'coach', 'gi', 'createdAt', 'updatedAt']) {
    assert.equal(back[key], classEntry[key], `${key} changed`);
  }
  assert.deepEqual(back.sections, classEntry.sections);
  assert.deepEqual(back.tags, classEntry.tags);
});

test('markdown is actually readable', () => {
  const md = toMarkdown(classEntry);
  assert.match(md, /^---\n/);
  assert.match(md, /## Techniques\n\nKnee slice pass/);
  assert.match(md, /tags: \[half-guard\/pass\/knee-slice, half-guard\/-, concept:Pressure\]/);
});

test('question entry survives a round trip', () => {
  const question = {
    ...classEntry,
    id: 'aaaa1111-0000-4000-8000-000000000002',
    type: 'question',
    coach: '',
    gi: null,
    sections: { techniques: '', rolling: '', thoughts: '' },
    body: 'Why do I keep getting flattened in half guard?',
    tags: [{ kind: 'pos', position: 'half-guard', role: null }],
  };
  const back = fromMarkdown(toMarkdown(question));
  assert.equal(back.body, question.body);
  assert.equal(back.type, 'question');
  assert.equal(back.gi, null);
  assert.deepEqual(back.tags, question.tags);
});

test('video entry keeps its url and id', () => {
  const video = {
    ...classEntry,
    id: 'bbbb2222-0000-4000-8000-000000000003',
    type: 'video',
    coach: '',
    gi: null,
    title: 'Lachlan Giles — Half Guard Passing',
    sections: { techniques: '', rolling: '', thoughts: '' },
    body: 'good detail on the crossface',
    video: { videoId: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'x', thumb: 'x' },
  };
  const back = fromMarkdown(toMarkdown(video));
  assert.equal(back.video.url, video.video.url);
  assert.equal(back.video.videoId, video.video.videoId);
  assert.equal(back.title, video.title);
  assert.equal(back.body, 'good detail on the crossface');
});

test('awkward characters survive', () => {
  const awkward = {
    ...classEntry,
    id: 'cccc3333-0000-4000-8000-000000000004',
    coach: 'Ana: the "boss"',
    sections: { techniques: 'mata leão — from the back', rolling: '', thoughts: '' },
  };
  const back = fromMarkdown(toMarkdown(awkward));
  assert.equal(back.coach, awkward.coach);
  assert.equal(back.sections.techniques, awkward.sections.techniques);
});

test('empty optional fields do not appear', () => {
  const bare = {
    ...classEntry,
    id: 'dddd4444-0000-4000-8000-000000000005',
    coach: '',
    gi: null,
    tags: [],
  };
  const md = toMarkdown(bare);
  assert.ok(!md.includes('coach:'), 'empty coach was written');
  assert.ok(!md.includes('gi:'), 'null gi was written');
  assert.ok(!md.includes('tags:'), 'empty tags were written');
  const back = fromMarkdown(md);
  assert.equal(back.coach, '');
  assert.equal(back.gi, null);
  assert.deepEqual(back.tags, []);
});

test('paths are stable and type-sorted', () => {
  assert.equal(pathFor(classEntry), 'class/2026-07-27-3f2a1b9c.md');
  assert.equal(pathFor(classEntry), pathFor({ ...classEntry, coach: 'someone else' }));
});

test('index links every entry', () => {
  const index = buildIndex([classEntry]);
  assert.ok(index.includes('class/2026-07-27-3f2a1b9c.md'), 'entry missing from index');
  assert.ok(index.includes('1 entry'));
});

test('rejects a file that is not ours', () => {
  assert.throws(() => fromMarkdown('# just a note\n\nno front matter here'), /front matter/);
});

console.log(`\n${passed} passed`);
