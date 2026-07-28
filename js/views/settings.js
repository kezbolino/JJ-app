// Sync settings — point the app at your private backup repo.

import { h, card, toast, empty, tagChip } from '../ui.js';
import * as sync from '../sync.js';
import * as backup from '../backup.js';
import * as overrides from '../overrides.js';

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
    h('h2', 'Sync & backup'),

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

    correctionsCard(corrections, reload),

    card('Manual backup',
      h('p.small.muted', 'A single JSON file, for when you want a copy off GitHub entirely.'),
      h('div.btn-row',
        h('button.btn', {
          onclick: async () => toast(`Exported ${await backup.downloadBackup()} entries`),
        }, 'Export JSON'))),

    h('div.btn-row', h('a.small', { href: '#/library' }, '‹ Back to library')),
  );
}
