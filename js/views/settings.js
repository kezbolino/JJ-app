// Sync settings — point the app at your private backup repo.

import { h, card, toast, empty, tagChip, fmtDate, BELT_RANKS } from '../ui.js';
import * as sync from '../sync.js';
import { VERSION } from '../version.js';
import * as store from '../store.js';
import * as backup from '../backup.js';
import * as overrides from '../overrides.js';
import * as appearance from '../appearance.js';
import { VOICES } from '../voices.js';

// A segmented picker over [value, label] pairs; taps apply immediately so the
// change is visible on the buttons/text on this very screen.
function pickerCard(title, hint, options, current, onPick) {
  const seg = h('div.seg');
  const paint = () => {
    for (const btn of seg.children) btn.setAttribute('aria-pressed', String(btn.dataset.val === current()));
  };
  for (const [val, label] of options) {
    const btn = h('button', { type: 'button' }, label);
    btn.dataset.val = val;
    btn.addEventListener('click', () => { onPick(val); paint(); });
    seg.append(btn);
  }
  paint();
  return card(title, hint && h('p.small.muted', hint), seg);
}

function appearanceCard() {
  return h('div',
    pickerCard('App font', 'The face the whole app is set in.',
      appearance.FONTS, appearance.getFont, appearance.setFont),
    pickerCard('Button style', 'Chunky pressable buttons, or an iOS-flat feel.',
      appearance.BUTTON_STYLES, appearance.getButtonStyle, appearance.setButtonStyle),
    pickerCard('Theme', 'Auto follows your phone. Light and dark pin it either way.',
      appearance.THEMES, appearance.getTheme, appearance.setTheme),
    pickerCard('Off mat voice', 'Who calls the stretches and the lifts. Mix picks one at random each session; a change lands on the next one you start.',
      VOICES, appearance.getVoicePref, appearance.setVoicePref));
}

/**
 * Belt history — the promotions you have actually been given.
 *
 * The app repeats what you tell it and counts the classes you have logged
 * since. It does not estimate a rank, and there is deliberately no
 * "time to next belt": that is a decision someone else makes about you, not a
 * number an app gets to predict. Same reason the fabricated "mat hours" badge
 * was refused in v5.
 */
function beltCard(promotions, standing, reload) {
  const rankSelect = h('select',
    h('option', { value: '' }, 'Rank…'),
    BELT_RANKS.map(rank => h('option', { value: rank }, rank[0].toUpperCase() + rank.slice(1))));
  const dateInput = h('input', { type: 'date', value: store.todayISO() });

  const add = async () => {
    if (!rankSelect.value) { toast('Pick a rank'); return; }
    if (!dateInput.value) { toast('Pick the date you were promoted'); return; }
    await store.setPromotions([
      ...promotions.filter(p => p.rank !== rankSelect.value),
      { rank: rankSelect.value, date: dateInput.value },
    ]);
    toast('Saved');
    reload();
  };

  const rows = promotions.length
    ? h('div.belt-list', [...promotions].reverse().map(p =>
        h('div.belt-row',
          h('i.belt-dot.belt-' + p.rank),
          h('span.belt-name', p.rank[0].toUpperCase() + p.rank.slice(1)),
          h('span.belt-date', fmtDate(p.date)),
          h('button', {
            'aria-label': `Remove ${p.rank}`,
            onclick: async () => {
              await store.setPromotions(promotions.filter(x => x.rank !== p.rank));
              toast('Removed');
              reload();
            },
          }, '×'))))
    : empty('No promotions recorded. Add one and the mark on Home fills to your rank.');

  return card('Your belt',
    h('p.small.muted',
      standing
        ? `${standing.rank[0].toUpperCase() + standing.rank.slice(1)} belt since ${fmtDate(standing.date)} — ` +
          `${standing.classesSince} ${standing.classesSince === 1 ? 'class' : 'classes'} logged since then.`
        : 'Record the promotions you have been given. The app counts classes since — it never guesses a rank or predicts the next one.'),
    rows,
    h('label', { style: 'margin-top:12px' }, 'Add a promotion'),
    h('div.btn-row', rankSelect, dateInput,
      h('button.btn.small', { onclick: add }, 'Add')));
}

function fmtWhen(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Everything the user has taught or muted, with an undo on each. */
function correctionsCard(corrections, reload) {
  const { aliases, muted } = corrections;

  const aliasList = aliases.length
    ? h('div.tags', aliases.map(a =>
        h('span.tag',
          h('strong', a.term),
          h('span.role', '→'),
          tagChip(a.tag),
          h('button', {
            onclick: async () => { await overrides.removeAlias(a.term); toast('Forgotten'); reload(); },
            'aria-label': `Forget ${a.term}`,
          }, '×'))))
    : empty('Nothing taught yet. Do it from the Log screen when a tag comes out wrong.');

  const mutedList = muted.length
    ? h('div.tags', muted.map(m =>
        h('span.tag', m.term,
          h('button', {
            onclick: async () => { await overrides.unmuteTerm(m.term); toast('Unmuted'); reload(); },
            'aria-label': `Unmute ${m.term}`,
          }, '×'))))
    : empty('No muted words.');

  return card('Your ontology corrections',
    h('p.small.muted',
      'The shipped technique list is a best guess. These are your fixes to it — ' +
      'they apply immediately and travel with your notes.'),
    h('label', 'Words you have taught'), aliasList,
    h('label', 'Words you have muted'), mutedList);
}

/**
 * The escape hatch for a stuck service worker.
 *
 * The worker is cache-first, so a wedged one serves yesterday's app forever and
 * nothing on screen says why. On Chrome you can drop it from
 * `chrome://serviceworker-internals`; **this user is on Firefox, where the only
 * reliable route also wipes IndexedDB** — the source of truth *and* the sync
 * token. So the app has to offer the way out itself, or the answer is "export,
 * clear site data, reinstall, mint a new token", which is what it was.
 *
 * Three things, in order of how much they help:
 *   - say which version is running, so "am I stale?" is answerable at all;
 *   - `registration.update()` on demand, rather than waiting on the browser's
 *     own schedule;
 *   - if a new worker is waiting, take it and reload.
 */
function updateCard() {
  const status = h('p.small.muted', `Running ${VERSION}.`);
  const btn = h('button.btn.wide', { type: 'button' }, 'Check for updates');

  btn.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) {
      status.textContent = 'This browser has no service worker, so there is nothing cached to update.';
      return;
    }
    btn.disabled = true;
    status.textContent = 'Checking…';
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        status.textContent = 'No worker registered — you are already loading straight from the network.';
        btn.disabled = false;
        return;
      }
      // Ask now rather than waiting for the browser to get round to it.
      await reg.update();

      // `waiting` is a new worker held back; `installing` is one still
      // downloading. Either means an update is really there.
      const pending = reg.waiting ?? reg.installing;
      if (!pending) {
        status.textContent = `Running ${VERSION}. No update waiting — this is the latest.`;
        btn.disabled = false;
        return;
      }
      let fallback;
      status.textContent = 'Update found. Applying…';
      // `redundant` means the new worker was discarded — almost always because
      // `cache.addAll(SHELL)` rejected, which is what pins a phone on an old
      // version indefinitely. Say so: silently reloading back to the same
      // number is the behaviour that made this impossible to diagnose.
      pending.addEventListener('statechange', () => {
        if (pending.state === 'redundant') {
          clearTimeout(fallback);
          status.textContent =
            'An update downloaded but failed to install, so the old version is still being served. '
            + 'That is a bug worth reporting, not something you can clear from here.';
          btn.disabled = false;
        }
      });
      // The page is about to be replaced, so anything half-typed elsewhere is
      // already gone by the user's own choice in tapping this.
      const go = () => location.reload();
      if (reg.waiting) { navigator.serviceWorker.addEventListener('controllerchange', go, { once: true }); reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
      pending.addEventListener('statechange', () => { if (pending.state === 'activated') go(); });
      // A worker that installs and claims without ever going through `waiting`
      // fires controllerchange instead; and if neither lands, reload anyway
      // rather than leaving "Applying…" on screen forever.
      navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
      fallback = setTimeout(go, 4000);
    } catch (err) {
      status.textContent = `Could not check — ${err.message}`;
      btn.disabled = false;
    }
  });

  return card('App version',
    h('p.small.muted',
      'If the version here is behind what is deployed, the offline cache is stuck. ' +
      'This forces it to look for a new one and reload.'),
    h('div.btn-row', btn),
    status);
}

export default async function settings(root) {
  const config = await sync.getConfig();
  const lastSync = await sync.getLastSync();
  const corrections = await overrides.getOverrides();
  const promotions = await store.getPromotions();
  const standing = store.beltStanding(await store.allEntries(), promotions);
  const reload = () => { root.replaceChildren(); settings(root); };

  const owner = h('input', { type: 'text', value: config.owner, placeholder: 'kezbolino' });
  const repo = h('input', { type: 'text', value: config.repo, placeholder: 'jj-app-data' });
  const branch = h('input', { type: 'text', value: config.branch || 'main', placeholder: 'main' });
  const token = h('input', { type: 'password', value: config.token, placeholder: 'github_pat_…' });
  const status = h('p.small.muted', `Last sync: ${fmtWhen(lastSync)}`);

  const read = () => ({
    owner: owner.value.trim(),
    repo: repo.value.trim(),
    branch: branch.value.trim() || 'main',
    token: token.value.trim(),
  });

  const save = async () => {
    await sync.setConfig(read());
    toast('Saved');
  };

  const test = async () => {
    const next = read();
    if (!sync.isConfigured(next)) { toast('Fill in owner, repo and token first'); return; }
    status.textContent = 'Checking…';
    try {
      const info = await sync.checkAccess(next);
      await sync.setConfig(next);
      status.textContent = info.private
        ? `Connected. Repo is private — good.`
        : `Connected, but that repo is PUBLIC. Your notes would be readable by anyone.`;
    } catch (err) {
      status.textContent = err.message;
    }
  };

  const runSync = async () => {
    await sync.setConfig(read());
    status.textContent = 'Syncing…';
    try {
      const result = await sync.sync();
      status.textContent =
        `Synced. Pushed ${result.pushed}, pulled ${result.added + result.updated}` +
        (result.deleted ? `, removed ${result.deleted}` : '') + '.';
      toast('Sync complete');
    } catch (err) {
      status.textContent = `Sync failed — ${err.message}`;
    }
  };

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Settings'),
        h('p.page-sub', 'Sync, appearance and the words you have taught it'))),

    card('How this works',
      h('p.small.muted',
        'Your notes live in this browser. Sync writes them as markdown files to a ' +
        'private GitHub repo — readable on github.com, openable in Obsidian — and ' +
        'pulls down anything written on your other devices.'),
      h('p.small.muted',
        'Your flashcard deck, starred moves, belt promotions and off-mat sessions ' +
        'travel too, in one app-state.md file. A lift you have not finished stays ' +
        'on this device.'),
      h('p.small.muted',
        'The token is stored in this browser only. It is never written to either repo. ' +
        'Use a fine-grained token scoped to the data repo alone, with Contents: read and write.')),

    card('Backup repo',
      h('label', 'Owner'), owner,
      h('label', 'Repository'), repo,
      h('label', 'Branch'), branch,
      h('label', 'Access token'), token,
      h('div.btn-row',
        h('button.btn', { onclick: test }, 'Test connection'),
        h('button.btn', { onclick: save }, 'Save')),
      status),

    card('Sync now',
      sync.isConfigured(config)
        ? h('p.small.muted', 'Pulls first, then pushes. Newer always wins.')
        : empty('Fill in the repo details above first.'),
      h('div.btn-row', h('button.btn.primary.wide', { onclick: runSync }, 'Sync now'))),

    updateCard(),

    beltCard(promotions, standing, reload),

    correctionsCard(corrections, reload),

    h('h2', { style: 'margin-top:28px' }, 'Appearance'),
    appearanceCard(),

    card('Manual backup',
      h('p.small.muted', 'A single JSON file, for when you want a copy off GitHub entirely.'),
      h('div.btn-row',
        h('button.btn', {
          onclick: async () => toast(`Exported ${await backup.downloadBackup()} entries`),
        }, 'Export JSON'))),

    h('div.btn-row', h('a.small', { href: '#/library' }, '‹ Back to library')),
  );
}
