// A single position's page — the "technique page" from the vision.
//
// Assembled entirely from tags. Nothing is filed here by hand: write about a
// knee slice in a class entry and it shows up under Half Guard / Pass.

import { h, card, empty, fmtDate, giFlag, tagChip } from '../ui.js';
import { POSITION_BY_ID, ROLE_LABEL, rolesFor } from '../ontology.js';
import * as store from '../store.js';
import { coverageBars } from './map.js';

function entryRow(entry) {
  return h('a.entry', { href: `#/log/${entry.id}` },
    h('div.entry-head',
      h('span.entry-date', fmtDate(entry.date)),
      entry.coach && h('span.entry-sub', entry.coach),
      giFlag(entry.gi)),
    entry.body && h('div.entry-body', entry.body.slice(0, 180) + (entry.body.length > 180 ? '…' : '')),
    (entry.tags ?? []).length ? h('div.tags', entry.tags.slice(0, 5).map(t => tagChip(t))) : null);
}

function videoRow(entry) {
  return h('a.vid', { href: `#/log/${entry.id}` },
    entry.video?.thumb ? h('img', { src: entry.video.thumb, alt: '', loading: 'lazy' }) : h('div'),
    h('div.vid-meta',
      h('div.vid-title', entry.video?.title || entry.title || 'Untitled video'),
      h('div.entry-sub', new URL(entry.video.url).hostname.replace('www.', ''))));
}

export default async function position(root, { positionId, role }) {
  const pos = POSITION_BY_ID[positionId];
  if (!pos) { root.append(empty('Unknown position.')); return; }

  const all = await store.allEntries();
  const cov = store.coverage(all);
  const tagged = store.entriesForPosition(all, positionId, role);

  const videos = tagged.filter(e => e.type === 'video' && e.video);
  const written = tagged.filter(e => e.type !== 'video');

  root.append(
    h('a.small.muted', { href: '#/map' }, '‹ Coverage map'),
    h('h2', pos.label + (role ? ` · ${ROLE_LABEL[role] ?? role}` : '')),
  );

  if (!role) {
    root.append(card('Coverage', coverageBars(positionId, cov[positionId].roles, { linkRole: true })));
  } else {
    root.append(h('p.small', h('a', { href: `#/map/${positionId}` }, 'Show all roles')));
  }

  root.append(card('Techniques in this position',
    h('div.tags', rolesFor(positionId).map(r => {
      const techniques = pos.techniques.filter(t => t.role === r.id);
      if (!techniques.length) return null;
      return h('span.tag', h('span.role', r.label + ':'), techniques.map(t => t.label).join(', '));
    }).filter(Boolean))));

  root.append(card(`Entries · ${written.length}`,
    written.length ? written.map(entryRow) : empty('Nothing written about this yet.')));

  root.append(card(`Videos · ${videos.length}`,
    videos.length ? videos.map(videoRow) : empty('No videos saved here yet.')));
}
