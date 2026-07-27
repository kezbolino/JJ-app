// Coverage map — every position, and how your attention is split inside it.
//
// This is the honest version of the radar chart. It shows what you have
// written about, not what you are good at. An empty bar next to a full one is
// a gap in your notes, and that is all it ever claims to be.

import { h, card, empty } from '../ui.js';
import { POSITIONS, ROLE_LABEL, rolesFor } from '../ontology.js';
import * as store from '../store.js';

export function coverageBars(positionId, roleCounts, { linkRole = null } = {}) {
  const roles = rolesFor(positionId);
  const max = Math.max(1, ...Object.values(roleCounts));

  // Only call something a gap once a sibling role is genuinely well covered —
  // otherwise a single entry paints the whole position amber and means nothing.
  const meaningful = max >= 3;

  return h('div.cov', roles.map(role => {
    const n = roleCounts[role.id] ?? 0;
    const isGap = n === 0 && meaningful;
    const bar = h('div.cov-bar',
      h('div.cov-track', h('div.cov-fill' + (n ? '' : '.zero'), {
        style: `width:${n ? Math.max(8, (n / max) * 100) : 100}%`,
      })),
      h('span.cov-n', String(n)));

    const label = linkRole
      ? h('a.cov-role', { href: `#/map/${positionId}/${role.id}` }, role.label)
      : h('span.cov-role', role.label);

    return h('div.cov-row' + (isGap ? '.gap' : ''), label, bar);
  }));
}

export default async function map(root) {
  const entries = await store.allEntries();
  const cov = store.coverage(entries);
  const active = POSITIONS.filter(p => cov[p.id].total > 0)
    .sort((a, b) => cov[b.id].total - cov[a.id].total);
  const untouched = POSITIONS.filter(p => cov[p.id].total === 0);

  root.append(h('h2', 'Coverage map'));

  if (!active.length) {
    root.append(card(null, empty('Nothing logged yet. The map fills in as you write.')));
    return;
  }

  const gaps = store.findGaps(entries);
  if (gaps.length) {
    root.append(card('Gaps', h('div.prompt',
      h('p.small', 'Roles with nothing written, next to roles with plenty:'),
      h('div.tags', gaps.slice(0, 5).map(g =>
        h('a.tag', { href: `#/map/${g.position}` },
          POSITIONS.find(p => p.id === g.position)?.label,
          h('span.role', `no ${(ROLE_LABEL[g.emptyRole] ?? g.emptyRole).toLowerCase()}`)))))));
  }

  for (const position of active) {
    root.append(card(null,
      h('a.link-row', { href: `#/map/${position.id}` },
        h('strong', position.label),
        h('span.count', `${cov[position.id].total} ${cov[position.id].total === 1 ? 'entry' : 'entries'} ›`)),
      coverageBars(position.id, cov[position.id].roles)));
  }

  if (untouched.length) {
    root.append(card('Nothing written yet',
      h('div.tags', untouched.map(p => h('a.tag', { href: `#/map/${p.id}` }, p.label)))));
  }
}
