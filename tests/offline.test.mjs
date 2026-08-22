// Offline readiness — the precache lists and the wording the user reads.
//
//   node tests/offline.test.mjs
//
// Two jobs. The first is structural: sw.js splits its precache into CORE (the
// app, atomic, must succeed) and EXTRAS (2.3 MB of voice clips, best effort),
// and the split only holds if nothing required lands in the optional half or
// vice versa. Until v53 they were one `cache.addAll`, so one failed clip left
// *nothing* cached and the app had no offline mode at all — silently.
//
// The second is `describeOffline`, which is pure precisely so the sentence a
// user reads before boarding a plane can be checked.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describeOffline } from '../js/offline.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('\u2713', name); }
  catch (e) { console.log('\u2717', name, '\n  ', e.message); process.exitCode = 1; }
};

const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

/** Pull a `const NAME = [ … ];` list of string literals out of sw.js. */
function swList(name) {
  const block = sw.match(new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\];`));
  assert.ok(block, `sw.js no longer declares a ${name} list`);
  return [...block[0].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

const CORE = swList('CORE');
const LAZY = swList('LAZY');

/** Every .js under js/, repo-relative, the way sw.js spells them. */
function modules(dir = 'js') {
  const out = [];
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...modules(`${dir}/${entry.name}`));
    else if (entry.name.endsWith('.js')) out.push(`${dir}/${entry.name}`);
  }
  return out;
}

test('every module the app imports is in CORE', () => {
  // A module on disk but not precached works perfectly on wifi and is a white
  // screen the moment the phone loses signal — the worst shape of bug this app
  // can ship, because every test and every check passes. This is the v41 audio
  // lesson (a file on disk, missing from SHELL) applied to the part that is not
  // optional.
  //
  // LAZY is the one way out, and it is deliberately narrow — see the next test.
  for (const file of modules()) {
    assert.ok(CORE.includes(file) || LAZY.includes(file),
      `${file} is not precached — the app breaks offline without it`);
  }
});

test('a module outside CORE is genuinely lazy and genuinely optional', () => {
  // LAZY exists so a big file only one screen reads does not have to ride in an
  // atomic `addAll` (v58, the lift artwork). The escape hatch is worth exactly
  // as much as its guard: put a statically imported module in here and it is
  // the v41 bug again with a comment explaining why it is fine.
  //
  // So each entry must actually be reached with `import()` somewhere under js/,
  // and must not also be statically imported — a module that is both is loaded
  // at boot anyway, and being outside CORE only makes it a white screen.
  const sources = modules().map(f => [f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')]);
  for (const file of LAZY) {
    const name = file.replace(/^.*\//, '');
    const dynamic = sources.some(([, src]) => new RegExp(`import\\([^)]*${name}`).test(src));
    assert.ok(dynamic, `${file} is in LAZY but nothing import()s it — it would simply never load`);
    const statik = sources.some(([, src]) => new RegExp(`^import[^(].*${name}`, 'm').test(src));
    assert.ok(!statik, `${file} is in LAZY but also imported statically, so it loads at boot regardless`);
  }
});

test('CORE is only the app, and stays small enough to be atomic', () => {
  // `cache.addAll(CORE)` is all-or-nothing. That is right for the app and wrong
  // for the audio: one dropped clip in 134 must not cost the whole install.
  for (const url of CORE) {
    assert.ok(!url.startsWith('audio/'),
      `${url} is optional and belongs in EXTRAS — a failed clip must not fail the install`);
  }
  assert.ok(CORE.length < 60, `CORE has grown to ${CORE.length} files; it is meant to be the app alone`);
});

test('CORE covers the files index.html asks for by name', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, href] of index.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
    if (href.startsWith('http')) continue;
    assert.ok(CORE.includes(href), `index.html loads ${href}, which is not precached`);
  }
});

test('the worker answers the two questions the Settings card asks it', () => {
  // The card is dead without these, and a typo in either name fails silently:
  // postMessage has no reply path of its own, so an unhandled type just times
  // out and the button sits on "Checking…".
  for (const type of ['OFFLINE_STATUS', 'PRECACHE', 'SKIP_WAITING']) {
    assert.ok(sw.includes(`'${type}'`), `sw.js handles no ${type} message`);
  }
});

test('a navigation offline falls back to the shell, not the browser error page', () => {
  // Everything the app routes to lives behind the hash, so any navigation can
  // be answered with the cached shell. Without this, an uncached URL offline
  // gives Firefox's "server not found" — which reads as "the app is gone".
  assert.match(sw, /request\.mode === 'navigate'/);
});

test('describeOffline says not-ready when the app itself is missing', () => {
  const said = describeOffline({ supported: true, core: 45, coreMissing: 3, total: 179, missing: 40 });
  assert.equal(said.ready, false);
  assert.equal(said.complete, false);
  assert.match(said.detail, /3 of the 45 files/);
});

test('describeOffline calls a phone with the app but not the audio ready', () => {
  // The distinction the whole card exists for: 2.3 MB of the download is voice
  // cues, none of which matter for reading or writing a note. Telling someone
  // they are not ready for a flight over a missing stretch clip is a lie.
  const said = describeOffline({ supported: true, core: 45, coreMissing: 0, total: 179, missing: 12 });
  assert.equal(said.ready, true);
  assert.equal(said.complete, false);
  assert.match(said.detail, /12 of 179/);
  assert.match(said.detail, /silent/);
});

test('describeOffline is unambiguous when everything is cached', () => {
  const said = describeOffline({ supported: true, core: 45, coreMissing: 0, total: 179, missing: 0 });
  assert.equal(said.ready, true);
  assert.equal(said.complete, true);
});

test('describeOffline handles having no worker to ask at all', () => {
  for (const status of [null, undefined, { supported: false, reason: 'unsupported' }, { supported: false, reason: 'timeout' }]) {
    const said = describeOffline(status);
    assert.equal(said.ready, false);
    assert.ok(said.detail.length > 0);
  }
  // A browser with no service worker still has the notes; say so, or the card
  // reads as "your journal is at risk", which is not what it means.
  assert.match(describeOffline({ supported: false, reason: 'unsupported' }).detail, /still safe/);
});

console.log(`\n${passed} passed`);
