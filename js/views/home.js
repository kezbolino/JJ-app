// Dashboard — the front door.
//
// Three panels, all derived from the user's own entries (the gym publishes no
// curriculum, so there is no external source to read). Plus one coverage
// prompt once there is enough written down to make it honest.

import { h, card, empty, fmtDate, giFlag, tagChip, icon, sectionHead } from '../ui.js';
import { positionLabel, ROLE_LABEL } from '../ontology.js';
import * as store from '../store.js';

function brandRow() {
  return h('div.brand-row',
    h('h1.brand-jj', 'JJ'),
    h('a.avatar-btn', { href: '#/settings', 'aria-label': 'Settings' }, icon('user')));
}

function heroCard(counts, gi) {
  const stat = (n, l, good) => h('div.hero-stat' + (good ? '.good' : ''),
    h('div.n', n), h('div.l', l));
  return h('section.card.hero',
    h('div.hero-top',
      h('div',
        h('div.hero-label', 'Total classes logged'),
        h('div.hero-num', String(counts.total)))),
    h('hr.hero-divide'),
    h('div.hero-stats',
      stat(String(counts.week), 'This week'),
      stat(String(counts.month), 'Last 30 days'),
      stat(gi ? `${gi.pct}%` : '—', 'Gi / No-gi', true)));
}

// The focus list is now a flashcard deck of its own — the front door just shows
// what's in it and links across. Editing and flipping live on the Working-on
// page, keeping the dashboard calm.
function focusPanel(focuses) {
  const fronts = focuses.map(f => f.front);
  return h('a.banner', { href: '#/focus' },
    h('span.b-ico', icon('pin')),
    h('span.b-txt' + (fronts.length ? '' : '.muted'),
      fronts.length ? `Working on: ${fronts.join(' · ')}` : 'Nothing yet — add flashcards'),
    h('span.b-edit', fronts.length ? 'Drill' : 'Add'));
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

// The most recent class, as the "last session" card.
function lastSession(entries) {
  const last = entries.find(e => e.type === 'class');
  if (!last) {
    return card(null, empty('No classes yet. Tap Log after your next session.'));
  }
  const lines = (last.body || '').split('\n').map(s => s.trim()).filter(Boolean);
  const title = lines[0] || 'Class';
  const rest = lines.slice(1).join(' ');

  return h('a.card.session', { href: `#/log/${last.id}` },
    h('div.s-head',
      h('span.s-when', icon('calendar'), fmtDate(last.date)),
      giFlag(last.gi)),
    h('div.s-title', title.slice(0, 80) + (title.length > 80 ? '…' : '')),
    rest && h('div.s-body', rest.slice(0, 130) + (rest.length > 130 ? '…' : '')),
    (last.tags ?? []).length ? h('div.tags', { style: 'margin-top:10px' },
      last.tags.slice(0, 4).map(t => tagChip(t))) : null);
}

export default async function home(root) {
  const entries = await store.allEntries();
  const focuses = await store.getFocuses();

  root.append(...[
    brandRow(),
    heroCard(store.countClasses(entries), store.giRatio(entries)),
    focusPanel(focuses),
    gapPanel(store.findGaps(entries)),
    sectionHead('Last session', h('a', { href: '#/library' }, 'History ›')),
    lastSession(entries),
    h('div.btn-row', { style: 'margin-top:16px' },
      h('a.btn.primary.wide.cta', { href: '#/log' }, icon('plus'), 'Log a class')),
  ].filter(Boolean));
}
