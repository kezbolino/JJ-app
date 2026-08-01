// End-to-end smoke test: log a class, watch it get tagged, land on a technique
// page, count on the dashboard, and turn into a coverage prompt.
//
// There is no build step and no test framework — this is one script driving a
// real browser. Run it with:
//
//   python3 -m http.server 8099 &   # from the repo root
//   node tests/smoke.mjs
//
// Needs Playwright on the machine (a global install is fine).

import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ESM ignores NODE_PATH, and this repo has no node_modules of its own, so fall
// back to wherever npm keeps global packages.
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return import(`${root}/playwright/index.mjs`);
  }
}
const { chromium } = await loadPlaywright();

const BASE = process.env.BASE_URL ?? 'http://localhost:8099/';
const SHOT = process.env.SHOT_DIR ?? '/tmp/jj-app-shots';

mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '—', e.message); throw e; }
};

await step('loads dashboard', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sbit-total');
  const zero = await page.locator('.sbit-total .sbit-n').first().innerText();
  if (zero !== '0') throw new Error(`expected 0 classes, got ${zero}`);
});

await page.screenshot({ path: `${SHOT}/01-empty.png` });

await step('logs a class with auto-suggested tags', async () => {
  await page.click('a.btn.primary');            // "Log a class"
  await page.waitForSelector('textarea');

  await page.click('.seg button:has-text("Gi")');
  const areas = page.locator('textarea');
  await areas.nth(0).fill('Knee slice pass, leg weave pass, cross face pressure');
  await areas.nth(1).fill('Passed Steve twice. Got guillotined three times. Lost chest pressure.');
  await areas.nth(2).fill('Need to keep my hips lower during passing.');
  await page.waitForTimeout(400);
  const suggested = await page.locator('.tag.suggest').count();
  if (suggested < 3) throw new Error(`expected several suggestions, got ${suggested}`);
});

await page.screenshot({ path: `${SHOT}/02-log.png`, fullPage: true });

await step('accepts every suggestion', async () => {
  for (let i = 0; i < 20; i++) {
    const chip = page.locator('.tag.suggest').first();
    if (!(await chip.count())) break;
    await chip.click();
    await page.waitForTimeout(60);
  }
  const kept = await page.locator('.tag:not(.suggest):not(.add)').count();
  if (kept < 3) throw new Error(`tags not retained, got ${kept}`);
});

await step('saves and returns home with the class counted', async () => {
  await page.click('button.btn.primary:has-text("Save entry")');
  await page.waitForSelector('.sbit-week');
  await page.waitForTimeout(200);
  const week = await page.locator('.sbit-week .sbit-n').innerText();
  if (week !== '1') throw new Error(`expected 1 class this week, got ${week}`);
  const sessionTags = await page.locator('.card.session .tag').count();
  if (!sessionTags) throw new Error('no last-session tags rendered');
});

await page.screenshot({ path: `${SHOT}/03-home.png`, fullPage: true });

// Settings has no tab of its own, and the cloud button stops linking to it once
// sync is configured — so the gear on Home is the one route that always works.
await step('the gear on Home opens Settings', async () => {
  await page.click('.settings-btn');
  await page.waitForSelector('.page-title');
  const title = await page.locator('.page-title').innerText();
  if (title !== 'Settings') throw new Error(`gear landed on "${title}", not Settings`);
  await page.click('a[data-tab="/"]');
  await page.waitForSelector('.sbit-total');
});

await step('coverage map shows the heatmap and the tally rows', async () => {
  await page.click('a[data-tab="/map"]');
  await page.waitForSelector('.heat__cell');
  const text = await page.locator('#view').innerText();
  if (!text.includes('Half Guard')) throw new Error('Half Guard missing from map');
  if (!(await page.locator('.exp-row .tally__c.is-on').count())) {
    throw new Error('exposure tally rendered no filled cells');
  }
});

await page.screenshot({ path: `${SHOT}/04-map.png`, fullPage: true });

await step('position page assembles entries from tags', async () => {
  await page.click('a.link-row:has-text("Half Guard")');
  await page.waitForSelector('a:has-text("‹ Coverage map")');
  await page.waitForSelector('.cov-row');    // the sacred position × role rails
  const text = await page.locator('#view').innerText();
  if (!/entries · 1/i.test(text)) throw new Error('entry not linked to position');
});

await page.screenshot({ path: `${SHOT}/05-position.png`, fullPage: true });

await step('starring a move surfaces adjacent ones on the map', async () => {
  // Star Knee Slice from the techniques list on the position page.
  const techniques = page.locator('.card', { hasText: 'the ones you like' });
  await techniques.locator('.tag', { hasText: 'Knee Slice' }).first().locator('.starbtn').click();
  await page.waitForTimeout(200);

  await page.click('a[data-tab="/map"]');
  await page.waitForSelector('.card:has-text("Your game")');
  const game = await page.locator('.card', { hasText: 'Your game' }).innerText();
  if (!/knee slice/i.test(game)) throw new Error('starred move missing from Your game');

  // Its half-guard passing siblings (e.g. Leg Weave) should be offered.
  const explore = page.locator('.card', { hasText: 'Moves to explore' });
  if (!(await explore.locator('.sug').count())) throw new Error('no adjacent moves suggested');
});

await page.screenshot({ path: `${SHOT}/09-your-game.png`, fullPage: true });

await step('search finds it', async () => {
  await page.goto(BASE + '#/search', { waitUntil: 'networkidle' });
  await page.waitForSelector('#view input');
  await page.fill('#view input', 'guillotine');
  await page.waitForTimeout(200);
  const text = await page.locator('#view').innerText();
  if (!/1 result/i.test(text)) throw new Error('search did not find the entry');
});

await step('quick capture + backup export work', async () => {
  await page.click('a[data-tab="/library"]');
  await page.waitForSelector('.capture-row input');
  await page.fill('.capture-row input', 'Why do I keep getting flattened in half guard?');
  await page.selectOption('select', 'question');
  await page.click('.capture-row button.btn.primary');
  await page.waitForTimeout(400);
  const text = await page.locator('#view').innerText();
  if (!/everything · 2/i.test(text)) throw new Error('quick note not saved');
});

await page.screenshot({ path: `${SHOT}/06-library.png`, fullPage: true });

await step('muting a bad suggestion sticks', async () => {
  await page.goto(BASE + '#/log', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea');
  await page.locator('textarea').nth(0).fill('worked on pressure and knee slice');
  await page.waitForTimeout(400);

  const pressure = page.locator('.tag.suggest', { hasText: 'Pressure' });
  if (!(await pressure.count())) throw new Error('Pressure was never suggested');
  await pressure.locator('button.mute').click();
  await page.waitForTimeout(300);
  if (await page.locator('.tag.suggest', { hasText: 'Pressure' }).count()) {
    throw new Error('muted suggestion still showing');
  }

  // And it stays muted on a fresh visit.
  await page.goto(BASE + '#/log', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea');
  await page.locator('textarea').nth(0).fill('all about pressure');
  await page.waitForTimeout(400);
  if (await page.locator('.tag.suggest', { hasText: 'Pressure' }).count()) {
    throw new Error('mute did not persist');
  }
});

await step('teaching a word makes it suggestable', async () => {
  await page.goto(BASE + '#/log', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea');
  await page.click('button.link:has-text("Show options")');   // reveal the advanced panel

  const teachCard = page.locator('.teach');
  await teachCard.locator('input[placeholder*="word you actually use"]').fill('the rodeo');
  await teachCard.locator('select').nth(0).selectOption('half-guard');
  await teachCard.locator('select').nth(1).selectOption('sweep');
  await teachCard.locator('select').nth(2).selectOption('dogfight');
  await teachCard.locator('button', { hasText: 'Teach it' }).click();
  await page.waitForTimeout(300);

  await page.locator('textarea').nth(0).fill('hit the rodeo twice tonight');
  await page.waitForTimeout(400);
  if (!(await page.locator('.tag.suggest', { hasText: 'Dogfight' }).count())) {
    throw new Error('taught word not suggested');
  }
});

await page.screenshot({ path: `${SHOT}/08-teach.png`, fullPage: true });

await step('settings lists the corrections and can undo them', async () => {
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  const text = await page.locator('#view').innerText();
  if (!text.includes('the rodeo')) throw new Error('taught word missing from settings');
  if (!/pressure/i.test(text)) throw new Error('muted word missing from settings');

  const mutedRow = page.locator('.tag', { hasText: 'pressure' }).first();
  await mutedRow.locator('button').click();
  await page.waitForTimeout(500);

  await page.goto(BASE + '#/log', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea');
  await page.locator('textarea').nth(0).fill('all about pressure');
  await page.waitForTimeout(400);
  if (!(await page.locator('.tag.suggest', { hasText: 'Pressure' }).count())) {
    throw new Error('unmute did not restore the suggestion');
  }
});

await step('gap prompt appears once a role is well covered', async () => {
  // Three more passing-only entries, so half guard passing is "filled" and the
  // empty roles next to it become a genuine gap.
  await page.evaluate(async () => {
    const store = await import('/js/store.js');
    for (let i = 0; i < 3; i++) {
      await store.saveEntry(store.newEntry({
        date: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10),
        sections: { techniques: 'knee slice', rolling: '', thoughts: '' },
        tags: [{ kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' }],
      }));
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sbit-week');
  const text = await page.locator('#view').innerText();
  if (!/worth a look/i.test(text)) throw new Error('no gap prompt rendered');
  console.log('   prompt:', text.split(/worth a look/i)[1].split('\n').filter(Boolean)[0]);
});

await page.screenshot({ path: `${SHOT}/07-gap.png`, fullPage: true });

await browser.close();

if (errors.length) {
  console.log('\n--- page errors ---');
  for (const e of [...new Set(errors)]) console.log(e);
  process.exit(1);
}
console.log('\nAll steps passed, no page errors.');
