// Coverage map — every position, and how your attention is split inside it.
//
// It shows what you have written about, not what you are good at. An empty
// cell next to a full one is a gap in your notes, and that is all it ever
// claims to be. Nothing here draws a shape that could be mistaken for a
// measurement of you — that is why the decorative radar was deleted in v13.

import { h, card, empty, toast, tagChip, icon, tally } from '../ui.js';
import { POSITIONS, POSITION_BY_ID, TECHNIQUE_BY_ID, ROLES, ROLE_LABEL, rolesFor, techniqueLabel } from '../ontology.js';
import * as store from '../store.js';

/**
 * The position × role rails — the sacred chart. One row per role: label, rail,
 * count.
 *
 * Width is the role's share of the busiest role *within this position*, so the
 * rows are comparable to each other and not to another position's. A role with
 * nothing in it is a dashed amber rail at full width, never a short blue one:
 * length must never imply a small amount where there is none.
 */
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
      h('div.cov-track' + (isGap ? '.gap' : ''),
        n ? h('div.cov-fill', { style: `width:${Math.max(8, (n / max) * 100)}%` }) : null),
      h('span.cov-n', { 'aria-label': `${n} ${n === 1 ? 'entry' : 'entries'}` }, String(n)));

    const label = linkRole
      ? h('a.cov-role', { href: `#/map/${positionId}/${role.id}` }, role.label)
      : h('span.cov-role', role.label);

    return h('div.cov-row' + (isGap ? '.gap' : ''), label, bar);
  }));
}

/**
 * The whole matrix at a glance: positions down the side, roles across the top,
 * opacity for volume. This replaced the decorative radar, which drew a shape
 * that looked like a measurement of you and wasn't one.
 *
 * A zero cell is never a faint blue cell — it is dashed amber, because a role
 * with nothing in it next to one with plenty is the product's whole thesis.
 * Below the gap threshold there is no amber at all, so day one reads as
 * "empty", not "failing".
 */
function heatmap(entries) {
  const cov = store.coverage(entries);
  const active = store.activePositions(entries);

  // Cold start: show the structure with nothing in it rather than nothing.
  const rows = active.length
    ? active.slice(0, 8)
    : POSITIONS.slice(0, 6).map(p => ({ id: p.id, label: p.label, roles: cov[p.id].roles }));

  // Roles vary by position — a guard has sweeps, a pin has escapes — so the
  // columns are every role these rows actually use, in the ontology's own
  // order. Capping the axis to the few most-shared roles was tried and dropped:
  // it left whole positions as a row of "not applicable" dots, which reads as
  // "nothing here" when the truth is "you're looking at the wrong axis". The
  // grid scrolls sideways instead, with the position labels pinned.
  const columns = ROLES.filter(r => rows.some(row => row.roles[r.id] !== undefined));

  const max = Math.max(1, ...rows.flatMap(r =>
    columns.map(c => r.roles[c.id] ?? 0)));

  const cell = row => role => {
    const n = row.roles[role.id];
    if (n === undefined) {
      // This position has no such role. Inert — not a gap, nothing missing.
      return h('div.heat__cell.heat__cell--na',
        { title: `${row.label} has no ${role.label.toLowerCase()} role` }, '·');
    }
    const label = `${row.label}, ${role.label}: ${n} ${n === 1 ? 'entry' : 'entries'}`;
    const rowMax = Math.max(0, ...Object.values(row.roles));
    if (n === 0 && rowMax >= 3) {
      return h('div.heat__cell.heat__cell--gap',
        { role: 'img', 'aria-label': `${label} — nothing written yet`, title: label }, '0');
    }
    const alpha = 0.06 + 0.79 * (n / max);
    // The number is only legible once the fill is solid enough to carry it;
    // below that it lives in the label, which is what screen readers use anyway.
    return h('div.heat__cell' + (alpha >= 0.62 ? '.heat__cell--solid' : ''), {
      style: `background:rgba(var(--accent-rgb),${alpha.toFixed(3)})`,
      role: 'img', 'aria-label': label, title: label,
    }, alpha >= 0.45 ? String(n) : '');
  };

  const grid = h('div.heat',
    { style: `grid-template-columns: 62px repeat(${columns.length}, minmax(44px, 1fr))` },
    h('div.heat__corner'),
    columns.map(c => h('div.heat__head', c.label)),
    rows.map(row => [
      h('a.heat__label', { href: `#/map/${row.id}` }, row.label),
      columns.map(cell(row)),
    ]));

  return card('Attention by position × role', h('div.heat-scroll', grid),
    h('div.heat-legend',
      h('span', h('i.on'), 'More written'),
      h('span', h('i.off'), 'Nothing yet')));
}

// All-time share of attention, as discrete tally squares rather than a bar —
// twenty cells you can count, instead of a length you have to eyeball.
function exposure(active) {
  const max = Math.max(1, ...active.map(p => p.count));
  return h('div.exposure', active.map(p => {
    const pct = Math.round((p.count / max) * 100);
    return h('a.exp-row', { href: `#/map/${p.id}` },
      h('span.exp-name', p.label),
      tally(pct, `${p.label}: ${p.count} ${p.count === 1 ? 'entry' : 'entries'}, ${pct}% of your busiest position`),
      h('span.exp-pct', `${pct}%`));
  }));
}

// A picker that narrows Position → Move, for starring a move by hand.
function movePicker() {
  const pos = h('select',
    h('option', { value: '' }, 'Position…'),
    POSITIONS.map(p => h('option', { value: p.id }, p.label)));
  const tech = h('select', { disabled: true }, h('option', { value: '' }, 'Move…'));

  pos.addEventListener('change', () => {
    const p = POSITION_BY_ID[pos.value];
    tech.disabled = !p;
    tech.replaceChildren(
      h('option', { value: '' }, 'Move…'),
      ...(p ? p.techniques.map(t =>
        h('option', { value: t.id }, `${t.label} · ${ROLE_LABEL[t.role] ?? t.role}`)) : []));
  });

  return {
    fields: [pos, tech],
    read() { return pos.value && tech.value ? { position: pos.value, technique: tech.value } : null; },
  };
}

function likedTag(m) {
  const info = TECHNIQUE_BY_ID[`${m.position}/${m.technique}`];
  return { kind: 'pos', position: m.position, technique: m.technique, role: info?.role ?? null };
}

function suggestionRow(s, onStar) {
  const label = techniqueLabel(s.position, s.technique);
  const star = h('button.starbtn', {
    'aria-label': `Star ${label}`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); onStar({ position: s.position, technique: s.technique }); },
  }, icon('star'));
  return h('a.sug', { href: `#/map/${s.position}` },
    h('div.sug-main', h('span.sug-name', label), h('span.sug-reason', s.reason)),
    star);
}

// "Your game": the moves you like, plus adjacent ones worth drilling next.
function yourGame(entries, liked, reload) {
  const onStar = async move => { await store.toggleLikedMove(move); reload(); };

  const picker = movePicker();
  const addRow = h('div.btn-row',
    ...picker.fields,
    h('button.btn.small', {
      onclick: () => {
        const m = picker.read();
        if (!m) { toast('Pick a move first'); return; }
        onStar(m);
      },
    }, 'Star it'));

  const chips = liked.length
    ? h('div.tags', liked.map(m => tagChip(likedTag(m), { onRemove: () => onStar(m) })))
    : empty('No moves starred yet. Star the ones you like below, or ★ them on any position page.');

  const blocks = [card('Your game',
    h('p.small.muted', { style: 'margin:-2px 0 10px' },
      'Star moves you like — the app points you to adjacent ones to drill next.'),
    chips,
    h('div', { style: 'height:10px' }), addRow)];

  if (liked.length) {
    const suggestions = store.suggestMoves(entries, liked, { limit: 8 });
    blocks.push(card('Moves to explore',
      suggestions.length
        ? h('div.suggestions', suggestions.map(s => suggestionRow(s, onStar)))
        : empty('Star a few more and related moves will surface here.')));
  }
  return blocks;
}

export default async function map(root) {
  const entries = await store.allEntries();
  const active = store.activePositions(entries);
  const liked = await store.getLikedMoves();
  const reload = () => { root.replaceChildren(); map(root); };

  root.append(h('div.page-head',
    h('div',
      h('h1.page-title', 'Your map'),
      h('p.page-sub', 'Where your attention has gone — attention, not skill'))));

  // The matrix first: it is the one picture that shows a gap as an absence
  // sitting next to a presence, which is the thing this app exists to notice.
  root.append(heatmap(entries));

  if (!active.length) {
    root.append(card(null, empty('Nothing logged yet. The map fills in as you write.')));
    root.append(...yourGame(entries, liked, reload));
    return;
  }

  root.append(
    h('div.card-title', 'Exposure breakdown'),
    exposure(active),
    h('p.small.muted', { style: 'margin-top:12px' },
      'Share of what you have written about, relative to your busiest position — attention, not skill.'),
  );

  root.append(...yourGame(entries, liked, reload));

  const gaps = store.findGaps(entries);
  if (gaps.length) {
    root.append(card('Gaps', h('div.prompt',
      h('p.small', 'Roles with nothing written, next to roles with plenty:'),
      h('div.tags', gaps.slice(0, 5).map(g =>
        h('a.tag.concept', { href: `#/map/${g.position}` },
          POSITIONS.find(p => p.id === g.position)?.label,
          h('span.role', `no ${(ROLE_LABEL[g.emptyRole] ?? g.emptyRole).toLowerCase()}`)))))));
  }

  const cov = store.coverage(entries);
  root.append(card('Positions you have written about',
    active.map(position =>
      h('a.link-row', { href: `#/map/${position.id}` },
        h('strong', position.label),
        h('span.count', `${position.count} ${position.count === 1 ? 'entry' : 'entries'} ›`)))));

  // Nothing here can repeat the lists above — these are the positions with a
  // coverage total of zero, and everything above is drawn from the non-zero ones.
  const untouched = POSITIONS.filter(p => cov[p.id].total === 0);
  if (untouched.length) {
    root.append(card('Nothing written yet',
      h('div.tags', untouched.map(p => h('a.tag.concept', { href: `#/map/${p.id}` }, p.label)))));
  }
}
