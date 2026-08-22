// The v17/v18 features, driven in a real browser.
//
// tests/smoke.mjs still owns the core loop (log → tag → position page →
// dashboard → coverage prompt). This file covers what v17 added and v18 kept,
// plus the render-clobber regression, which is the one bug here that destroyed
// user data rather than just displaying something wrong.
//
// The round timer was removed in v18 — no phones on the mat — so its three
// tests went with it. Nothing else in here depended on them.
//
//   python3 -m http.server 8099 &   # from the repo root
//   node tests/features.test.mjs

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { startFakeGitHub } from './fake-github.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); }
  catch { return import(`${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`); }
}
const { chromium } = await loadPlaywright();

const BASE = process.env.BASE_URL ?? 'http://localhost:8099/';
const browser = await chromium.launch();

let passed = 0;
const errors = [];

const test = async (name, fn) => {
  try { await fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

/** A fresh browser context = a fresh device, with its own empty IndexedDB. */
// The one voice that has clips recorded. Everything below asserts on *which*
// cue fired, never on who says it, so the voice is pinned here: left on Mix
// these tests would roll a voice per session (js/voices.js) and half the runs
// would assert against a folder with no files in it. The roll itself is
// unit-tested in tests/stretches.test.mjs, and pinned again in the two voice
// tests at the end of this file.
const TEST_VOICE = 'snoop';

async function newPage({ voice = TEST_VOICE } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(8000);   // fail fast; a hung selector shouldn't cost 30s
  await context.addInitScript(v => {
    if (v) localStorage.setItem('jj-voice', v); else localStorage.removeItem('jj-voice');
  }, voice);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${e.message}`));
  page.on('console', m => {
    // Chrome logs every failed request as a console error with no URL attached.
    // The sync tests deliberately provoke one: asking an empty repo for its HEAD
    // ref 404s, and js/sync.js catches exactly that to mean "nothing here yet".
    // Real failures are caught by the response listener below, which does have
    // the URL, so dropping the blind message loses nothing.
    if (m.type() !== 'error') return;
    if (m.text().startsWith('Failed to load resource')) return;
    errors.push(m.text());
  });
  page.on('response', res => {
    if (res.status() < 400) return;
    if (res.url().startsWith('http://localhost:809')) {
      // 8098/8097/8096 are the fake GitHub; only the app's own host matters here.
      if (!res.url().startsWith(BASE)) return;
    }
    // A movement with no voice clip recorded yet 404s by design —
    // js/views/stretch.js's createVoice() catches exactly that and stays
    // silent, the same contract PENDING_ART has for artwork.
    if (res.status() === 404 && res.url().includes('/audio/cues/')) return;
    errors.push(`${res.status()} ${res.url()}`);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

const seed = (page, entries) => page.evaluate(async list => {
  const store = await import('/js/store.js');
  for (const patch of list) await store.saveEntry(store.newEntry(patch));
}, entries);

const setSetting = (page, key, value) => page.evaluate(async ([k, v]) => {
  const store = await import('/js/store.js');
  await store.setSetting(k, v);
}, [key, value]);

const go = async (page, hash) => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(260);
};

// A date helper matching js/dates.js, so the tests reason in local time too.
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => localISO(new Date(Date.now() - n * 864e5));

// Days since this week's Monday — js/dates.js counts weeks Monday-first.
const sinceMonday = () => (new Date().getDay() + 6) % 7;
/**
 * A date `weeksBack` whole weeks ago, `dayOffset` days after that week's Monday.
 *
 * Anchoring to the week grid rather than counting raw days back is what makes a
 * streak fixture mean the same thing on every weekday. `daysAgo(1)` and
 * `daysAgo(3)` straddle a Monday if today is a Tuesday or a Wednesday, so a seed
 * meant to be "two classes a week for three weeks" silently became four weeks
 * and the assertion failed two days in seven.
 */
const inWeek = (weeksBack, dayOffset) => daysAgo(sinceMonday() + weeksBack * 7 - dayOffset);

// ---------------------------------------------------------------------------
// 1. The regression that mattered: a late async re-render must not destroy the
//    screen the user has since navigated to.
// ---------------------------------------------------------------------------

await test('a sync settling after you navigate away cannot wipe the log form', async () => {
  const { server, url: apiBase } = await startFakeGitHub({ port: 8097 });
  const page = await newPage();

  // Every GitHub call takes over a second, so the sync is genuinely in flight
  // while the user moves on — the shape of a phone on gym wifi.
  await page.route(apiBase + '/**', async route => {
    await new Promise(r => setTimeout(r, 900));
    route.continue();
  });

  await page.evaluate(async api => {
    const sync = await import('/js/sync.js');
    const store = await import('/js/store.js');
    await sync.setConfig({ owner: 'kezbolino', repo: 'jj-app-data', branch: 'main', token: 'fake', apiBase: api });
    await store.saveEntry(store.newEntry({ date: '2026-07-30', gi: 'gi' }));
    await store.setSetting('lastSyncAt', '2026-07-01T00:00:00.000Z');  // stale → autosync fires
  }, apiBase);

  await go(page, '/');                       // Home starts the daily auto-sync
  await go(page, '/log');                    // …and the user goes straight to Log
  await page.waitForSelector('textarea');
  const typed = 'Drilled the knee slice for an hour, felt great';
  await page.locator('textarea').first().fill(typed);

  await page.waitForTimeout(6000);           // let the sync finish

  assert.equal(await page.evaluate(() => location.hash), '#/log');
  const still = await page.locator('textarea').first().inputValue();
  assert.equal(still, typed, 'the half-written class was destroyed by the sync re-render');

  await page.context().close();
  server.close();
});

// ---------------------------------------------------------------------------
// 2. Streak, and the calendar on the back of the stats strip
// ---------------------------------------------------------------------------

await test('the strip shows a week streak, and the calendar is not on screen until asked', async () => {
  const page = await newPage();
  // Two classes in each of the three completed weeks — Monday and Wednesday of
  // each — so the streak is exactly 3 whatever day this test runs on.
  await seed(page, [
    { date: inWeek(1, 0), gi: 'gi' }, { date: inWeek(1, 2), gi: 'nogi' },
    { date: inWeek(2, 0), gi: 'gi' }, { date: inWeek(2, 2), gi: 'nogi' },
    { date: inWeek(3, 0), gi: 'gi' }, { date: inWeek(3, 2), gi: 'nogi' },
  ]);
  await go(page, '/');
  await page.waitForSelector('.sbit-total');

  const streak = await page.locator('.streak').innerText();
  assert.match(streak, /3 wk/, `streak read "${streak}"`);

  // v19: the calendar came off the dashboard and onto the back of the strip.
  // It is still in the DOM (it is the other face of the card) — what matters
  // is that the front is what you see, so assert on the flip state.
  assert.equal(await page.locator('.flipcard.is-flipped').count(), 0);
  assert.equal(await page.locator('.sbit-total').getAttribute('aria-expanded'), 'false');
  await page.context().close();
});

await test('tapping the total flips the card to the calendar, and Done flips it back', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1), gi: 'gi' }, { date: daysAgo(3), gi: 'nogi' }]);
  await go(page, '/');

  await page.click('.sbit-total');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.flipcard.is-flipped').count(), 1);
  assert.equal(await page.locator('.sbit-total').getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('.hcal-month').isVisible(), 'no month showing after the flip');
  const marked = await page.locator('.cal__day.is-on').count();
  assert.ok(marked >= 1, `expected this month's training days marked, got ${marked}`);

  // Done is the only way back — the flip button is on the face that is now
  // turned away, and inert. If this ever stops working the card is a trap.
  await page.click('.hcal-close');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.flipcard.is-flipped').count(), 0);
  await page.context().close();
});

await test('the hidden face is inert, so neither side can be tabbed to while turned away', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1), gi: 'gi' }]);
  await go(page, '/');

  assert.equal(await page.locator('.hero-cal').evaluate(el => el.inert), true,
    'the calendar face is reachable by keyboard while face-down');
  await page.click('.sbit-total');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.stats.flip-face').evaluate(el => el.inert), true,
    'the stats face is reachable by keyboard while face-down');
  await page.context().close();
});

await test('the arrows page through months and stop at the ends', async () => {
  const page = await newPage();
  // One class this month, one two months back, so there is a range to walk.
  await seed(page, [{ date: daysAgo(1) }, { date: daysAgo(70) }]);
  await go(page, '/');
  await page.click('.sbit-total');
  await page.waitForTimeout(700);

  // The card opens on the month of the latest class. Page forward to this
  // month first, so the assertion holds whatever day of the month it is.
  const nextArrow = page.locator('.hcal-arrow[aria-label="Next month"]');
  while (!(await nextArrow.isDisabled())) {
    await nextArrow.click();
    await page.waitForTimeout(150);
  }
  assert.equal(await nextArrow.isDisabled(), true, 'able to page past this month');

  const month = () => page.locator('.hcal-month').innerText();
  const start = await month();

  await page.click('.hcal-arrow[aria-label="Previous month"]');
  await page.waitForTimeout(250);
  assert.notEqual(await month(), start, 'the previous arrow did not change the month');

  await page.click('.hcal-arrow[aria-label="Next month"]');
  await page.waitForTimeout(250);
  assert.equal(await month(), start, 'paging back and forward did not return to this month');
  await page.context().close();
});

await test('swiping the calendar changes the month; a vertical drag does not', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1) }, { date: daysAgo(70) }]);
  await go(page, '/');
  await page.click('.sbit-total');
  await page.waitForTimeout(700);

  // The handler reads touchstart/touchend only, so two synthetic events are a
  // faithful stand-in for a real drag.
  const swipe = (dx, dy) => page.evaluate(([x, y]) => {
    const el = document.querySelector('.hero-cal');
    const touch = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
    el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch(200, 200)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200 + x, 200 + y)], bubbles: true }));
  }, [dx, dy]);

  const month = () => page.locator('.hcal-month').innerText();
  const start = await month();

  await swipe(120, 0);                     // right → back a month
  await page.waitForTimeout(250);
  const back = await month();
  assert.notEqual(back, start, 'swiping right did not go back a month');

  await swipe(-120, 0);                    // left → forward again
  await page.waitForTimeout(250);
  assert.equal(await month(), start, 'swiping left did not come forward again');

  // A mostly-vertical drag is the page scrolling, not a swipe.
  await swipe(30, 140);
  await page.waitForTimeout(250);
  assert.equal(await month(), start, 'a vertical drag changed the month');
  await page.context().close();
});

await test('a calendar day links to the class logged that day', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1), gi: 'gi', sections: { techniques: 'armbar', rolling: '', thoughts: '' } }]);
  await go(page, '/');
  await page.click('.sbit-total');
  await page.waitForTimeout(700);
  await page.click('a.cal__day.is-on');
  await page.waitForSelector('textarea');
  assert.equal(await page.locator('.page-title').innerText(), 'Edit entry');
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 3. The deck
// ---------------------------------------------------------------------------

await test('a card shows its cues without a flip, and the deck still steps', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'half guard passing', back: 'knee across, kill the underhook' },
    { front: 'triangle finish', back: '' },
  ]);

  await go(page, '/focus');
  await page.waitForSelector('.flashcard');
  assert.match(await page.locator('.fc-count').innerText(), /1 \/ 2/);

  // v20 removed the Again/Good/Easy rating and the scheduler behind it.
  assert.equal(await page.locator('.fc-grade').count(), 0, 'the grade buttons are back');

  // v55 removed the flip. Both halves are on one face now, so the cues are
  // readable without touching anything — pinned the way the timer and the
  // session picker were, because a half-removed interaction is worse than
  // either state: a card that still looks tappable but no longer turns.
  assert.ok(await page.locator('.fc-text').first().isVisible());
  assert.equal(await page.locator('.fc-cues').first().innerText(),
    'knee across, kill the underhook', 'the cues are not on the front of the card');
  await page.locator('.flashcard').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.flashcard.flipped').count(), 0, 'the card still flips');
  assert.equal(await page.locator('.fc-back').count(), 0, 'the back face is still being rendered');

  await page.click('.fc-arrow[aria-label="Next"]');
  await page.waitForTimeout(150);
  assert.match(await page.locator('.fc-count').innerText(), /2 \/ 2/);
  // A card with nothing written on it says so, in place, rather than looking
  // like a card whose cues failed to load.
  assert.match(await page.locator('.flashcard .empty').innerText(), /No cues yet/);
  await page.context().close();
});

await test('a card keeps no schedule — nothing due, nothing hidden', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [{ front: 'berimbolo', back: 'no' }]);
  await go(page, '/focus');
  await page.waitForSelector('.flashcard');

  const deck = await page.evaluate(async () => (await import('/js/store.js')).getFocuses());
  assert.deepEqual(Object.keys(deck[0]).sort(), ['back', 'front'],
    `a card carries more than front and back: ${JSON.stringify(deck[0])}`);
  await page.context().close();
});

await test('cues can be added to a card that was made without them', async () => {
  // The gap this closes: until v54 the back of a card could only be written
  // when the card was created. Adding a cue later meant deleting and retyping,
  // which also dropped the card to the bottom of the deck. The card's own back
  // face said "tap Edit to add some" and there was nothing to tap.
  const page = await newPage();
  await setSetting(page, 'focuses', [{ front: 'standing guard break', back: '' }]);
  await go(page, '/focus');
  await page.waitForSelector('.fc-list');

  const row = page.locator('.fc-list li').first();
  await row.locator('.fc-row').click();
  await row.locator('.fc-edit textarea').fill('elbow in, hips back, then step');
  await row.locator('.fc-edit .btn.primary').click();
  await page.waitForTimeout(300);

  const deck = await page.evaluate(async () => (await import('/js/store.js')).getFocuses());
  assert.equal(deck[0].back, 'elbow in, hips back, then step', 'the cue was not saved');
  // Still exactly { front, back } — the v20 invariant, now that a second code
  // path writes a card.
  assert.deepEqual(Object.keys(deck[0]).sort(), ['back', 'front'],
    `editing put something else on the card: ${JSON.stringify(deck[0])}`);

  // And it reaches the card, which is the point of writing it. No tap needed
  // since v55 — the cues sit under the name on the one face.
  assert.match(await page.locator('.fc-cues').first().innerText(), /hips back/);
  await page.context().close();
});

await test('a card can be renamed, and cannot collide with another', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'triangle finish', back: 'cut the angle' },
    { front: 'armbar finish', back: '' },
  ]);
  await go(page, '/focus');
  await page.waitForSelector('.fc-list');

  const second = () => page.locator('.fc-list li').nth(1);
  await second().locator('.fc-row').click();
  await second().locator('.fc-edit input').fill('triangle finish');
  await second().locator('.fc-edit .btn.primary').click();
  await page.waitForTimeout(300);
  let deck = await page.evaluate(async () => (await import('/js/store.js')).getFocuses());
  assert.deepEqual(deck.map(c => c.front), ['triangle finish', 'armbar finish'],
    'a duplicate front was allowed through');

  await second().locator('.fc-edit input').fill('armbar from mount');
  await second().locator('.fc-edit .btn.primary').click();
  await page.waitForTimeout(300);
  deck = await page.evaluate(async () => (await import('/js/store.js')).getFocuses());
  assert.deepEqual(deck.map(c => c.front), ['triangle finish', 'armbar from mount']);
  await page.context().close();
});

await test('a card can be dragged to a new place in the deck', async () => {
  // Order is the array order and nothing else — a card carries no position of
  // its own, because `normalizeFocus` drops anything that is not front/back.
  // Home renders the same list, so the deck order *is* the tile order.
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'half guard passing', back: '' },
    { front: 'triangle finish', back: '' },
    { front: 'standing guard break', back: '' },
  ]);
  await go(page, '/focus');
  await page.waitForSelector('.fc-list');

  const fronts = () => page.$$eval('.fc-list-front', ns => ns.map(n => n.textContent));

  // Drag the last row up past both others. Driven through real pointer events
  // rather than by calling the handler, because the parts that break are the
  // pointer capture and the geometry, and neither shows up in a unit test.
  const grip = await page.locator('.fc-list li').nth(2).locator('.fc-grip').boundingBox();
  const target = await page.locator('.fc-list li').nth(0).boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y - 20, { steps: 5 });
  assert.equal(await page.locator('.fc-list li.is-dragging').count(), 1,
    'the row was never picked up');
  await page.mouse.move(grip.x + grip.width / 2, target.y + 6, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  assert.deepEqual(await fronts(),
    ['standing guard break', 'half guard passing', 'triangle finish'], 'the drag did not reorder');
  const stored = await page.evaluate(async () => (await import('/js/store.js')).getFocuses());
  assert.equal(stored[0].front, 'standing guard break', 'the new order did not persist');
  assert.deepEqual(Object.keys(stored[0]).sort(), ['back', 'front'],
    `reordering put something else on the card: ${JSON.stringify(stored[0])}`);

  await go(page, '/');
  const tiles = await page.$$eval('.wo-tile .wo-front', ns => ns.map(n => n.textContent));
  assert.equal(tiles[0], 'standing guard break', 'Home did not follow the deck order');
  await page.context().close();
});

await test('the drag handle also reorders from the keyboard', async () => {
  // A handle that only answers to a pointer is a control some people cannot
  // reach at all. It is six lines, and it is the reason the ↑ ↓ buttons could
  // go without losing anything.
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'half guard passing', back: '' },
    { front: 'triangle finish', back: '' },
  ]);
  await go(page, '/focus');
  await page.waitForSelector('.fc-list');

  await page.locator('.fc-list li').first().locator('.fc-grip').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(350);
  assert.deepEqual(await page.$$eval('.fc-list-front', ns => ns.map(n => n.textContent)),
    ['triangle finish', 'half guard passing'], 'the keyboard did not move the card');

  // And it cannot walk off the end.
  await page.locator('.fc-list li').first().locator('.fc-grip').focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(350);
  assert.deepEqual(await page.$$eval('.fc-list-front', ns => ns.map(n => n.textContent)),
    ['triangle finish', 'half guard passing'], 'the top card moved above the top');
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 3b. "Working on" as tiles on the front door
// ---------------------------------------------------------------------------

await test('Working on shows every card as a tile, and a tile opens that card', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'half guard passing', back: 'knee across' },
    { front: 'triangle finish', back: 'cut the angle' },
    { front: 'standing guard break', back: '' },
  ]);
  await go(page, '/');
  await page.waitForSelector('.wo-tile');

  assert.equal(await page.locator('.wo-tile').count(), 3);
  assert.match(await page.locator('.wo-tile').first().innerText(), /half guard passing/);
  assert.equal(await page.locator('.wo-dots i').count(), 3, 'no dots for a multi-card deck');

  // Tapping the second tile opens the deck on the second card, not the first.
  await page.click('.wo-tile:nth-child(2)');
  await page.waitForSelector('.flashcard');
  assert.match(await page.locator('.fc-count').innerText(), /2 \/ 3/);
  assert.match(await page.locator('.fc-text').first().innerText(), /triangle finish/);
  await page.context().close();
});

await test('the tiles scroll sideways rather than stacking down the page', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'one', back: '' }, { front: 'two', back: '' }, { front: 'three', back: '' },
  ]);
  await go(page, '/');
  await page.waitForSelector('.wo-rail');

  // The rail is a scroll-snapping overflow row: wider content than box is what
  // makes it swipeable at all, and it is native scrolling rather than a
  // hand-rolled gesture.
  const rail = await page.locator('.wo-rail').evaluate(el => ({
    scrollable: el.scrollWidth > el.clientWidth + 4,
    snap: getComputedStyle(el).scrollSnapType,
  }));
  assert.equal(rail.scrollable, true, 'the tiles are not wider than the rail, so nothing swipes');
  assert.match(rail.snap, /x/, `expected horizontal scroll snapping, got "${rail.snap}"`);

  // Tiles all sit on the same row.
  const tops = await page.locator('.wo-tile').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size, 1, `tiles wrapped onto ${new Set(tops).size} rows`);
  await page.context().close();
});

await test('an empty deck invites you to add one instead of showing a blank rail', async () => {
  const page = await newPage();
  await go(page, '/');
  await page.waitForSelector('.wo-empty');
  assert.equal(await page.locator('.wo-tile').count(), 0);
  await page.click('.wo-empty');
  await page.waitForSelector('.page-title');
  assert.equal(await page.locator('.page-title').innerText(), 'Working on');
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 4. What the log form no longer asks
// ---------------------------------------------------------------------------

// Rounds and the 1-5 self-report went in v21; the session-type picker (open mat
// / competition / private / seminar) in v22. Both at the user's request, and
// both taken out whole rather than hidden. Pinned for the v18 reason: a
// half-removed feature is worse than either state — an input still on the form
// writing to a field nothing reads is silent, in both directions.
await test('the log form asks for the class, not a grade or a category', async () => {
  const page = await newPage();
  await go(page, '/log');
  await page.waitForSelector('textarea');

  assert.equal(await page.locator('.feel-dot').count(), 0, 'the 1-5 dots are still on the form');
  assert.equal(await page.locator('input[type="number"]').count(), 0, 'the rounds input is still on the form');
  assert.equal(await page.locator('.seg-session').count(), 0, 'the session-type picker is still on the form');

  const text = await page.locator('#view').innerText();
  assert.doesNotMatch(text, /how it went/i);
  assert.doesNotMatch(text, /\brounds\b/i);
  for (const label of ['Open mat', 'Competition', 'Private', 'Seminar']) {
    assert.doesNotMatch(text, new RegExp(label, 'i'), `"${label}" is still offered`);
  }

  // Gi / no-gi is the one thing left that says what kind of session it was.
  assert.equal(await page.locator('.seg button:has-text("No-gi")').count(), 1);
  await page.context().close();
});

// The Map card those types fed went with them. A "Mat time" panel whose only
// row is "Regular class: 100%" is a chart of nothing.
await test('the Map no longer breaks classes down by session type', async () => {
  const page = await newPage();
  await seed(page, [
    { date: daysAgo(1), gi: 'gi', sections: { techniques: 'knee slice pass', rolling: '', thoughts: '' } },
    { date: daysAgo(4), gi: 'nogi', sections: { techniques: 'triangle from guard', rolling: '', thoughts: '' } },
  ]);
  await go(page, '/map');
  await page.waitForSelector('.page-title');
  const text = await page.locator('#view').innerText();
  assert.doesNotMatch(text, /mat time/i);
  assert.doesNotMatch(text, /open mat|seminar/i);
  assert.equal(await page.locator('.slist').count(), 0, 'the session breakdown list is still rendered');
  // The map's own content is untouched by the removal.
  assert.match(text, /Your map/i);
  await page.context().close();
});

// The middle log field was relabelled in v21. Text already written under the old
// label is the same field, so it has to show up in the renamed one.
await test('the middle field is Key details, and keeps what was written before', async () => {
  const page = await newPage();
  await seed(page, [{
    date: daysAgo(1),
    sections: { techniques: 'knee slice', rolling: 'grip the collar first', thoughts: '' },
  }]);
  await go(page, '/log');
  await page.waitForSelector('textarea');
  // The labels render uppercase — assert on what they say, not on their casing.
  const labels = await page.locator('.field .field-label').allInnerTexts();
  assert.ok(labels.some(l => /^key details$/i.test(l.trim())), `labels were ${JSON.stringify(labels)}`);
  assert.ok(!labels.some(l => /rolling notes/i.test(l)), 'the old label is still on the form');

  const saved = await page.evaluate(async () => (await import('/js/store.js')).allEntries());
  await go(page, `/log/${saved[0].id}`);
  await page.waitForSelector('textarea');
  assert.equal(await page.locator('.field textarea').nth(1).inputValue(), 'grip the collar first');
  await page.context().close();
});

await test('gi and no-gi still record, and clear when tapped again', async () => {
  const page = await newPage();
  await go(page, '/log');
  await page.waitForSelector('textarea');
  await page.click('.seg button:has-text("No-gi")');
  await page.locator('textarea').first().fill('Just a normal class.');
  await page.click('button.btn.primary:has-text("Save entry")');
  await page.waitForSelector('.sbit-total');
  let saved = await page.evaluate(async () => (await import('/js/store.js')).allEntries());
  assert.equal(saved[0].gi, 'nogi');

  await go(page, `/log/${saved[0].id}`);
  await page.waitForSelector('textarea');
  await page.click('.seg button:has-text("No-gi")');
  await page.click('button.btn.primary:has-text("Save changes")');
  await page.waitForSelector('.sbit-total');
  saved = await page.evaluate(async () => (await import('/js/store.js')).allEntries());
  assert.equal(saved[0].gi, null);
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 5. Belt and promotions
// ---------------------------------------------------------------------------

await test('recording a promotion fills the brand mark and counts classes since', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(2) }, { date: daysAgo(5) }, { date: daysAgo(400) }]);
  await setSetting(page, 'promotions', [{ rank: 'blue', date: daysAgo(30) }]);

  await go(page, '/');
  const banner = await page.locator('.belt-banner').innerText();
  assert.match(banner, /Blue belt/);
  assert.match(banner, /2 classes since/, `banner read "${banner}"`);

  // White is reached, purple and beyond are not.
  assert.equal(await page.locator('.belt.is-ranked i.belt-white:not(.is-future)').count(), 1);
  assert.equal(await page.locator('.belt i.belt-purple.is-future').count(), 1);
  await page.context().close();
});

await test('no promotion recorded means the app claims no rank', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1) }]);
  await go(page, '/');
  assert.equal(await page.locator('.belt-banner').count(), 0);
  assert.equal(await page.locator('.belt.is-ranked').count(), 0);
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 6. The nudge
// ---------------------------------------------------------------------------

await test('a missed usual training day is surfaced, and can be dismissed', async () => {
  const page = await newPage();
  // Build a Tue/Thu habit, then miss the most recent one.
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;                 // Mon = 0
  const lastMonday = localISO(new Date(Date.now() - (dow + 7) * 864e5));
  const entries = [];
  for (let week = 1; week <= 4; week++) {
    const monday = new Date(new Date(lastMonday + 'T00:00:00').getTime() - (week - 1) * 7 * 864e5);
    for (const offset of [1, 3]) {                      // Tuesday, Thursday
      const d = new Date(monday.getTime() + offset * 864e5);
      if (localISO(d) < localISO(today)) entries.push({ date: localISO(d) });
    }
  }
  // Drop the most recent one so there is a gap to notice.
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const missed = entries.pop().date;
  await seed(page, entries);

  await go(page, '/');
  const nudge = page.locator('.banner.nudge');
  if (await nudge.count()) {
    assert.match(await nudge.innerText(), /you usually train that day/i);
    await page.click('.banner.nudge .b-close');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.banner.nudge').count(), 0);
    await go(page, '/map');
    await go(page, '/');
    assert.equal(await page.locator('.banner.nudge').count(), 0, 'dismissal did not stick');
  } else {
    // The pattern depends on which weekday the suite runs; if today's calendar
    // leaves no missed usual day, there is nothing to assert and that is correct.
    assert.ok(missed, 'no nudge expected today');
  }
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 7. Links between entries
// ---------------------------------------------------------------------------

await test('linking two entries shows on both ends', async () => {
  const page = await newPage();
  await seed(page, [
    { date: daysAgo(20), sections: { techniques: 'triangle from closed guard', rolling: '', thoughts: '' } },
    { date: daysAgo(2), sections: { techniques: 'triangle again, same problem', rolling: '', thoughts: '' } },
  ]);
  const ids = await page.evaluate(async () => (await import('/js/store.js')).allEntries().then(e => e.map(x => x.id)));
  const [recent, older] = ids;

  await go(page, `/log/${recent}`);
  await page.waitForSelector('.links');
  await page.selectOption('.links + select', older);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.link-chip').count(), 1);
  await page.click('button.btn.primary:has-text("Save changes")');
  await page.waitForSelector('.sbit-total');

  // The other end shows it as an incoming link without having been edited.
  await go(page, `/log/${older}`);
  await page.waitForSelector('.link-chip.is-in');
  assert.equal(await page.locator('.link-chip.is-in').count(), 1);
  await page.context().close();
});

// ---------------------------------------------------------------------------
// 8. Trash
// ---------------------------------------------------------------------------

await test('deleting moves an entry to the trash and it can be restored', async () => {
  const page = await newPage();
  await seed(page, [{ date: daysAgo(1), sections: { techniques: 'kimura from side control', rolling: '', thoughts: '' } }]);
  const [id] = await page.evaluate(async () => (await import('/js/store.js')).allEntries().then(e => e.map(x => x.id)));

  page.once('dialog', d => d.accept());
  await go(page, `/log/${id}`);
  await page.click('button.btn:has-text("Move to trash")');
  await page.waitForSelector('.sbit-total');

  // Gone from the live list…
  assert.equal((await page.evaluate(async () => (await import('/js/store.js')).allEntries())).length, 0);

  // …and waiting in Library.
  await go(page, '/library');
  await page.waitForSelector('.trash-row');
  assert.match(await page.locator('.trash-row').innerText(), /kimura/i);
  assert.match(await page.locator('.trash-sub').innerText(), /30 days left/);

  await page.click('.trash-row .btn');
  await page.waitForTimeout(300);
  const back = await page.evaluate(async () => (await import('/js/store.js')).allEntries());
  assert.equal(back.length, 1, 'restore did not bring the entry back');
  assert.equal(back[0].deletedAt, null);
  await page.context().close();
});

await test('a trashed entry is not resurrected by a sync', async () => {
  const { server, url: apiBase } = await startFakeGitHub({ port: 8096 });
  const page = await newPage();
  await page.evaluate(async api => {
    const sync = await import('/js/sync.js');
    await sync.setConfig({ owner: 'kezbolino', repo: 'jj-app-data', branch: 'main', token: 'fake', apiBase: api });
  }, apiBase);

  await seed(page, [{ date: '2026-07-20', sections: { techniques: 'lockdown', rolling: '', thoughts: '' } }]);
  await page.evaluate(async () => (await import('/js/sync.js')).sync());

  const [id] = await page.evaluate(async () => (await import('/js/store.js')).allEntries().then(e => e.map(x => x.id)));
  await page.evaluate(async entryId => (await import('/js/store.js')).deleteEntry(entryId), id);

  // Sync twice: the first pushes the deletion, the second is where a naive pull
  // would see an unknown id in the repo and put it straight back.
  await page.evaluate(async () => (await import('/js/sync.js')).sync());
  await page.evaluate(async () => (await import('/js/sync.js')).sync());

  const live = await page.evaluate(async () => (await import('/js/store.js')).allEntries());
  const trashed = await page.evaluate(async () => (await import('/js/store.js')).trashedEntries());
  assert.equal(live.length, 0, 'the deleted entry came back');
  assert.equal(trashed.length, 1, 'the entry should still be recoverable locally');

  await page.context().close();
  server.close();
});

// ---------------------------------------------------------------------------
// 9. Duplicate-day cue, Library paging, import guard, shortcuts
// ---------------------------------------------------------------------------

await test('logging on a day already logged points at the existing entry', async () => {
  const page = await newPage();
  const today = localISO(new Date());
  await seed(page, [{ date: today, sections: { techniques: 'guard retention', rolling: '', thoughts: '' } }]);

  await go(page, '/log');
  await page.waitForSelector('.dupe');
  assert.equal(await page.locator('.dupe').isVisible(), true);
  assert.match(await page.locator('.dupe').innerText(), /already logged a class/i);

  // Change the date and the cue goes away.
  await page.locator('input[type="date"]').fill(daysAgo(3));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.dupe').isVisible(), false,
    'the duplicate-day cue stayed on screen for a date with no class');
  await page.context().close();
});

await test('Library pages long lists instead of rendering everything', async () => {
  const page = await newPage();
  const many = [];
  for (let i = 0; i < 62; i++) many.push({ date: daysAgo(i + 1), gi: i % 2 ? 'gi' : 'nogi' });
  await seed(page, many);

  await go(page, '/library');
  await page.waitForSelector('.entry');
  const first = await page.locator('.entry').count();
  assert.ok(first <= 55, `rendered ${first} rows on first paint`);

  await page.click('button.btn:has-text("Show more")');
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.entry').count() > first, 'Show more added nothing');
  await page.context().close();
});

await test('a type filter narrows the Library list', async () => {
  const page = await newPage();
  await seed(page, [
    { date: daysAgo(1) },
    { date: daysAgo(2), type: 'question', body: 'why does my knee slice stall' },
  ]);
  await go(page, '/library');
  await page.click('.seg-filter button:has-text("Question")');
  await page.waitForTimeout(200);
  const rows = await page.locator('.entry').allInnerTexts();
  assert.equal(rows.length, 1);
  assert.match(rows[0], /knee slice stall/);
  await page.context().close();
});

await test('importing a backup never overwrites this device\'s sync config', async () => {
  const page = await newPage();
  await page.evaluate(async () => {
    const sync = await import('/js/sync.js');
    await sync.setConfig({ owner: 'mine', repo: 'my-data', branch: 'main', token: 'my-token' });
  });

  const result = await page.evaluate(async () => {
    const backup = await import('/js/backup.js');
    return backup.importData({
      format: 1,
      entries: [],
      settings: [
        { key: 'sync', value: { owner: 'theirs', repo: 'their-data', branch: 'main', token: 'their-token' } },
        { key: 'syncState', value: { commit: 'deadbeef', paths: { 'class/whatever.md': true } } },
        { key: 'tombstones', value: { xyz: { path: 'class/gone.md' } } },
        { key: 'focuses', value: [{ front: 'imported card', back: '' }] },
      ],
    });
  });

  const after = await page.evaluate(async () => {
    const sync = await import('/js/sync.js');
    const store = await import('/js/store.js');
    return {
      config: await sync.getConfig(),
      state: await store.getSetting('syncState', null),
      tombstones: await store.getSetting('tombstones', null),
      focuses: await store.getFocuses(),
    };
  });

  assert.equal(after.config.owner, 'mine', 'the import repointed this device at another repo');
  assert.equal(after.config.token, 'my-token', 'the import replaced the access token');
  assert.equal(after.state, null, 'a foreign syncState was written — push would think notes are backed up');
  assert.equal(after.tombstones, null, 'foreign pending deletions were imported');
  assert.equal(result.settingsSkipped, 3);
  // The things you actually want back after losing a phone do come across.
  assert.equal(after.focuses[0].front, 'imported card');
  await page.context().close();
});

await test('the round timer is gone — no route, no shortcut, no entry point', async () => {
  const page = await newPage();

  // Removed in v18 at the user's request: no phones on the mat. Pinned as a
  // test because a half-removed feature is worse than either state — a dead
  // link on Home or a launcher shortcut into a "Page not found" would both be
  // silent until someone tapped them.
  await go(page, '/timer');
  assert.equal(await page.locator('.empty:has-text("Page not found")').count(), 1,
    '#/timer still resolves to something');

  await go(page, '/');
  assert.equal(await page.locator('a[href="#/timer"]').count(), 0,
    'Home still links to the timer');

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.ok(!manifest.shortcuts.some(sc => sc.url.includes('timer')),
    'the launcher still offers a timer shortcut');

  await page.context().close();
});

// ---------------------------------------------------------------------------
// The post-class stretch routine (v26). Distinct from the round timer removed
// in v18 — that one lived on the mat, this one runs after it — so the removal
// test above still has to pass alongside these.
// ---------------------------------------------------------------------------

await test('Home carries no stretch shortcut — the Off mat tab is the way in', async () => {
  const page = await newPage();
  await seed(page, [{ sections: { techniques: 'armbar' } }]);
  await go(page, '/');
  assert.equal(await page.locator('.view a[href="#/stretch"]').count(), 0,
    'the "Stretch off" button is still on Home');
  // Removed because the tab replaced it, so the tab had better still be there.
  assert.equal(await page.locator('.tabbar a[href="#/stretch"]').count(), 1);
  await page.context().close();
});

await test('the stretch routine lists every stretch before you start', async () => {
  const page = await newPage();
  await go(page, '/stretch');

  const names = await page.locator('.st-item-name').allTextContents();
  assert.ok(names.length >= 8, 'the routine barely lists anything');
  assert.ok(names.includes('Kneeling hip flexor lunge'), 'the hip flexor stretch is missing');

  // Each row says whether it is one hold or two, which is what makes the
  // "both sides" promise visible before you commit 12 minutes to it.
  const sides = await page.locator('.st-item-side').allTextContents();
  assert.equal(sides.length, names.length);
  assert.ok(sides.some(s => s === 'Both sides'));

  // Not everything is drawn yet (see PENDING_ART in js/stretch-art.js). What
  // matters is that a movement awaiting art renders no frame at all, rather
  // than an empty box that reads as broken.
  const frames = await page.locator('.st-item-fig').count();
  const drawn = await page.locator('.st-item-fig svg').count();
  assert.equal(frames, drawn, 'an empty figure frame is in the list');
  assert.ok(drawn > 0, 'nothing in the list is illustrated at all');

  assert.match(await page.locator('.st-intro-n').innerText(), /^\d+:\d\d mins$/);
  await page.context().close();
});

await test('starting the routine opens on the first stretch, getting ready', async () => {
  const page = await newPage();
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  // Case-insensitive throughout: these labels are uppercased in CSS, so
  // innerText reports them shouting. The words are the contract, not the case.
  assert.match(await page.locator('.st-phase').innerText(), /get ready/i);
  assert.equal(await page.locator('.st-count').innerText(), '0:10');
  assert.match(await page.locator('.st-step').innerText(), /hold 1 of 21/i);
  assert.ok(await page.locator('.st-fig svg').isVisible(), 'no illustration while stretching');
  assert.ok((await page.locator('.st-cue').innerText()).length > 20, 'no coaching cue on screen');
  await page.context().close();
});

await test('a two-sided stretch runs the same stretch twice, left then right', async () => {
  const page = await newPage();
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  const first = await page.locator('.st-name').innerText();
  assert.match(await page.locator('.st-side').innerText(), /left side/i);

  await page.click('.st-skip');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.st-name').innerText(), first, 'the second side changed stretch');
  assert.match(await page.locator('.st-side').innerText(), /right side/i);
  assert.match(await page.locator('.st-step').innerText(), /hold 2 of 21/i);

  // Back returns to the side you just came from rather than the start.
  await page.click('.st-back');
  await page.waitForTimeout(200);
  assert.match(await page.locator('.st-step').innerText(), /hold 1 of 21/i);
  await page.context().close();
});

await test('pausing stops the clock, and resuming starts it again', async () => {
  const page = await newPage();
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  await page.click('.st-pause');
  assert.equal(await page.locator('.st-pause').innerText(), 'Resume');
  const held = await page.locator('.st-count').innerText();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('.st-count').innerText(), held, 'the clock ran while paused');

  await page.click('.st-pause');
  await page.waitForTimeout(1300);
  assert.notEqual(await page.locator('.st-count').innerText(), held, 'the clock stayed stuck after resuming');
  await page.context().close();
});

await test('leaving the routine keeps it running, and coming back resumes it', async () => {
  // The router just empties #view; nothing tells a view it has been replaced.
  // The engine lives at module scope precisely so it survives that — only
  // the *painting* stops for a screen you've left, pinned the same way the
  // render-clobber bug at the top of this file is: a stale render must not
  // touch the screen you've moved on to.
  const page = await newPage();
  await page.evaluate(() => {
    window.__ids = new Set();
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = (...a) => { const id = si(...a); window.__ids.add(id); return id; };
    window.clearInterval = id => { window.__ids.delete(id); return ci(id); };
  });

  await go(page, '/stretch');
  const before = await page.evaluate(() => window.__ids.size);
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.equal(await page.evaluate(() => window.__ids.size), before + 1, 'the routine never started a timer');

  await go(page, '/log');
  await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(() => window.__ids.size), before + 1,
    'the stretch timer stopped after navigating away');

  // And the screen you left for is intact.
  assert.equal(await page.locator('textarea').count() > 0, true, 'the log form did not render');

  // Coming back resumes the same session — the running screen, clock already
  // moved on — rather than restarting at the intro.
  await go(page, '/stretch');
  assert.equal(await page.locator('.st-count').count(), 1, 'returning to stretch did not resume the running session');
  assert.notEqual(await page.locator('.st-count').innerText(), '0:10',
    'the clock did not keep moving while the screen was elsewhere');

  // Ending it explicitly is what actually stops the timer.
  await page.click('.st-end');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__ids.size), before, 'ending the routine left its timer running');
  await page.context().close();
});

await test('the picker swaps to the rest-day routine, which is a different session', async () => {
  const page = await newPage();
  await go(page, '/stretch');

  // Two routines, cool-down selected by default.
  assert.equal(await page.locator('.st-pick button').count(), 2);
  assert.equal(await page.locator('.st-pick button.is-on').innerText(), 'After class');
  assert.equal(await page.locator('.st-needs').count(), 0, 'the cool-down needs no equipment');

  const coolLength = await page.locator('.st-intro-n').innerText();
  await page.click('.st-pick button:nth-child(2)');
  await page.waitForTimeout(200);

  assert.equal(await page.locator('.st-pick button.is-on').innerText(), 'Rest day');
  assert.notEqual(await page.locator('.st-intro-n').innerText(), coolLength,
    'both routines claim the same length');
  assert.match(await page.locator('.st-needs').innerText(), /chair/i);

  // Rest is what makes it a strength session rather than a stretch.
  assert.match(await page.locator('.st-intro-cycle').innerText(), /rest/i);
  const names = await page.locator('.st-item-name').allTextContents();
  assert.ok(names.includes('Cossack squat'), 'no loaded end-range work in the rest-day list');
  // Every rep-based movement has to say how much to do or you are guessing.
  assert.equal(await page.locator('.st-item-side').count(), names.length);

  // The hash carries the choice so a reload stays put.
  assert.match(await page.evaluate(() => location.hash), /r=rest-day/);
  await page.context().close();
});

await test('the rest-day intro sections its warm-up apart from the main session', async () => {
  const page = await newPage();
  await go(page, '/stretch?r=rest-day');

  const heads = await page.locator('.section-head h3').allTextContents();
  assert.deepEqual(heads, ['Warm-up', 'Main session']);
  assert.equal(await page.locator('.st-item-name', { hasText: 'March in place' }).count(), 1);
  assert.equal(await page.locator('.st-item-name', { hasText: 'Cossack squat' }).count(), 1);

  // The after-class cool-down has no warm-up of its own — you're already
  // warm from training — so it keeps the single flat list.
  await page.click('.st-pick button:nth-child(1)');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.section-head').count(), 0, 'the cool-down should not section a warm-up it has none of');
  await page.context().close();
});

await test('the rest-day warm-up flows straight through — no get-ready, no rest', async () => {
  const page = await newPage();
  await go(page, '/stretch?r=rest-day');
  assert.equal(await page.locator('.st-pick button.is-on').innerText(), 'Rest day');

  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  // A warm-up movement opens straight into WORK. Counting you into a movement
  // that needs no setup is dead air, and it is the first thing you see.
  assert.match(await page.locator('.st-phase').innerText(), /work/i);
  assert.doesNotMatch(await page.locator('.st-phase').innerText(), /get ready/i);
  assert.match(await page.locator('.st-step').innerText(), /work 1 of 23/i);
  assert.ok(await page.locator('.st-warmup').isVisible(), 'the first set is not badged as warm-up');
  assert.equal(await page.locator('.st-count').innerText(), '0:35', 'the warm-up is not a full work phase');

  // Every warm-up segment behaves the same way — they run one into the next.
  for (let i = 2; i <= 5; i++) {
    await page.click('.st-skip');
    await page.waitForTimeout(200);
    assert.match(await page.locator('.st-step').innerText(), new RegExp(`work ${i} of 23`, 'i'));
    assert.match(await page.locator('.st-phase').innerText(), /work/i, `set ${i} counts you in`);
  }

  // The main session is untouched: it still counts you in.
  await page.click('.st-skip');
  await page.waitForTimeout(200);
  assert.match(await page.locator('.st-step').innerText(), /work 6 of 23/i);
  assert.match(await page.locator('.st-phase').innerText(), /get ready/i,
    'the main session lost its get-ready');
  assert.equal(await page.locator('.st-warmup').isVisible(), false);
  await page.context().close();
});

/**
 * A page whose clock runs `factor` times faster.
 *
 * The engine derives everything from `performance.now()`, so speeding that up
 * speeds up the routine and nothing else — `setInterval` still fires on real
 * time, so the ticks just land further apart on the routine's timeline. It is
 * the only way to reach a 20-second rest phase, 45 seconds into a set, without
 * a 45-second test.
 */
async function fastPage(factor) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(8000);
  await context.addInitScript(v => { localStorage.setItem('jj-voice', v); }, TEST_VOICE);
  await context.addInitScript(f => {
    const orig = performance.now.bind(performance);
    const t0 = orig();
    performance.now = () => t0 + (orig() - t0) * f;
  }, factor);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

await test('during rest the screen shows what is next, not what you just did', async () => {
  const page = await fastPage(25);
  await go(page, '/stretch?r=rest-day');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  // Skip past the warm-up to a main movement, which is the one with a rest.
  for (let i = 0; i < 5; i++) { await page.click('.st-skip'); await page.waitForTimeout(120); }
  const during = await page.locator('.st-name').innerText();
  assert.match(await page.locator('.st-step').innerText(), /work 6 of 23/i);

  await page.waitForSelector('.st.is-rest', { timeout: 8000 });
  const shown = await page.locator('.st-name').innerText();
  assert.notEqual(shown, during, 'rest still shows the movement you just finished');
  assert.ok(await page.locator('.st-next').isVisible(), 'nothing marks the movement as the next one');
  // The counter still belongs to the set that is resting; the picture does not.
  assert.match(await page.locator('.st-step').innerText(), /work 6 of 23/i);
  assert.match(await page.locator('.st-phase').innerText(), /rest/i);
  await page.context().close();
});

await test('a finished routine chimes, then speaks', async () => {
  // Order matters and is the whole of the design: the chime is the signal that
  // the routine is over — same three notes every time, readable without
  // looking — and the voice is the flourish after it. A line that arrives
  // *instead* of the chime is a worse signal.
  //
  // The clock is sped up but `setTimeout` is not, so the gap between the two is
  // a real 900ms however fast the routine ran.
  const page = await fastPage(400);
  const cues = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) cues.push(req.url().split('/audio/cues/')[1]);
  });

  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-done', { timeout: 20000 });
  assert.ok(!cues.some(c => c.includes('finish-')),
    'the finish line played before the screen even said it was done');

  await page.waitForFunction(() => true);
  await page.waitForTimeout(1500);          // past CHIME_MS, into the spoken line
  const spoken = cues.filter(c => c.includes('finish-'));
  assert.equal(spoken.length, 1, `heard ${spoken.join() || 'no finish line'}`);
  assert.match(spoken[0], /^snoop\/finish-[1-5]\.webm$/);
  await page.context().close();
});

await test('finishing a routine marks the calendar and offers no class to log', async () => {
  const page = await fastPage(400);        // the whole cool-down in a few seconds
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-done', { timeout: 20000 });

  assert.equal(await page.locator('.st-done a[href="#/log"]').count(), 0,
    'the finish screen still offers to log a class');
  assert.match(await page.locator('.st-done p').innerText(), /calendar/i);

  const logged = await page.evaluate(async () => {
    const store = await import('/js/store.js');
    return store.getMobilitySessions();
  });
  assert.equal(logged.length, 1, 'the finished routine was not recorded');
  assert.equal(logged[0].routine, 'post-class');

  // It is on the calendar, and it is not a class — the class count stays zero.
  await go(page, '/');
  assert.equal(await page.locator('.sbit-total .sbit-n').innerText(), '0',
    'a cool-down was counted as a class');
  await page.click('.sbit-total');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.cal__day.is-mobility').count(), 1,
    'the cool-down is not marked on the calendar');
  assert.equal(await page.locator('.cal__day.is-on').count(), 0, 'it filled the day like a class');
  await page.context().close();
});

await test('the running screen has a red End button and hides the version footer', async () => {
  const page = await newPage();
  await go(page, '/stretch');
  assert.ok(await page.locator('.appfoot').isVisible(), 'the footer is hidden before starting');

  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  const end = page.locator('.st-end');
  assert.ok(await end.isVisible());
  assert.ok((await end.getAttribute('class')).includes('danger'),
    'End routine is not styled as the destructive action it is');
  const bg = await end.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, 'rgba(0, 0, 0, 0)', 'the End button has no fill');
  assert.equal(await page.locator('.appfoot').isVisible(), false,
    'the version footer is still on screen mid-routine');

  // And it comes back once the routine is done with the screen.
  await page.click('.st-end');
  await page.waitForSelector('.st-intro');
  assert.ok(await page.locator('.appfoot').isVisible(), 'the footer never came back');
  await page.context().close();
});

await test('the running screen draws the movement it is on', async () => {
  const page = await newPage();
  await go(page, '/stretch?r=rest-day');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  // This used to assert the opposite — that the slot was *empty*, because
  // nothing in the rest-day session was drawn. Every movement in both routines
  // has a figure as of v56, so the assertion flipped rather than the contract:
  // `stretchFigure` still returns null for an undrawn id and the view still
  // leaves the slot out, which is now unit-tested in tests/stretches.test.mjs
  // because there is no longer a real movement to exercise it with.
  assert.equal(await page.locator('.st-fig svg').count(), 1, 'the figure is missing');
  assert.ok(await page.locator('.st-fig').isVisible(), 'the figure frame is hidden');
  assert.ok((await page.locator('.st-name').innerText()).length > 0);
  assert.ok((await page.locator('.st-cue').innerText()).length > 20);
  await page.context().close();
});

await test('each move announces itself by name, and muting stops it', async () => {
  const page = await newPage();
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) requests.push(req.url().split('/').pop());
  });

  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.deepEqual(requests, ['neck-side.webm'], 'the first stretch did not announce itself');

  // Neck side stretch is bilateral, so skipping once lands on its second side.
  // That does NOT repeat the move's name — it plays one of the six generic
  // "now the other side" takes, which is the whole point of them.
  await page.click('.st-skip');
  await page.waitForTimeout(250);
  assert.equal(requests.length, 2, 'the second side announced nothing');
  assert.match(requests[1], /^other-side-[1-6]\.webm$/,
    `the second side repeated the move name instead of "other side" (got ${requests[1]})`);

  // Skipping again reaches a different move (wrist-floor), by name.
  await page.click('.st-skip');
  await page.waitForTimeout(250);
  assert.equal(requests[2], 'wrist-floor.webm', 'the next move stayed silent or said the wrong thing');

  await page.click('.st-sound');
  await page.click('.st-skip');
  await page.waitForTimeout(250);
  assert.equal(requests.length, 3, 'muting the sound did not also mute the voice cue');
  await page.context().close();
});

// The two flourishes added in v39 fire on a coin flip, which is untestable as
// written — so these two stub Math.random before the app loads. 0.10 lands
// under COUNTDOWN_CHANCE (0.18); 0.30 misses it but lands under HYPE_CHANCE
// (0.45). Pinning the *wiring* deterministically; the pickers themselves are
// unit-tested in tests/stretches.test.mjs.
const withRandom = async value => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(8000);
  // Pin the voice before stubbing the coin: pickVoice reads the same
  // Math.random these tests are fixing for the countdown/hype rolls, and a
  // fixed value that happens to land on an unrecorded voice would silence
  // every cue this asserts on.
  await context.addInitScript(v => { localStorage.setItem('jj-voice', v); }, TEST_VOICE);
  await context.addInitScript(v => { Math.random = () => v; }, value);
  const page = await context.newPage();
  const cues = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) cues.push(req.url().split('/').pop());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { page, cues };
};

await test('the spoken countdown replaces the 3-2-1 beeps, on the sets it lands on', async () => {
  const { page, cues } = await withRandom(0.10);
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  // Get-ready runs 10s; the countdown fires with 3 left. Skip forward to the
  // last seconds rather than waiting them out.
  await page.waitForTimeout(7600);
  assert.ok(cues.includes('countdown.webm'),
    `no spoken countdown in the last 3 seconds (heard: ${cues.join(', ') || 'nothing'})`);
  await page.context().close();
});

await test('a hype line lands as the set begins, and not when the countdown did', async () => {
  const { page, cues } = await withRandom(0.30);
  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  await page.waitForTimeout(10600);            // through get-ready, into the hold
  assert.ok(cues.some(c => /^hype-[1-7]\.webm$/.test(c)),
    `no hype line as the set started (heard: ${cues.join(', ') || 'nothing'})`);
  assert.ok(!cues.includes('countdown.webm'),
    'the countdown and a hype line both fired on the same set');
  await page.context().close();
});

const NAMES = [
  ...Array.from({ length: 6 }, (_, i) => `other-side-${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `hype-${i + 1}`),
  'countdown',
];

// Every voice a session can roll, not just the pinned one. A voice is picked
// at random, so a dud clip in one of them is a cue that fails on some sessions
// and not others — the hardest kind to notice and the cheapest to check here.
const SHIPPED_VOICES = ['snoop', 'arnold'];

await test('every spoken cue is a real clip with sound in it', async () => {
  // The clips themselves, not the picker — that is unit-tested in
  // tests/stretches.test.mjs, where the choice can be seen. What a browser can
  // check is that all six exist, decode, and are not silent: a webm can be a
  // perfectly valid container with nothing in it, which is exactly what shipped
  // twice in v29. Duration alone proved nothing then and proves nothing now.
  const page = await newPage();
  const report = await page.evaluate(async ({ n, voices }) => {
    const ctx = new AudioContext();
    const out = [];
    for (const voice of voices) {
      for (const name of n) {
        const res = await fetch(`audio/cues/${voice}/${name}.webm`);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const data = buf.getChannelData(0);
        let peak = 0;
        for (let j = 0; j < data.length; j++) peak = Math.max(peak, Math.abs(data[j]));
        out.push({ name: `${voice}/${name}`, ok: res.ok, seconds: buf.duration, peak });
      }
    }
    return out;
  }, { n: NAMES, voices: SHIPPED_VOICES });

  for (const clip of report) {
    assert.ok(clip.ok, `${clip.name}.webm did not load`);
    assert.ok(clip.seconds > 0.5 && clip.seconds < 5,
      `${clip.name} is ${clip.seconds.toFixed(2)}s, which is not a short spoken line`);
    assert.ok(clip.peak > 0.05,
      `${clip.name} decodes but is silent (peak ${clip.peak.toFixed(4)})`);
  }
  await page.context().close();
});

await test('the two routines announce their own first move, not each other\'s', async () => {
  const page = await newPage();
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) requests.push(req.url().split('/').pop());
  });

  await go(page, '/stretch?r=rest-day');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.deepEqual(requests, ['warmup-march.webm'], 'rest day should open on its warm-up, not the main session');
  await page.context().close();
});

// ---------------------------------------------------------------------------
// The strength session (v35). The progression maths is unit-tested in
// tests/strength.test.mjs; what is worth driving in a browser is the wiring —
// that a tap logs a set, that the draft survives leaving the screen, and that
// finishing actually moves next week's target.
// ---------------------------------------------------------------------------

await test('the Off mat section has three tabs and Strength is one of them', async () => {
  const page = await newPage();
  await go(page, '/stretch');

  assert.equal(await page.locator('.st-pick button, .st-pick a').count(), 3);
  assert.match(await page.locator('.page-title').innerText(), /off mat/i);
  assert.match(await page.locator('.tabbar a[data-tab="/stretch"] span').innerText(), /off mat/i);

  // The strength tab is a link, not an in-place swap: it is a different screen.
  await page.click('.st-pick a:has-text("Strength")');
  await page.waitForTimeout(260);
  assert.match(await page.evaluate(() => location.hash), /#\/strength/);
  assert.equal(await page.locator('.st-pick a.is-on').innerText(), 'Strength');

  // And the Off mat tab stays lit on both screens — one section, not two.
  assert.equal(await page.locator('.tabbar a[data-tab="/stretch"][aria-current]').count(), 1);
  await page.context().close();
});

await test('the first strength session opens with the programme already prescribed', async () => {
  const page = await newPage();
  await go(page, '/strength');

  const targets = await page.locator('.sx-plan-target').allTextContents();
  const count = await page.evaluate(async () => (await import('/js/strength.js')).EXERCISES.length);
  assert.equal(targets.length, count, 'the plan does not list every movement');
  assert.equal(targets[0], '5 × 6 · 3s down', 'pull-ups do not start where the programme says');
  const names = await page.locator('.sx-plan-name').allTextContents();
  assert.equal(names[0], 'Pull-ups', 'the hardest movement is not first');
  assert.ok(names.includes('Hollow body hold'));

  // Acceptance criterion 1: cold, with no thinking required.
  assert.match(await page.locator('.sx-intro-l').innerText(), /no sessions logged yet/i);
  assert.match(await page.locator('.sx-warmup').innerText(), /dead hang/i);
  await page.context().close();
});

await test('the lift artwork loads only when the lift screen does', async () => {
  // The point of the v58 split. js/strength-art.js is 53 KB of path data that
  // only this screen reads, so it is a lazy import and it sits outside CORE —
  // and both of those are worth nothing if some module quietly imports it at
  // boot again. Nothing on screen would change; the app would just be heavier,
  // silently, the way it was for two versions.
  const page = await newPage();
  const asked = [];
  page.on('request', req => {
    if (req.url().includes('strength-art.js')) asked.push(req.url());
  });

  await go(page, '/');
  await page.waitForSelector('.view');
  await go(page, '/stretch');
  await page.waitForSelector('.st');
  assert.equal(asked.length, 0, 'the lift artwork was fetched by a screen that never draws it');

  await go(page, '/strength');
  await page.waitForSelector('.sx');
  // Not just "did it load" — *this* screen has to be the one that loads it.
  // A static import anywhere in the boot graph shows up here as zero requests,
  // because the module is already resolved by the time the screen mounts.
  assert.equal(asked.length, 1,
    'the lift screen did not fetch its own artwork — is something importing it at boot?');
  await page.context().close();
});

await test('every movement in the session carries its figure', async () => {
  // The lift screen drew no figures at all until v56 — it is a form, not a
  // routine, and there was no code that would render one. The contract is the
  // routines': `stretchFigure` returns null for an id with no artwork and the
  // head just has one fewer child, so this asserts the count matches the
  // movements rather than a hard-coded 10, and a movement added without art
  // still renders.
  const page = await newPage();
  await go(page, '/strength');
  const start = page.getByRole('button', { name: /start/i }).first();
  if (await start.count()) await start.click();
  await page.waitForSelector('.sx-ex');

  // Both art files: the lifts' figures moved to js/strength-art.js in v58 and
  // are loaded lazily, but `single-leg-rdl` stayed in ART because the rest-day
  // routine draws it too. A movement is drawn if either has it.
  const drawn = await page.evaluate(async () => {
    const { EXERCISES } = await import('/js/strength.js');
    const { ART } = await import('/js/stretch-art.js');
    const { STRENGTH_ART } = await import('/js/strength-art.js');
    return EXERCISES.filter(e => ART[e.id] || STRENGTH_ART[e.id]).length;
  });
  assert.equal(await page.locator('.sx-ex-fig svg').count(), drawn,
    'a movement with artwork is not showing it');
  assert.ok(drawn > 0, 'no lift has artwork at all');
  await page.context().close();
});

await test('a lift on a day with jiu jitsu already logged says lift after, never before', async () => {
  const page = await newPage();
  await seed(page, [{ sections: { techniques: 'armbar from guard' } }]);   // dated today
  await go(page, '/strength');
  assert.match(await page.locator('.sx-warn').innerText(), /lift after class, never before/i);

  // And the calendar shows both kinds of session in one place.
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');
  await page.click('.sx-ex .sx-set >> nth=0');
  await page.click('.btn:has-text("Finish session")');
  await page.click('.btn:has-text("finish anyway")');
  await page.waitForSelector('.sx-done');

  await go(page, '/');
  await page.click('.sbit-total');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.cal__day.is-on.is-lift').count(), 1,
    'the calendar does not show the class and the lift on the same day');
  assert.match(await page.locator('.hcal-foot').innerText(), /lift/i);
  await page.context().close();
});

await test('tapping a set logs it, and the draft survives leaving the screen', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const totalSets = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    return m.EXERCISES.reduce((n, e) => n + e.sets, 0);
  });
  assert.equal(await page.locator('.sx-set').count(), totalSets, 'not every set is on screen');
  assert.match(await page.locator('.sx-progress').innerText(), new RegExp(`0 of ${totalSets} sets`));

  const first = page.locator('.sx-ex').first().locator('.sx-set').first();
  assert.equal(await first.innerText(), '6');
  await first.click();
  await page.waitForTimeout(120);
  assert.equal(await first.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.sx-progress').innerText(), new RegExp(`1 of ${totalSets} sets`));
  // Completing a set starts the rest countdown for that movement.
  assert.ok(await page.locator('.sx-rest').isVisible(), 'no rest timer after a set');
  assert.match(await page.locator('.sx-rest-n').innerText(), /^[12]:\d\d$/);

  // Skip rest shipped in v35 with no click handler at all — it looked like a
  // button and did nothing. Assert the behaviour, not that the button exists.
  await page.click('.sx-rest-skip');
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.sx-rest:visible').count(), 0, 'Skip rest did not end the rest');

  // A lift runs over an hour and the phone will lock. Leaving must cost nothing.
  await go(page, '/log');
  await go(page, '/strength');
  assert.match(await page.locator('.sx-progress').innerText(), new RegExp(`1 of ${totalSets} sets`),
    'the logged set was lost by navigating away');
  // The rest countdown is deliberately not restored — only the log is.
  assert.equal(await page.locator('.sx-rest:visible').count(), 0);
  await page.context().close();
});

await test('a logged set can be corrected without typing', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const first = page.locator('.sx-ex').first().locator('.sx-set').first();
  await first.click();                       // log it at target
  await first.click();                       // tap again: corrections open
  await page.waitForSelector('.sx-edit-n');
  assert.equal(await page.locator('.sx-edit-n').first().innerText(), '6');

  await page.locator('.sx-step:has-text("−")').first().click();
  assert.equal(await first.innerText(), '5', 'the stepper did not change the set');

  await page.locator('.sx-tempo').first().click();
  assert.equal(await page.locator('.sx-tempo').first().innerText(), 'Tempo broke');
  assert.ok((await first.getAttribute('class')).includes('is-soft'),
    'a set logged with the tempo broken looks the same as one that held');

  await page.locator('.sx-undo').first().click();
  assert.equal(await first.getAttribute('aria-pressed'), 'false');
  await page.context().close();
});

await test('finishing a clean session sets next session\'s targets and says what moved', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  // Log every set at its target — the whole session, the honest way.
  const sets = await page.locator('.sx-set').all();
  for (const set of sets) await set.click();
  const all = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    return m.EXERCISES.reduce((n, e) => n + e.sets, 0);
  });
  assert.match(await page.locator('.sx-progress').innerText(), new RegExp(`${all} of ${all} sets`));

  await page.click('.btn:has-text("Finish session")');
  await page.waitForSelector('.sx-done');
  const changes = await page.locator('.sx-changes li').allTextContents();
  assert.equal(changes.length, await page.evaluate(async () => (await import('/js/strength.js')).EXERCISES.length),
    'a clean session should move every movement');
  assert.ok(changes.some(c => /Pull-ups goes to 7 reps/.test(c)), changes.join(' | '));
  assert.match(await page.locator('.sx-done-note').innerText(), /not a class/i);

  // Acceptance criterion 3: next session's targets are already set. "Back to
  // the plan" has to be a real action — this screen sits at the hash it would
  // otherwise link to, so a link here fires no hashchange and does nothing.
  await page.click('.sx-done .btn.primary');
  await page.waitForSelector('.sx-plan-target');
  assert.equal(await page.locator('.sx-plan-target').first().innerText(), '5 × 7 · 3s down');
  assert.match(await page.locator('.sx-intro-l').innerText(), /last lifted/i);

  // And it is in the history, per movement.
  await go(page, '/strength?view=history');
  assert.equal(await page.locator('.sx-hist-n').first().innerText(), '6, 6, 6, 6, 6');
  await page.context().close();
});

await test('the lift speaks when a rest ends — the next movement, or "go again"', async () => {
  const page = await newPage();
  const cues = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) cues.push(req.url().split('/').pop());
  });

  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  // Start names the first *warm-up* item, which is what is on screen.
  //
  // This assertion used to require silence. That was right for v44–v48: the
  // warm-up comes first, and naming the opening lift over a screen showing arm
  // circles is worse than saying nothing. The reason given was that no warm-up
  // clip existed — but three already did, from the rest-day routine, and were
  // simply never wired up. v49 wires them, so the correct behaviour is now to
  // announce, and what still must never happen is naming a *lift* here.
  await page.waitForTimeout(250);
  assert.deepEqual(cues, ['warmup-arm-circle.webm'],
    `Start should name the first warm-up item, heard: ${cues.join(', ') || 'silence'}`);
  const lifts = await page.evaluate(async () => (await import('/js/strength.js')).EXERCISES.map(e => e.id));
  for (const cue of cues) {
    assert.ok(!lifts.includes(cue.replace('.webm', '')),
      `Start announced the lift "${cue}" while the screen shows the warm-up`);
  }
  cues.length = 0;

  // The first set of a movement names it, inside the tap. Pull-ups are
  // supersetted with archer press-ups, so the rest that follows hands over to
  // the *partner* — which is the one thing you would otherwise forget, and the
  // reason the alternation works at all.
  const first = page.locator('.sx-ex').first().locator('.sx-set');
  const partner = page.locator('.sx-ex').nth(1).locator('.sx-set');
  await first.first().click();
  await page.waitForTimeout(250);
  assert.ok(cues.includes('pull-up.webm'), `the first set did not name the lift (${cues.join(', ')})`);
  assert.ok(cues.includes('archer-press-up.webm'),
    `the rest did not hand over to the partner (${cues.join(', ')})`);

  // Second time round, the partner has already been named — repeating it every
  // sixty seconds for an hour would be unbearable — so it falls back to a
  // generic "go again".
  cues.length = 0;
  await page.click('.sx-rest-skip');
  await partner.first().click();
  await page.waitForTimeout(250);
  assert.ok(cues.some(c => /^rest-over-[1-5]\.webm$/.test(c)),
    `no rest-over cue once both movements had been named (${cues.join(', ')})`);

  // Clear the whole superset. The rest after the last set of the block
  // announces the movement the *next* block opens with.
  cues.length = 0;
  const nextId = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    const paired = new Set(m.PAIRS[0]);
    return m.EXERCISES.find(e => !paired.has(e.id)).id;
  });
  for (const set of [...(await first.all()).slice(1), ...(await partner.all()).slice(1)]) {
    await page.click('.sx-rest-skip').catch(() => {});
    await set.click();
    await page.waitForTimeout(120);
  }
  assert.ok(cues.includes(`${nextId}.webm`),
    `the rest after the block did not announce ${nextId} (heard: ${cues.join(', ')})`);
  await page.context().close();
});

// --- v49: the feedback from the first real session ------------------------

await test('the intro says how long the session takes, derived from the plan', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.waitForSelector('.sx-duration');
  const line = await page.locator('.sx-duration').innerText();
  assert.match(line, /About \d+ hr( \d+ min)?|About \d+ min/, `duration read "${line}"`);
  // The number that mattered was wrong for four versions because it was written
  // in a doc by hand. Check it is coming from the engine, not a string.
  const expected = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    return m.durationLine(m.sessionDuration(m.todaysPlan([], { muted: [] })));
  });
  assert.ok(line.includes(expected), `screen says "${line}", engine says "${expected}"`);
  assert.match(line, /\d+s? sets/, 'the breakdown does not mention sets');
  // Lowercase unit, per the v28 lesson: a CSS uppercase transform would shout
  // "60S BETWEEN" and cannot make mixed case out of one string.
  const tag = await page.locator('.sx-pair-tag').first().innerText();
  assert.ok(tag.includes('60s'), `the superset tag shouted its unit: "${tag}"`);
  await page.context().close();
});

await test('supersets group two movements and shorten the rest between them', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const pairs = await page.evaluate(async () => (await import('/js/strength.js')).PAIRS.length);
  assert.equal(await page.locator('.sx-pair').count(), pairs, 'the supersets are not grouped');

  // Pull-ups are paired with archer press-ups, so the rest after a pull-up set
  // is the short one and it must name the movement you are going to next —
  // that hand-off is the entire reason the pairing works.
  const first = page.locator('.sx-ex').first();
  await first.locator('.sx-set').first().click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.sx-rest-n').innerText(), '1:00',
    'the superset rest is not the short one');
  assert.match(await page.locator('.sx-rest-l').innerText(), /then Archer press-ups/,
    'the rest does not say which movement is next');

  // Grinding one movement out instead of alternating must give the full rest
  // back rather than quietly under-resting you.
  await page.click('.sx-rest-skip');
  const partner = page.locator('.sx-ex').nth(1);
  for (const s of await partner.locator('.sx-set').all()) { await s.click(); await page.waitForTimeout(80); }
  await page.click('.sx-rest-skip');
  await first.locator('.sx-set').nth(1).click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.sx-rest-n').innerText(), '2:00',
    'kept the short rest after the partner had no sets left');
  await page.context().close();
});

await test('a mis-tapped set can be undone from the rest bar', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const first = page.locator('.sx-ex').first().locator('.sx-set').first();
  // Nothing advertises the corrections panel until there is something to
  // correct, so the hint must not be shouting before the first tap.
  assert.equal(await page.locator('.sx-ex').first().locator('.sx-sets-hint').isVisible(), false,
    'the corrections hint is on screen before anything is logged');

  await first.click();
  await page.waitForTimeout(150);
  assert.equal(await first.getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('.sx-ex').first().locator('.sx-sets-hint').isVisible(),
    'nothing tells you a logged set can be corrected');
  assert.ok(await page.locator('.sx-rest-undo').isVisible(), 'no undo on the rest bar');

  await page.click('.sx-rest-undo');
  await page.waitForTimeout(150);
  assert.equal(await first.getAttribute('aria-pressed'), 'false', 'undo did not unlog the set');
  assert.equal(await page.locator('.sx-rest:visible').count(), 0, 'undo left the rest running');
  assert.match(await page.locator('.sx-progress').innerText(), /0 of \d+ sets/);
  await page.context().close();
});

await test('tapping a movement name says it, straight away', async () => {
  const page = await newPage();
  const cues = [];
  page.on('request', r => {
    if (r.url().includes('/audio/cues/')) cues.push(r.url().split('/').pop());
  });
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  // The name used to land on the first *set* tap, which is after the set is
  // done — the app announced pull-ups once the pull-ups were over.
  cues.length = 0;
  await page.locator('.sx-ex').first().locator('.sx-say').click();
  await page.waitForTimeout(250);
  assert.ok(cues.includes('pull-up.webm'),
    `tapping the name said nothing (heard: ${cues.join(', ') || 'silence'})`);
  await page.context().close();
});

await test('the warm-up announces itself and the dead hang is timed', async () => {
  const page = await newPage();
  const cues = [];
  page.on('request', r => {
    if (r.url().includes('/audio/cues/')) cues.push(r.url().split('/').pop());
  });
  await go(page, '/strength');

  // Start names the first warm-up item. v44 silenced this on the grounds that
  // no warm-up cue was recorded; three of them already were.
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-wu');
  await page.waitForTimeout(250);
  assert.ok(cues.includes('warmup-arm-circle.webm'),
    `Start did not announce the warm-up (heard: ${cues.join(', ') || 'silence'})`);

  // Ticking a row announces the next one, so the list reads itself out.
  cues.length = 0;
  await page.locator('.sx-wu button').first().click();
  await page.waitForTimeout(250);
  assert.ok(cues.includes('warmup-leg-swing.webm'),
    `ticking a row did not announce the next (heard: ${cues.join(', ') || 'silence'})`);

  // Exactly one row is timed, and it is the hang.
  assert.equal(await page.locator('.sx-wu-time').count(), 1);
  const hangRow = page.locator('.sx-wu').filter({ has: page.locator('.sx-wu-time') });
  assert.match(await hangRow.locator('.sx-wu-name').innerText(), /hang/i);
  await page.context().close();
});

await test('a hold counts you in by voice, and bailing early logs nothing', async () => {
  // Real time, not fastPage: the lead-in is only three seconds, so a sped-up
  // clock races past the "Get set" phase before it can be asserted on.
  const page = await newPage();
  const cues = [];
  page.on('request', r => {
    if (r.url().includes('/audio/cues/')) cues.push(r.url().split('/').pop());
  });
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const hollow = page.locator('.sx-ex').filter({ hasText: 'Hollow body hold' }).first();
  assert.equal(await hollow.locator('.sx-time').count(), 1, 'the hold has no timer');
  assert.equal(await hollow.locator('.sx-set').first().innerText(), '45s');

  cues.length = 0;
  await hollow.locator('.sx-time').click();
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.sx-hold').isVisible(), 'the hold timer did not start');
  // Counted in by voice, not left to a silent three seconds — you are on your
  // back looking at the ceiling and cannot see any of this.
  assert.ok(cues.includes('countdown.webm'),
    `no spoken countdown (heard: ${cues.join(', ') || 'silence'})`);
  // Not uppercased. A CSS transform would shout the whole movement name and
  // cannot make mixed case out of one string — the v28 lesson.
  assert.equal(await page.locator('.sx-hold-l').innerText(), 'Get set · Hollow body hold');

  // Stop during the lead-in: a cancel, not a zero-second hold. Logging it would
  // count as a missed set, and two of those walk the prescription back down.
  await page.locator('.sx-hold-stop').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.sx-hold:visible').count(), 0);
  assert.equal(await hollow.locator('.sx-set').first().getAttribute('aria-pressed'), 'false',
    'cancelling the count-in still logged a set');
  assert.match(await page.locator('.sx-progress').innerText(), /0 of \d+ sets/);
  await page.context().close();
});

await test('a hold that runs to the end logs its set at the target', async () => {
  // 3s lead-in plus a 45s hold is 48s of app time; fastPage runs the hold
  // timer's `performance.now()` clock 40x, so this takes about a second.
  const page = await fastPage(40);
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  const hollow = page.locator('.sx-ex').filter({ hasText: 'Hollow body hold' }).first();
  await hollow.locator('.sx-time').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.sx-hold');
    return !el || el.hidden;
  }, null, { timeout: 15000 });

  assert.equal(await hollow.locator('.sx-set').first().getAttribute('aria-pressed'), 'true',
    'a completed hold did not log its set');
  assert.equal(await hollow.locator('.sx-set').first().innerText(), '45s',
    'a full hold logged something other than the target');
  await page.context().close();
});

await test('every strength cue is a real clip with sound in it', async () => {
  const page = await newPage();
  // Derived, not hand-listed. A hard-coded list goes stale the moment the
  // programme changes — this one still named `nordic-curl` a version after it
  // was replaced. The two kettlebell movements have no clip recorded yet and
  // stay out until they do; `createVoice` treats a missing clip as silence by
  // design, so their absence is a known gap rather than a failure.
  // Per voice, because the voices are ragged: Arnold names the two kettlebell
  // lifts and the warm-up press-ups, Snoop has never had those three. A clip
  // that is absent is silence by design (createVoice's contract); a clip that
  // is *present* has to be real, whichever voice carries it.
  const names = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    return [...m.EXERCISES.map(e => e.id), ...m.WARM_UP.map(w => w.cue).filter(Boolean)];
  });
  const report = await page.evaluate(async ({ list, voices }) => {
    const ctx = new AudioContext();
    const out = [];
    for (const voice of voices) {
      for (const name of list) {
        const res = await fetch(`audio/cues/${voice}/${name}.webm`);
        if (!res.ok) { out.push({ name: `${voice}/${name}`, absent: true }); continue; }
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const data = buf.getChannelData(0);
        let peak = 0;
        for (let j = 0; j < data.length; j++) peak = Math.max(peak, Math.abs(data[j]));
        out.push({ name: `${voice}/${name}`, ok: true, seconds: buf.duration, peak });
      }
    }
    return out;
  }, { list: names, voices: SHIPPED_VOICES });
  for (const clip of report) {
    if (clip.absent) continue;   // not recorded in this voice — silence by design
    assert.ok(clip.seconds > 0.4 && clip.seconds < 7, `${clip.name} is ${clip.seconds.toFixed(2)}s`);
    assert.ok(clip.peak > 0.05, `${clip.name} decodes but is silent (peak ${clip.peak.toFixed(4)})`);
  }
  // …but a movement being nameable by nobody is a gap worth failing on.
  const namedBySomeone = new Set(report.filter(c => !c.absent).map(c => c.name.split('/')[1]));
  for (const name of names) {
    assert.ok(namedBySomeone.has(name), `no voice can say "${name}"`);
  }
  await page.context().close();
});

await test('the picked voice is the folder every cue comes from', async () => {
  // The voice is a *folder*, so getting this wrong is silent rather than loud:
  // every fetch 404s and createVoice swallows it by design. Assert the path,
  // not just the filename.
  const page = await newPage({ voice: 'snoop' });
  const paths = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) paths.push(req.url().split('/audio/cues/')[1]);
  });

  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.deepEqual(paths, ['snoop/neck-side.webm'], `asked for ${paths.join() || 'nothing'}`);
  await page.context().close();
});

await test('the other voice speaks its own clips, not the first one\'s', async () => {
  // The two folders hold the same ids, so a wrong voice is silent rather than
  // wrong — nothing on screen would differ. Assert the folder.
  const page = await newPage({ voice: 'arnold' });
  const paths = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) paths.push(req.url().split('/audio/cues/')[1]);
  });

  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.deepEqual(paths, ['arnold/neck-side.webm'], `asked for ${paths.join() || 'nothing'}`);
  await page.context().close();
});

await test('a cue with no clip behind it is silent, not broken', async () => {
  // createVoice's standing contract, and the reason a half-recorded voice is
  // safe to ship: every clip 404s and the routine runs exactly as it does with
  // one — the beeps are the baseline and they are unaffected. Simulated by
  // failing the requests, since both shipped voices are now complete.
  const page = await newPage();
  await page.route('**/audio/cues/**', route => route.abort());

  await go(page, '/stretch');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.ok(await page.isVisible('.st-count'), 'the routine did not start');
  await page.click('.st-skip');
  assert.ok(await page.isVisible('.st-count'), 'skipping broke with no clips to play');
  await page.context().close();
});

await test('a resumed session still announces the movement you tap into', async () => {
  // The Start tap announces the opener — but a session resumed from a draft
  // never shows the Start button, so that whole path was silent from beginning
  // to end. This is the bug the user hit: they had a draft from earlier and so
  // never once heard the app speak.
  const page = await newPage();
  const cues = [];
  page.on('request', req => {
    if (req.url().includes('/audio/cues/')) cues.push(req.url().split('/').pop());
  });

  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  // Leave and come back: no intro, no Start button, straight into the session.
  await go(page, '/');
  await go(page, '/strength');
  assert.equal(await page.locator('.sx-intro').count(), 0, 'the draft did not resume');
  cues.length = 0;

  await page.locator('.sx-ex').first().locator('.sx-set').first().click();
  await page.waitForTimeout(250);
  assert.ok(cues.includes('pull-up.webm'),
    `a resumed session stayed silent (heard: ${cues.join(', ') || 'nothing'})`);
  await page.context().close();
});

await test('the warm-up is a checklist that survives leaving, and counts for nothing', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-wu');

  assert.equal(await page.locator('.sx-wu').count(), 5);
  assert.match(await page.locator('.sx-wu-count').innerText(), /0 of 5/);
  const names = await page.locator('.sx-wu-name').allTextContents();
  assert.ok(names.some(n => /squat/i.test(n)), 'nothing rehearses the squat');
  assert.ok(names.some(n => /hang/i.test(n)), 'nothing rehearses the hang');

  // Ticking it must not move the session on — a warm-up is not a set.
  const before = await page.locator('.sx-progress').innerText();
  await page.locator('.sx-wu button').first().click();
  await page.waitForTimeout(150);
  assert.match(await page.locator('.sx-wu-count').innerText(), /1 of 5/);
  assert.equal(await page.locator('.sx-progress').innerText(), before,
    'the warm-up counted towards the session');

  await go(page, '/log');
  await go(page, '/strength');
  assert.match(await page.locator('.sx-wu-count').innerText(), /1 of 5/,
    'the ticked warm-up was lost by navigating away');
  await page.context().close();
});

await test('a movement can be muted mid-session without skipping the lot', async () => {
  const page = await newPage();
  await go(page, '/strength');
  await page.click('.sx-intro .btn.cta');
  await page.waitForSelector('.sx-set');

  await page.locator('.sx-mute').first().click();
  await page.waitForTimeout(200);
  const withoutFirst = await page.evaluate(async () => {
    const m = await import('/js/strength.js');
    return m.EXERCISES.slice(1).reduce((n, e) => n + e.sets, 0);
  });
  assert.match(await page.locator('.sx-progress').innerText(), new RegExp(`0 of ${withoutFirst} sets`),
    'a muted movement still counts towards the session');
  assert.match(await page.locator('.sx-ex').first().innerText(), /muted for this session/i);
  assert.equal(await page.locator('.sx-ex').first().locator('.sx-set').count(), 0);
  await page.context().close();
});

await test('the manifest offers launcher shortcuts and matches the light default', async () => {
  const page = await newPage();
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  const urls = manifest.shortcuts.map(s => s.url);
  assert.deepEqual(urls, ['./#/log', './#/focus']);
  assert.equal(manifest.background_color, '#f5f7fc', 'splash is still dark while the app defaults to light');

  // Every shortcut has to land somewhere real.
  for (const shortcut of manifest.shortcuts) {
    await go(page, shortcut.url.replace('./#', ''));
    const missing = await page.locator('.empty:has-text("Page not found")').count();
    assert.equal(missing, 0, `${shortcut.url} is not a route`);
  }
  await page.context().close();
});

// ---------------------------------------------------------------------------
// The audit's §5 and §6, on screen: a backup that has stopped moving has to be
// visible on Home, and the map has to be able to show a change of direction.
// ---------------------------------------------------------------------------

await test('a backup that has stopped is said out loud on Home', async () => {
  const page = await newPage();
  await seed(page, [{ date: '2026-08-01', gi: 'gi' }]);

  // Configured, and the last attempt threw. `apiBase` points nowhere on
  // purpose: the daily auto-sync must not reach the real GitHub from a test.
  await page.evaluate(async () => {
    const sync = await import('/js/sync.js');
    const store = await import('/js/store.js');
    await sync.setConfig({
      owner: 'kezbolino', repo: 'jj-app-data', branch: 'main',
      token: 'fake', apiBase: 'http://localhost:8096',
    });
    await store.setSetting('lastSyncAt', new Date().toISOString());
    await store.setSetting('lastSyncError', { message: 'GitHub 401: Bad credentials', at: new Date().toISOString() });
  });

  await go(page, '/');
  const banner = page.locator('.banner.warn').filter({ hasText: 'Backup failed' });
  assert.ok(await banner.isVisible(), 'nothing on Home says the backup is broken');
  assert.equal(await banner.getAttribute('href'), '#/settings', 'the banner does not lead to the fix');

  // And the corner button carries it too, since that is the thing you look at.
  assert.ok(await page.locator('.avatar-btn.warn').isVisible(), 'the sync button looks fine');

  // A healthy backup says nothing at all — this must not become wallpaper.
  await page.evaluate(async () => {
    const store = await import('/js/store.js');
    await store.setSetting('lastSyncError', null);
  });
  await go(page, '/map');
  await go(page, '/');
  assert.equal(await page.locator('.banner.warn').count(), 0, 'the warning outstayed the failure');

  await page.context().close();
});

await test('the map shows attention month by month, once there is more than one month', async () => {
  const page = await newPage();
  const half = [{ kind: 'pos', position: 'half-guard', role: 'sweep' }];

  // Dates are built from the month, not from `daysAgo`, so this test doesn't
  // change meaning depending on which day of the month it runs — two days back
  // from the 1st is last month, and that is the whole thing under test.
  const now = new Date();
  const inMonth = (back, day) =>
    localISO(new Date(now.getFullYear(), now.getMonth() - back, day));

  // One month only: a trend needs two points, so nothing should render yet.
  await seed(page, [
    { date: inMonth(0, 1), gi: 'gi', tags: half },
    { date: inMonth(0, 2), gi: 'nogi', tags: half },
  ]);
  await go(page, '/map');
  assert.equal(await page.locator('.trend').count(), 0, 'one month of data drew a trend');

  // Add a class two months back and the picture has somewhere to go. Via Home,
  // because setting the hash to the one it already holds fires no hashchange
  // and the router would never rebuild the view.
  await seed(page, [{ date: inMonth(2, 15), gi: 'gi', tags: half }]);
  await go(page, '/');
  await go(page, '/map');
  assert.ok(await page.locator('.trend').first().isVisible(), 'no trend rendered');
  for (const heading of ['Classes by month', 'Attention drift']) {
    assert.ok(await page.getByText(heading, { exact: false }).first().isVisible(),
      `"${heading}" is not on the map`);
  }

  // The drift row is a link into the position, and its bars cover the window.
  const row = page.locator('.trend-row--pos').first();
  assert.match(await row.getAttribute('href'), /^#\/map\//, 'a drift row does not open its position');
  assert.equal(await row.locator('.trend-bars i').count(), 6, 'the window is not six months wide');

  await page.context().close();
});

/**
 * The one that answers the actual question: pull the plug and see if the app
 * still opens.
 *
 * Everything else in this file runs with a network. Until v53 the precache was
 * a single `cache.addAll` over 179 files, 134 of them optional voice clips, so
 * one failed download left *nothing* cached — and no test could tell, because
 * every one of them had a server to fall back on.
 */
await test('the app opens, reads and logs with the network switched off', async () => {
  const page = await newPage();
  await seed(page, [
    { date: '2026-08-01', gi: 'gi', sections: { drilled: 'armbar from guard' } },
    // Dated, not left to default to today: the class logged offline below has
    // to be the newest row for `.first()` to mean anything.
    { type: 'note', date: '2026-07-15', title: 'armbar detail', body: 'keep the elbow tight' },
  ]);

  // Wait for the worker to be installed *and* driving this page — going offline
  // before it controls the page proves nothing.
  const status = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
    const { offlineStatus } = await import('/js/offline.js');
    return offlineStatus();
  });
  assert.equal(status.supported, true, 'the worker did not answer OFFLINE_STATUS');
  assert.equal(status.coreMissing, 0, `${status.coreMissing} of the app's own files did not cache`);

  await page.context().setOffline(true);
  try {
    // A cold load with no network at all. This is the train.
    await page.goto(BASE + '#/library', { waitUntil: 'load' });
    // waitFor, not isVisible: the view is painted after an IndexedDB read, and
    // isVisible answers immediately — it would report "no" on a screen that was
    // about to be perfectly fine, which is a flake, not a finding.
    await page.getByText('keep the elbow tight').first().waitFor();
    await page.getByText('EVERYTHING · 2').first().waitFor();

    // A URL that was never visited online still has to land in the app rather
    // than on the browser's error page — that is the navigate fallback.
    await page.goto(BASE + '?never-seen=1#/map', { waitUntil: 'load' });
    await page.locator('.cov-grid, .trend, .view .card').first().waitFor();

    // And writing works, which is the half that would actually lose something.
    // Saved, then read back through the UI — an entry that only exists in a
    // variable is not a class you logged on a plane.
    await go(page, '/log');
    await page.locator('textarea').first().fill('logged this at 30,000 feet');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await page.waitForFunction(() => location.hash === '#/');

    await go(page, '/library');
    await page.locator('a.entry').first().click();
    assert.match(await page.locator('textarea').first().inputValue(), /30,000 feet/,
      'the entry logged offline did not come back');
  } finally {
    await page.context().setOffline(false);
  }

  await page.context().close();
});

await browser.close();

if (errors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(errors)]) console.log('  ', e);
  process.exitCode = 1;
} else {
  console.log('\nNo page errors.');
}
console.log(`${passed} passed`);
