// When a service-worker update is allowed to reload the page — pure node.
//
//   node tests/swupdate.test.mjs
//
// These rules exist because getting them wrong is invisible in opposite
// directions: too eager and a reload eats a class you were half-way through
// writing up; too shy and the app keeps serving yesterday's build, which is the
// bug this module was written to fix in the first place.

import assert from 'node:assert/strict';
import { createUpdateGate, BOOT_GRACE_MS } from '../js/swupdate.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

/** A gate that records how many times it would have reloaded. */
const gateWith = (opts = {}) => {
  const calls = [];
  const gate = createUpdateGate({ apply: () => calls.push(1), ...opts });
  return { gate, calls };
};

test('an update during boot applies straight away', () => {
  // The common case by far: the new worker activates while the app is still
  // starting, before anything could have been typed.
  const { gate, calls } = gateWith();
  assert.equal(gate.controllerChanged({ hadController: true, elapsedMs: 400 }), true);
  assert.equal(calls.length, 1, 'a boot-time update did not reload');
  assert.equal(gate.pending, false);
});

test('a first-ever install never reloads', () => {
  // No worker was driving this page, so the shell on screen came from the
  // network and is already current. Reloading would be a flash for nothing.
  const { gate, calls } = gateWith();
  assert.equal(gate.controllerChanged({ hadController: false, elapsedMs: 200 }), false);
  assert.equal(calls.length, 0, 'a first install reloaded the page');
  assert.equal(gate.pending, false, 'a first install left an update pending');
  // And it must not reload later either.
  assert.equal(gate.safeMoment(), false);
  assert.equal(calls.length, 0);
});

test('an update mid-session waits instead of eating what you typed', () => {
  // The log form is not autosaved. Reloading here loses the entry outright,
  // which is the one thing this app guards above everything else.
  const { gate, calls } = gateWith();
  assert.equal(
    gate.controllerChanged({ hadController: true, elapsedMs: BOOT_GRACE_MS + 1 }), false);
  assert.equal(calls.length, 0, 'reloaded in the middle of a session');
  assert.equal(gate.pending, true, 'the update was dropped rather than deferred');
});

test('a deferred update lands at the next safe moment', () => {
  const { gate, calls } = gateWith();
  gate.controllerChanged({ hadController: true, elapsedMs: 60_000 });
  assert.equal(gate.safeMoment(), true, 'the deferred update never applied');
  assert.equal(calls.length, 1);
  assert.equal(gate.pending, false);
});

test('a safe moment with nothing pending does nothing', () => {
  // Route changes and foreground returns happen constantly. They must not
  // reload the app on their own.
  const { gate, calls } = gateWith();
  for (let i = 0; i < 5; i++) assert.equal(gate.safeMoment(), false);
  assert.equal(calls.length, 0, 'ordinary navigation reloaded the app');
});

test('it reloads once, whatever happens afterwards', () => {
  // A reload loop here would be unrecoverable on the device: the app would
  // never stay on screen long enough to fix it.
  const { gate, calls } = gateWith();
  gate.controllerChanged({ hadController: true, elapsedMs: 100 });
  gate.controllerChanged({ hadController: true, elapsedMs: 200 });
  gate.safeMoment();
  gate.safeMoment();
  assert.equal(calls.length, 1, `reloaded ${calls.length} times`);
});

test('a deferred update still only fires once across many safe moments', () => {
  const { gate, calls } = gateWith();
  gate.controllerChanged({ hadController: true, elapsedMs: 99_000 });
  gate.safeMoment();
  gate.safeMoment();
  gate.safeMoment();
  assert.equal(calls.length, 1, `reloaded ${calls.length} times`);
});

test('the boot grace is short enough that nothing is typed inside it', () => {
  // Three seconds is the claim. If this ever grows, the argument that "nothing
  // could have been typed yet" stops holding and the guard stops being one.
  assert.ok(BOOT_GRACE_MS > 0 && BOOT_GRACE_MS <= 5000,
    `boot grace is ${BOOT_GRACE_MS}ms, too long to call it "still booting"`);
});

console.log(`\n${passed} passed`);
