// Library — everything you've saved, plus the places to add things that
// aren't a class: a video, a stray note, a question, something the coach said.

import { h, card, empty, toast, fmtDate, giFlag, tagChip, icon, sectionHead } from '../ui.js';
import { suggestTagsOnly } from '../tagger.js';
import * as store from '../store.js';
import * as backup from '../backup.js';
import * as sync from '../sync.js';
import * as overrides from '../overrides.js';
import { parseVideoId, thumbFor, fetchTitle } from '../youtube.js';

function searchField() {
  const input = h('input', { type: 'text', placeholder: 'Search techniques & notes…', 'aria-label': 'Search' });
  const go = () => {
    const q = input.value.trim();
    location.hash = `#/search${q ? '?q=' + encodeURIComponent(q) : ''}`;
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  return h('div.search-field', icon('search'), input);
}

function syncBanner(pending) {
  return h('div.banner.warn',
    h('span.b-ico', icon('cloud')),
    h('span.b-txt', `${pending} ${pending === 1 ? 'entry' : 'entries'} not backed up yet`),
    h('a.b-edit', { href: '#/settings', style: 'color:var(--warm)' }, 'Sync'));
}

function addVideoForm(onSaved) {
  const urlInput = h('input', { type: 'text', placeholder: 'Paste a YouTube link…' });
  const titleInput = h('input', { type: 'text', placeholder: 'Title (filled in automatically if online)' });
  const tagsInput = h('input', { type: 'text', placeholder: 'What is it about? e.g. half guard knee slice' });

  const save = async () => {
    const url = urlInput.value.trim();
    const videoId = parseVideoId(url);
    if (!videoId) { toast('That does not look like a YouTube link'); return; }

    const meta = await fetchTitle(url);
    const title = titleInput.value.trim() || meta?.title || 'Untitled video';

    await store.saveEntry(store.newEntry({
      type: 'video',
      title,
      body: tagsInput.value.trim(),
      tags: suggestTagsOnly(`${title} ${tagsInput.value}`, await overrides.getOverrides()),
      video: { videoId, url, title, thumb: thumbFor(videoId) },
    }));

    urlInput.value = titleInput.value = tagsInput.value = '';
    toast('Video saved');
    onSaved();
  };

  return card(null, urlInput,
    h('div', { style: 'height:8px' }), titleInput,
    h('div', { style: 'height:8px' }), tagsInput,
    h('div.btn-row', h('button.btn.primary', { onclick: save }, 'Save video')));
}

function videoRow(entry) {
  let host = 'Link';
  try { host = new URL(entry.video.url).hostname.replace('www.', ''); } catch { /* keep default */ }
  const label = host.includes('youtu') ? 'YouTube link' : host;
  return h('a.vidref', { href: `#/log/${entry.id}` },
    h('span.thumb', icon('video')),
    h('div.v-meta',
      h('div.v-title', entry.video?.title || entry.title || 'Untitled video'),
      h('div.v-sub', label)));
}

function fastCapture(onSaved) {
  const typeSelect = h('select',
    h('option', { value: 'note' }, 'Note'),
    h('option', { value: 'question' }, 'Question'),
    h('option', { value: 'principle' }, 'Coach principle'));
  const input = h('input', { type: 'text', placeholder: 'Fast capture note…' });
  const saveBtn = h('button.btn.primary', 'Save');

  const save = async () => {
    const body = input.value.trim();
    if (!body) return;
    await store.saveEntry(store.newEntry({
      type: typeSelect.value,
      body,
      tags: suggestTagsOnly(body, await overrides.getOverrides()),
    }));
    input.value = '';
    toast('Saved');
    onSaved();
  };
  saveBtn.addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });

  return h('div',
    h('div', { style: 'margin-bottom:8px' }, typeSelect),
    h('div.capture-row', input, saveBtn));
}

const NOTE_TYPES = { note: 'Note', question: 'Question', principle: 'Principle' };

function noteCard(entry) {
  const lines = (entry.body || '').split('\n').map(s => s.trim()).filter(Boolean);
  const title = lines[0] || NOTE_TYPES[entry.type] || 'Note';
  const rest = lines.slice(1).join(' ');
  return h('a.note-card', { href: `#/log/${entry.id}` },
    h('div.note-head',
      h('span.note-title', title.slice(0, 80) + (title.length > 80 ? '…' : '')),
      h('span.note-date', fmtDate(entry.date))),
    rest && h('div.note-body', rest.slice(0, 140) + (rest.length > 140 ? '…' : '')));
}

function backupCard(configured) {
  const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const result = await backup.importData(await file.text());
      toast(`Imported: ${result.added} new, ${result.updated} updated`);
      location.reload();
      // Sync config and bookkeeping in the file are ignored on purpose — see
      // DEVICE_LOCAL_SETTINGS in js/backup.js.
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });

  return card('Backup',
    h('p.small.muted', configured
      ? 'Synced to your private notes repo as markdown. JSON export is here if you want a copy off GitHub.'
      : 'Your notes live in this browser only. Clear your site data or lose the device and they are gone — set up sync.'),
    h('div.btn-row',
      h('a.btn' + (configured ? '' : '.primary'), { href: '#/settings' }, configured ? 'Sync settings' : 'Set up sync'),
      h('button.btn', { onclick: async () => toast(`Exported ${await backup.downloadBackup()} entries`) }, 'Export'),
      h('button.btn', { onclick: () => fileInput.click() }, 'Import'),
      fileInput));
}

const TYPE_LABEL = { class: 'Class', note: 'Note', question: 'Question', video: 'Video', principle: 'Principle' };

/**
 * Recently deleted, with a one-tap restore.
 *
 * Deleting used to be genuinely irreversible: the row went, the file left the
 * repo, and the only copy left was a commit on github.com the user has never
 * been shown. Now the row stays for 30 days and this is where it waits.
 *
 * The trash is device-local by design — the note is already gone from the
 * backup repo, because a "deleted" note lingering in the mirror is the opposite
 * of what deleting is for.
 */
function trashCard(trashed, reload) {
  if (!trashed.length) return null;

  const row = entry => {
    const left = store.trashDaysLeft(entry);
    const label = (entry.title || entry.body || '').split('\n')[0] || TYPE_LABEL[entry.type] || 'Entry';
    return h('div.trash-row',
      h('div.trash-meta',
        h('span.trash-title', label.slice(0, 60) + (label.length > 60 ? '…' : '')),
        h('span.trash-sub', `${fmtDate(entry.date)} · ${left} ${left === 1 ? 'day' : 'days'} left`)),
      h('button.btn.small', {
        onclick: async () => {
          await store.restoreEntry(entry.id);
          toast('Restored');
          reload();
        },
      }, icon('undo'), 'Restore'));
  };

  return card(`Recently deleted · ${trashed.length}`,
    h('p.small.muted', { style: 'margin:-2px 0 10px' },
      'Kept on this device for 30 days, then gone for good. Already removed from your backup repo.'),
    trashed.map(row));
}

export default async function library(root) {
  const entries = await store.allEntries();
  const trashed = await store.trashedEntries();
  const config = await sync.getConfig();
  const configured = sync.isConfigured(config);
  const pending = configured ? store.pendingSync(entries, await sync.getLastSync()) : 0;
  const reload = () => { root.replaceChildren(); library(root); };

  const videos = entries.filter(e => e.type === 'video' && e.video);
  const notes = entries.filter(e => e.type === 'note' || e.type === 'question' || e.type === 'principle');
  const everything = h('div');

  const addVideo = h('div', { hidden: true });
  addVideo.append(addVideoForm(reload));
  const addVideoToggle = h('a', {
    href: '#', onclick: e => { e.preventDefault(); addVideo.hidden = !addVideo.hidden; },
  }, 'Add link ›');

  // --- "Everything", paged and filterable ---------------------------------
  // This list used to render every entry that had ever existed, on every visit
  // to the tab and again on every quick-capture save. At three classes a week
  // that is ~1,500 rows in ten years, built synchronously on a phone. It is
  // paged now, and the filters mean you rarely need to page at all.
  const PAGE = 50;
  let shown = PAGE;
  let typeFilter = '';

  const entryRow = e => h('a.entry', { href: `#/log/${e.id}` },
    h('div.entry-head',
      h('span.entry-date', e.type === 'class' ? fmtDate(e.date) : (TYPE_LABEL[e.type] ?? e.type)),
      e.type !== 'class' && h('span.entry-sub', fmtDate(e.date)),
      giFlag(e.gi),
      e.session ? h('span.gi-flag.s-type', store.SESSION_LABEL[e.session]) : null),
    (e.title || e.body) && h('div.entry-body',
      (e.title || e.body).slice(0, 140) + ((e.title || e.body).length > 140 ? '…' : '')),
    (e.tags ?? []).length ? h('div.tags', e.tags.slice(0, 4).map(t => tagChip(t))) : null);

  const filterRow = h('div.seg.seg-filter',
    [['', 'All'], ...store.ENTRY_TYPES.map(t => [t, TYPE_LABEL[t] ?? t])].map(([value, label]) => {
      const btn = h('button', { type: 'button' }, label);
      btn.setAttribute('aria-pressed', String(typeFilter === value));
      btn.addEventListener('click', () => {
        typeFilter = value;
        shown = PAGE;
        for (const other of filterRow.children) {
          other.setAttribute('aria-pressed', String(other === btn));
        }
        paintList();
      });
      return btn;
    }));

  const listBox = h('div');
  const paintList = () => {
    const matching = typeFilter ? entries.filter(e => e.type === typeFilter) : entries;
    const page = matching.slice(0, shown);
    listBox.replaceChildren(
      ...(page.length ? page.map(entryRow) : [empty('Nothing here.')]),
      ...(matching.length > shown
        ? [h('div.btn-row', h('button.btn.wide', {
            onclick: () => { shown += PAGE; paintList(); },
          }, `Show more · ${matching.length - shown} left`))]
        : []));
  };

  everything.append(card(`Everything · ${entries.length}`, filterRow, listBox));
  paintList();

  root.append(...[
    h('div.page-head', h('h1.page-title', 'Library')),
    searchField(),
    pending ? syncBanner(pending) : null,

    sectionHead('Saved videos', addVideoToggle),
    addVideo,
    videos.length ? h('div', videos.map(videoRow)) : empty('No videos saved yet. Tap Add link.'),

    sectionHead('Notes',
      h('a', { href: '#', onclick: e => { e.preventDefault(); everything.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'View all ›')),
    fastCapture(reload),
    notes.length ? h('div', notes.slice(0, 6).map(noteCard)) : empty('Nothing captured yet.'),

    h('div', { style: 'height:8px' }),
    everything,

    trashCard(trashed, reload),
    backupCard(configured),
  ].filter(Boolean));
}
