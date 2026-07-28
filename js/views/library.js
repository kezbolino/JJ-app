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

export default async function library(root) {
  const entries = await store.allEntries();
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

  everything.append(card(`Everything · ${entries.length}`,
    entries.length
      ? entries.map(e => h('a.entry', { href: `#/log/${e.id}` },
          h('div.entry-head',
            h('span.entry-date', e.type === 'class' ? fmtDate(e.date) : (TYPE_LABEL[e.type] ?? e.type)),
            e.type !== 'class' && h('span.entry-sub', fmtDate(e.date)),
            giFlag(e.gi)),
          (e.title || e.body) && h('div.entry-body',
            (e.title || e.body).slice(0, 140) + ((e.title || e.body).length > 140 ? '…' : '')),
          (e.tags ?? []).length ? h('div.tags', e.tags.slice(0, 4).map(t => tagChip(t))) : null))
      : empty('Nothing saved yet.')));

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

    backupCard(configured),
  ].filter(Boolean));
}
