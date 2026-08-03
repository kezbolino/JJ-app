// Sync settings — point the app at your private backup repo.

import { h, card, toast, empty, tagChip, fmtDate, BELT_RANKS } from '../ui.js';
import * as sync from '../sync.js';
import * as store from '../store.js';
import * as backup from '../backup.js';
import * as overrides from '../overrides.js';
import * as appearance from '../appearance.js';

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
      appearance.THEMES, appearance.getTheme, appearance.setTheme));
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
