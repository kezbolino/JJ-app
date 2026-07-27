// Dashboard — the front door.
//
// Three panels, all derived from the user's own entries (the gym publishes no
// curriculum, so there is no external source to read). Plus one coverage
// prompt once there is enough written down to make it honest.

import { h, card, empty, fmtDate, giFlag, tagChip } from '../ui.js';
import { positionLabel, ROLE_LABEL } from '../ontology.js';
import * as store from '../store.js';

function statRow(counts) {
  const stat = (n, l) => h('div.stat', h('div.n', String(n)), h('div.l', l));
  return h('div.stat-row',
    stat(counts.week, 'This week'),
    stat(counts.month, '30 days'),
    stat(counts.total, 'All time'));
}

function focusPanel(focuses, onChange) {
  const input = h('input', { type: 'text', placeholder: 'Add a focus…', maxLength: 40 });

  const add = () => {
    const value = input.value.trim();
    if (!value || focuses.includes(value)) return;
    onChange([...focuses, value]);
  };

  return card('Focus this week',
    focuses.length
      ? h('div.tags', focuses.map(f =>
          h('span.tag', f, h('button', {
            onclick: () => onChange(focuses.filter(x => x !== f)),
            'aria-label': `Remove ${f}`,
          }, '×'))))
      : empty('Nothing set. What are you working on?'),
    h('div.btn-row',
      input,
      h('button.btn.small', { onclick: add }, 'Add')),
  );
}

function themesPanel({ classes, themes }) {
  if (!classes) return card('Recent class themes', empty('Log a class and this fills in.'));
  const body = themes.length
    ? h('div.tags', themes.slice(0, 6).map(t =>
        h('span.tag', positionLabel(t.position), h('span.role', `×${t.count}`))))
    : empty('Last few classes have no position tags yet.');
  return card(`Recent class themes · last ${classes}`, body);
}

function gapPanel(gaps) {
  if (!gaps.length) return null;
  const g = gaps[0];
  const filled = (ROLE_LABEL[g.filledRole] ?? g.filledRole).toLowerCase();
  const emptyRole = (ROLE_LABEL[g.emptyRole] ?? g.emptyRole).toLowerCase();
  const position = positionLabel(g.position);

  return card('Worth a look', h('div.prompt',
    h('p', `You've written about ${position} ${filled} ${g.filledCount} times — and nothing on ${emptyRole}.`),
    h('a.small', { href: `#/map/${g.position}` }, `Open ${position} →`),
  ));
}

function recentPanel(entries) {
  const recent = entries.slice(0, 3);
  if (!recent.length) {
    return card('Recent', empty('No entries yet. Tap Log after your next class.'));
  }
  return card('Recent',
    recent.map(e => h('a.entry', { href: `#/log/${e.id}` },
      h('div.entry-head',
        h('span.entry-date', fmtDate(e.date)),
        e.coach && h('span.entry-sub', e.coach),
        giFlag(e.gi)),
      e.body && h('div.entry-body', e.body.slice(0, 110) + (e.body.length > 110 ? '…' : '')),
      (e.tags ?? []).length ? h('div.tags', e.tags.slice(0, 4).map(t => tagChip(t))) : null)),
  );
}

export default async function home(root) {
  const entries = await store.allEntries();
  const focuses = await store.getFocuses();

  root.append(
    statRow(store.countClasses(entries)),
    h('div', { style: 'height:12px' }),
    focusPanel(focuses, async next => {
      await store.setFocuses(next);
      location.reload();
    }),
    themesPanel(store.recentThemes(entries)),
    gapPanel(store.findGaps(entries)),
    recentPanel(entries),
    h('div.btn-row', h('a.btn.primary.wide', { href: '#/log' }, 'Log a class')),
  );
}
