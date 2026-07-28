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

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs) => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// A decorative radar backdrop with a dot per busy position, placed further out
// the more of your attention it holds. The honest numbers are in the bars below.
function radar(active) {
  const svg = svgEl('svg', { viewBox: '0 0 100 100' });
  for (const r of [14, 27, 40]) svg.append(svgEl('circle', { class: 'ring', cx: 50, cy: 50, r }));
  svg.append(svgEl('line', { class: 'axis', x1: 50, y1: 8, x2: 50, y2: 92 }));
  svg.append(svgEl('line', { class: 'axis', x1: 8, y1: 50, x2: 92, y2: 50 }));

  const top = active.slice(0, 6);
  const max = Math.max(1, ...top.map(p => p.count));
  top.forEach((p, i) => {
    const angle = (i / top.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 8 + (p.count / max) * 32;
    const dot = svgEl('circle', {
      class: 'dot' + (i < 2 ? '' : ' dim'),
      cx: (50 + Math.cos(angle) * radius).toFixed(1),
      cy: (50 + Math.sin(angle) * radius).toFixed(1),
      r: 3.5,
    });
    const title = svgEl('title', {});
    title.textContent = p.label;
    dot.append(title);
    svg.append(dot);
  });
  return h('div.radar', svg);
}

function exposure(active) {
  const max = Math.max(1, ...active.map(p => p.count));
  return h('div.exposure', active.map(p => {
    const pct = Math.round((p.count / max) * 100);
    return h('a.exp-row', { href: `#/map/${p.id}` },
      h('span.exp-name', p.label),
      h('span.exp-track', h('span.exp-fill', { style: `width:${pct}%` })),
      h('span.exp-pct', `${pct}%`));
  }));
}

export default async function map(root) {
  const entries = await store.allEntries();
  const active = store.activePositions(entries);

  root.append(h('div.page-head',
    h('div',
      h('h1.page-title', 'Your map'),
      h('p.page-sub', 'See where you are spending your mat time'))));

  if (!active.length) {
    root.append(card(null, empty('Nothing logged yet. The map fills in as you write.')));
    return;
  }

  root.append(
    radar(active),
    h('div.card-title', 'Exposure breakdown'),
    exposure(active),
    h('p.small.muted', { style: 'margin-top:10px' },
      'Share of what you have written about, relative to your busiest position — attention, not skill.'),
  );

  const gaps = store.findGaps(entries);
  if (gaps.length) {
    root.append(h('div', { style: 'height:8px' }), card('Gaps', h('div.prompt',
      h('p.small', 'Roles with nothing written, next to roles with plenty:'),
      h('div.tags', gaps.slice(0, 5).map(g =>
        h('a.tag', { href: `#/map/${g.position}` },
          POSITIONS.find(p => p.id === g.position)?.label,
          h('span.role', `no ${(ROLE_LABEL[g.emptyRole] ?? g.emptyRole).toLowerCase()}`)))))));
  }

  const cov = store.coverage(entries);
  root.append(h('div.card-title', { style: 'margin-top:22px' }, 'Roles within each position'));
  for (const position of active) {
    root.append(card(null,
      h('a.link-row', { href: `#/map/${position.id}` },
        h('strong', position.label),
        h('span.count', `${position.count} ${position.count === 1 ? 'entry' : 'entries'} ›`)),
      coverageBars(position.id, cov[position.id].roles)));
  }

  const untouched = POSITIONS.filter(p => cov[p.id].total === 0);
  if (untouched.length) {
    root.append(card('Nothing written yet',
      h('div.tags', untouched.map(p => h('a.tag', { href: `#/map/${p.id}` }, p.label)))));
  }
}
