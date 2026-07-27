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
  await page.waitForSelector('.stat');
  const zero = await page.locator('.stat .n').first().innerText();
  if (zero !== '0') throw new Error(`expected 0 classes, got ${zero}`);
});

await page.screenshot({ path: `${SHOT}/01-empty.png` });

await step('logs a class with auto-suggested tags', async () => {
  await page.click('a.btn.primary');            // "Log a class"
  await page.waitForSelector('textarea');
  await page.fill('input[type=text]', 'John');  // coach
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
  const kept = await page.locator('.card:has(.card-title:text-is("Tags")) .tag').count();
  if (kept < 3) throw new Error(`tags not retained, got ${kept}`);
});

await step('saves and returns home with the class counted', async () => {
  await page.click('button.btn.primary:has-text("Save entry")');
  await page.waitForSelector('.stat');
  await page.waitForTimeout(200);
  const week = await page.locator('.stat .n').first().innerText();
  if (week !== '1') throw new Error(`expected 1 class this week, got ${week}`);
  const themes = await page.locator('.card:has-text("Recent class themes") .tag').count();
  if (!themes) throw new Error('no recent themes rendered');
});

await page.screenshot({ path: `${SHOT}/03-home.png`, fullPage: true });

await step('coverage map shows the position and its roles', async () => {
  await page.click('a[data-tab="/map"]');
  await page.waitForSelector('.cov-row');
  const text = await page.locator('#view').innerText();
  if (!text.includes('Half Guard')) throw new Error('Half Guard missing from map');
});

await page.screenshot({ path: `${SHOT}/04-map.png`, fullPage: true });

await step('position page assembles entries from tags', async () => {
  await page.click('a.link-row:has-text("Half Guard")');
  await page.waitForSelector('a:has-text("‹ Coverage map")');
  const text = await page.locator('#view').innerText();
  if (!/entries · 1/i.test(text)) throw new Error('entry not linked to position');
});

await page.screenshot({ path: `${SHOT}/05-position.png`, fullPage: true });

await step('search finds it', async () => {
  await page.click('#btn-search');
  await page.waitForSelector('#view input');
  await page.fill('#view input', 'guillotine');
  await page.waitForTimeout(200);
  const text = await page.locator('#view').innerText();
  if (!/1 result/i.test(text)) throw new Error('search did not find the entry');
});

await step('quick capture + backup export work', async () => {
  await page.click('a[data-tab="/library"]');
  await page.waitForSelector('textarea');
  await page.fill('textarea', 'Why do I keep getting flattened in half guard?');
  await page.selectOption('select', 'question');
  await page.click('button.btn:has-text("Save question")');
  await page.waitForTimeout(400);
  const text = await page.locator('#view').innerText();
  if (!/everything · 2/i.test(text)) throw new Error('quick note not saved');
});

await page.screenshot({ path: `${SHOT}/06-library.png`, fullPage: true });

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
  await page.waitForSelector('.stat');
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
