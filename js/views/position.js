// A single position's page — the "technique page" from the vision.
//
// Assembled entirely from tags. Nothing is filed here by hand: write about a
// knee slice in a class entry and it shows up under Half Guard / Pass.

import { h, card, empty, toast, fmtDate, giFlag, tagChip, icon } from '../ui.js';
import { POSITION_BY_ID, ROLE_LABEL, rolesFor } from '../ontology.js';
import * as store from '../store.js';
import { coverageBars } from './map.js';

function entryRow(entry) {
  return h('a.entry', { href: `#/log/${entry.id}` },
    h('div.entry-head',
      h('span.entry-date', fmtDate(entry.date)),
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
  const likedSet = new Set((await store.getLikedMoves()).map(m => `${m.position}/${m.technique}`));
  const reload = () => { root.replaceChildren(); position(root, { positionId, role }); };

  const videos = tagged.filter(e => e.type === 'video' && e.video);
  const written = tagged.filter(e => e.type !== 'video');

  const total = cov[positionId].total;
  const share = all.length ? Math.round((total / all.length) * 100) : 0;
  const roleCounts = cov[positionId].roles;
  const busiest = Math.max(0, ...Object.values(roleCounts));
  const hasGap = busiest >= 3 && Object.values(roleCounts).some(n => n === 0);

  root.append(
    h('a.small.muted', { href: '#/map' }, '‹ Coverage map'),
    h('div.page-head',
      h('div',
        h('h1.page-title', pos.label + (role ? ` · ${ROLE_LABEL[role] ?? role}` : '')),
        h('p.page-sub',
          `${total} ${total === 1 ? 'entry' : 'entries'} · ${share}% of everything you have written`))),
  );

  if (!role) {
    root.append(card('Coverage',
      coverageBars(positionId, roleCounts, { linkRole: true }),
      hasGap
        ? h('p.small.muted', { style: 'margin:14px 0 0' },
            'A dashed amber rail means nothing written for that role yet — not that you are bad at it.')
        : null));
  } else {
    root.append(h('p.small', h('a', { href: `#/map/${positionId}` }, 'Show all roles')));
  }

  const techChip = t => {
    const on = likedSet.has(`${positionId}/${t.id}`);
    const star = h('button.starbtn' + (on ? '.on' : ''), {
      'aria-label': (on ? 'Unstar ' : 'Star ') + t.label,
      onclick: async () => {
        await store.toggleLikedMove({ position: positionId, technique: t.id });
        toast(on ? 'Unstarred' : 'Starred');
        reload();
      },
    }, icon('star'));
    return h('span.tag', t.label, star);
  };

  root.append(card('Techniques — ★ the ones you like',
    rolesFor(positionId).map(r => {
      const techniques = pos.techniques.filter(t => t.role === r.id);
      if (!techniques.length) return null;
      return h('div', { style: 'margin-bottom:12px' },
        h('div.card-title', { style: 'margin-bottom:6px' }, r.label),
        h('div.tags', techniques.map(techChip)));
    }).filter(Boolean)));

  root.append(card(`Entries · ${written.length}`,
    written.length ? written.map(entryRow) : empty('Nothing written about this yet.')));

  root.append(card(`Videos · ${videos.length}`,
    videos.length ? videos.map(videoRow) : empty('No videos saved here yet.')));
}
