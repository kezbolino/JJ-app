// Sync tests: real app, real IndexedDB, fake GitHub.
//
// What matters here is that nothing is lost. Notes must land in the repo as
// readable markdown, come back intact on a second device, and survive edits
// without duplicating or clobbering.
//
//   python3 -m http.server 8099 &   # from the repo root
//   node tests/sync.test.mjs

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { startFakeGitHub } from './fake-github.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch { return import(`${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`); }
}
const { chromium } = await loadPlaywright();

const BASE = process.env.BASE_URL ?? 'http://localhost:8099/';
const { server, state, url: apiBase } = await startFakeGitHub();

const browser = await chromium.launch();
let passed = 0;

const test = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

/** A fresh browser context = a fresh device, with its own empty IndexedDB. */
async function newDevice() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', e => console.log('   PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async api => {
    const sync = await import('/js/sync.js');
    await sync.setConfig({ owner: 'kezbolino', repo: 'jj-app-data', branch: 'main', token: 'fake', apiBase: api });
  }, apiBase);
  return { context, page };
}

const addClass = (page, patch) => page.evaluate(async p => {
  const store = await import('/js/store.js');
  return (await store.saveEntry(store.newEntry(p))).id;
}, patch);

const runSync = page => page.evaluate(async () => (await import('/js/sync.js')).sync());
const readEntries = page => page.evaluate(async () => (await import('/js/store.js')).allEntries());

// ---------------------------------------------------------------------------

const phone = await newDevice();

await test('first sync writes markdown into an empty repo', async () => {
  await addClass(phone.page, {
    date: '2026-07-27',
    coach: 'John',
    gi: 'gi',
    sections: { techniques: 'Knee slice pass', rolling: 'Passed Steve twice', thoughts: 'Hips lower' },
    tags: [{ kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' }],
  });

  const result = await runSync(phone.page);
  assert.equal(result.pushed, 1, 'should have pushed one note');

  const files = state.files;
  const notePath = Object.keys(files).find(p => p.startsWith('class/'));
  assert.ok(notePath, `no class file written, got ${Object.keys(files)}`);
  assert.match(files[notePath], /^---\n/, 'no front matter');
  assert.match(files[notePath], /coach: John/);
  assert.match(files[notePath], /## Techniques\n\nKnee slice pass/);
  assert.ok(files['README.md']?.includes(notePath), 'index does not link the note');
});

await test('syncing again with no changes is a no-op', async () => {
  const before = state.commitCount;
  const result = await runSync(phone.page);
  assert.equal(result.pushed, 0, 'pushed despite nothing changing');
  assert.equal(state.commitCount, before, 'made an empty commit');
});

await test('a second device pulls the notes down', async () => {
  const laptop = await newDevice();
  const result = await runSync(laptop.page);
  assert.equal(result.added, 1, 'did not pull the note');

  const entries = await readEntries(laptop.page);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].coach, 'John');
  assert.equal(entries[0].gi, 'gi');
  assert.equal(entries[0].sections.thoughts, 'Hips lower');
  assert.deepEqual(entries[0].tags, [
    { kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' },
  ]);
  await laptop.context.close();
});

await test('an edit on one device reaches the other', async () => {
  const laptop = await newDevice();
  await runSync(laptop.page);

  await laptop.page.evaluate(async () => {
    const store = await import('/js/store.js');
    const [entry] = await store.allEntries();
    entry.sections.thoughts = 'Hips lower, and keep the crossface';
    await store.saveEntry(entry);
  });
  const pushed = await runSync(laptop.page);
  assert.equal(pushed.pushed, 1, 'edit was not pushed');

  const back = await runSync(phone.page);
  assert.equal(back.updated, 1, 'edit did not come back');
  const entries = await readEntries(phone.page);
  assert.equal(entries[0].sections.thoughts, 'Hips lower, and keep the crossface');
  assert.equal(entries.length, 1, 'edit duplicated the entry');
  await laptop.context.close();
});

await test('notes from two devices merge rather than overwrite', async () => {
  const laptop = await newDevice();
  await runSync(laptop.page);

  await addClass(laptop.page, { date: '2026-07-28', coach: 'Ana', sections: { techniques: 'Triangle', rolling: '', thoughts: '' } });
  await addClass(phone.page, { date: '2026-07-29', coach: 'Sam', sections: { techniques: 'Upa', rolling: '', thoughts: '' } });

  await runSync(laptop.page);
  await runSync(phone.page);
  await runSync(laptop.page);

  const onPhone = await readEntries(phone.page);
  const onLaptop = await readEntries(laptop.page);
  assert.equal(onPhone.length, 3, `phone has ${onPhone.length} entries`);
  assert.equal(onLaptop.length, 3, `laptop has ${onLaptop.length} entries`);
  await laptop.context.close();
});

await test('deleting locally removes the file from the repo', async () => {
  const before = Object.keys(state.files).filter(p => p.endsWith('.md') && p !== 'README.md').length;
  await phone.page.evaluate(async () => {
    const store = await import('/js/store.js');
    const entries = await store.allEntries();
    await store.deleteEntry(entries.find(e => e.coach === 'Sam').id);
  });
  const result = await runSync(phone.page);
  assert.equal(result.deleted, 1, 'file was not deleted');
  const after = Object.keys(state.files).filter(p => p.endsWith('.md') && p !== 'README.md').length;
  assert.equal(after, before - 1, 'repo still holds the deleted note');
});

await test('a deletion propagates to the other device instead of bouncing back', async () => {
  const laptop = await newDevice();
  await runSync(laptop.page);
  const before = (await readEntries(laptop.page)).length;
  assert.ok(before > 0, 'laptop pulled nothing to begin with');

  const target = await phone.page.evaluate(async () => {
    const store = await import('/js/store.js');
    const entries = await store.allEntries();
    const doomed = entries.find(e => e.coach === 'Ana');
    await store.deleteEntry(doomed.id);
    return doomed.id;
  });
  await runSync(phone.page);

  const result = await runSync(laptop.page);
  assert.equal(result.removed, 1, 'laptop did not apply the deletion');

  const onLaptop = await readEntries(laptop.page);
  assert.ok(!onLaptop.some(e => e.id === target), 'deleted note still on the laptop');
  assert.equal(onLaptop.length, before - 1);

  // And it must not come back on the next round trip.
  await runSync(phone.page);
  const onPhone = await readEntries(phone.page);
  assert.ok(!onPhone.some(e => e.id === target), 'deleted note was resurrected');
  await laptop.context.close();
});

await test('local-only notes are never deleted by a pull', async () => {
  const fresh = await newDevice();
  await addClass(fresh.page, { date: '2026-08-01', coach: 'Offline', sections: { techniques: 'Armbar', rolling: '', thoughts: '' } });
  const result = await runSync(fresh.page);
  assert.equal(result.removed, 0, 'pull removed an unsynced local note');
  const entries = await readEntries(fresh.page);
  assert.ok(entries.some(e => e.coach === 'Offline'), 'local-only note vanished');
  await fresh.context.close();
});

await test('ontology corrections reach the other device', async () => {
  await phone.page.evaluate(async () => {
    const overrides = await import('/js/overrides.js');
    await overrides.addAlias('the rodeo', { kind: 'pos', position: 'half-guard', role: 'sweep', technique: 'dogfight' });
    await overrides.muteTerm('pressure');
  });
  await runSync(phone.page);

  assert.ok(state.files['ontology-overrides.md'], 'corrections file was not written');
  assert.match(state.files['ontology-overrides.md'], /the rodeo -> half-guard\/sweep\/dogfight/);

  const laptop = await newDevice();
  await runSync(laptop.page);
  const theirs = await laptop.page.evaluate(async () =>
    (await import('/js/overrides.js')).getOverrides());

  assert.equal(theirs.aliases.length, 1, 'alias did not travel');
  assert.equal(theirs.aliases[0].term, 'the rodeo');
  assert.deepEqual(theirs.muted.map(m => m.term), ['pressure']);

  // And the laptop's tagger honours them straight away.
  const tags = await laptop.page.evaluate(async () => {
    const { suggestTagsOnly } = await import('/js/tagger.js');
    const { getOverrides } = await import('/js/overrides.js');
    return suggestTagsOnly('hit the rodeo, all about pressure', await getOverrides());
  });
  assert.ok(tags.some(t => t.technique === 'dogfight'), 'taught word not applied on the other device');
  assert.ok(!tags.some(t => t.concept === 'Pressure'), 'mute not applied on the other device');
  await laptop.context.close();
});

await test('the repo is browsable — types are foldered, index lists everything', async () => {
  await addClass(phone.page, { type: 'question', body: 'Why do I keep getting flattened?' });
  await runSync(phone.page);
  const paths = Object.keys(state.files);
  assert.ok(paths.some(p => p.startsWith('class/')), 'no class folder');
  assert.ok(paths.some(p => p.startsWith('question/')), 'no question folder');
  assert.match(state.files['README.md'], /## Classes/);
});

await phone.context.close();
await browser.close();
server.close();

console.log(`\n${passed} passed`);
