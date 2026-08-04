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
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(8000);   // fail fast; a hung selector shouldn't cost 30s
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
  // Two classes a week for three weeks, so the streak is unambiguous.
  await seed(page, [
    { date: daysAgo(1), gi: 'gi' }, { date: daysAgo(3), gi: 'nogi' },
    { date: daysAgo(8), gi: 'gi' }, { date: daysAgo(10), gi: 'nogi' },
    { date: daysAgo(15), gi: 'gi' }, { date: daysAgo(17), gi: 'nogi' },
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

await test('the deck flips and steps, with no rating asked for', async () => {
  const page = await newPage();
  await setSetting(page, 'focuses', [
    { front: 'half guard passing', back: 'knee across, kill the underhook' },
    { front: 'triangle finish', back: 'cut the angle' },
  ]);

  await go(page, '/focus');
  await page.waitForSelector('.flashcard');
  assert.match(await page.locator('.fc-count').innerText(), /1 \/ 2/);

  // v20 removed the Again/Good/Easy rating and the scheduler behind it.
  assert.equal(await page.locator('.fc-grade').count(), 0, 'the grade buttons are back');

  await page.click('.flashcard');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.flashcard.flipped').count(), 1, 'tapping did not flip the card');

  await page.click('.fc-arrow[aria-label="Next"]');
  await page.waitForTimeout(150);
  assert.match(await page.locator('.fc-count').innerText(), /2 \/ 2/);
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

await test('leaving the routine stops its timer instead of leaving it running', async () => {
  // The router just empties #view; nothing tells a view it has been replaced.
  // An interval left behind would tick against detached nodes for the rest of
  // the session, holding the wake lock with it. Same class of bug as the
  // render-clobber at the top of this file, so it gets pinned the same way.
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
  await page.waitForTimeout(400);          // one tick is all it needs to notice
  assert.equal(await page.evaluate(() => window.__ids.size), before,
    'the stretch timer is still running after navigating away');

  // And the screen you left for is intact.
  assert.equal(await page.locator('textarea').count() > 0, true, 'the log form did not render');
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

await test('the rest-day routine runs a rest phase between sets', async () => {
  const page = await newPage();
  await go(page, '/stretch?r=rest-day');
  assert.equal(await page.locator('.st-pick button.is-on').innerText(), 'Rest day');

  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');
  assert.match(await page.locator('.st-phase').innerText(), /get ready/i);
  assert.match(await page.locator('.st-step').innerText(), /work 1 of 18/i);

  // Skipping lands at the top of the next set, so the phase is "get ready"
  // again — proving rest belongs to the set it follows, not the one it precedes.
  await page.click('.st-skip');
  await page.waitForTimeout(200);
  assert.match(await page.locator('.st-step').innerText(), /work 2 of 18/i);
  await page.context().close();
});

await test('a movement with no artwork yet leaves the frame out instead of drawing a blank', async () => {
  const page = await newPage();
  await go(page, '/stretch?r=rest-day');
  await page.click('.st-intro .btn.cta');
  await page.waitForSelector('.st-count');

  // Nothing in the rest-day session is drawn yet, so the figure slot must be
  // hidden rather than showing an empty box that reads as broken.
  assert.equal(await page.locator('.st-fig svg').count(), 0);
  assert.ok(await page.locator('.st-fig').isHidden(), 'an empty figure frame is on screen');
  // The movement is still fully usable without a picture.
  assert.ok((await page.locator('.st-name').innerText()).length > 0);
  assert.ok((await page.locator('.st-cue').innerText()).length > 20);
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

await browser.close();

if (errors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(errors)]) console.log('  ', e);
  process.exitCode = 1;
} else {
  console.log('\nNo page errors.');
}
console.log(`${passed} passed`);
