// Library — everything you've saved, plus the places to add things that
// aren't a class: a video, a stray note, a question, something the coach said.

import { h, card, empty, toast, fmtDate, giFlag, tagChip } from '../ui.js';
import { suggestTags } from '../tagger.js';
import * as store from '../store.js';
import * as backup from '../backup.js';
import * as sync from '../sync.js';
import { parseVideoId, thumbFor, fetchTitle } from '../youtube.js';

function addVideoCard(onSaved) {
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
      tags: suggestTags(`${title} ${tagsInput.value}`),
      video: { videoId, url, title, thumb: thumbFor(videoId) },
    }));

    urlInput.value = titleInput.value = tagsInput.value = '';
    toast('Video saved');
    onSaved();
  };

  return card('Add a video', urlInput,
    h('div', { style: 'height:8px' }), titleInput,
    h('div', { style: 'height:8px' }), tagsInput,
    h('div.btn-row', h('button.btn.primary', { onclick: save }, 'Save video')));
}

function quickNoteCard(onSaved) {
  const typeSelect = h('select',
    h('option', { value: 'note' }, 'Note'),
    h('option', { value: 'question' }, 'Question'),
    h('option', { value: 'principle' }, 'Coach principle'));
  const bodyInput = h('textarea', { placeholder: 'Losing the underhook because my elbow flares…' });
  const saveButton = h('button.btn', 'Save note');

  // Two "Save" buttons on one screen is a coin toss for the user; name it.
  typeSelect.addEventListener('change', () => {
    saveButton.textContent = { note: 'Save note', question: 'Save question', principle: 'Save principle' }[typeSelect.value];
  });

  saveButton.addEventListener('click', async () => {
    const body = bodyInput.value.trim();
    if (!body) return;
    await store.saveEntry(store.newEntry({
      type: typeSelect.value,
      body,
      tags: suggestTags(body),
    }));
    bodyInput.value = '';
    toast('Saved');
    onSaved();
  });

  return card('Quick capture', typeSelect,
    h('div', { style: 'height:8px' }), bodyInput,
    h('div.btn-row', saveButton));
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
  const configured = sync.isConfigured(await sync.getConfig());
  const reload = () => { root.replaceChildren(); library(root); };

  root.append(
    h('h2', 'Library'),
    addVideoCard(reload),
    quickNoteCard(reload),
    card(`Everything · ${entries.length}`,
      entries.length
        ? entries.map(e => h('a.entry', { href: `#/log/${e.id}` },
            h('div.entry-head',
              h('span.entry-date', e.type === 'class' ? fmtDate(e.date) : (TYPE_LABEL[e.type] ?? e.type)),
              e.type !== 'class' && h('span.entry-sub', fmtDate(e.date)),
              giFlag(e.gi)),
            (e.title || e.body) && h('div.entry-body',
              (e.title || e.body).slice(0, 140) + ((e.title || e.body).length > 140 ? '…' : '')),
            (e.tags ?? []).length ? h('div.tags', e.tags.slice(0, 4).map(t => tagChip(t))) : null))
        : empty('Nothing saved yet.')),
    backupCard(configured),
  );
}
