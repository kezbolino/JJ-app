// Dashboard — the front door.
//
// Three panels, all derived from the user's own entries (the gym publishes no
// curriculum, so there is no external source to read). Plus one coverage
// prompt once there is enough written down to make it honest.

import { h, card, empty, fmtDate, giFlag, tagChip, icon, sectionHead, toast, clear, brandMark } from '../ui.js';
import { positionLabel, ROLE_LABEL } from '../ontology.js';
import * as store from '../store.js';
import * as sync from '../sync.js';

// The top-right button is now a sync control (it used to open Settings — that's
// still reachable from Library). Not configured yet → it links to Settings to
// set sync up. Configured → tap to sync now; a dot shows when there are local
// changes not yet pushed. The app also syncs itself once a day (see home()),
// so the button is mostly a manual nudge and a status light.
function syncButton({ configured, pending, root }) {
  if (!configured) {
    return h('a.avatar-btn', { href: '#/settings', 'aria-label': 'Set up sync' }, icon('cloud'));
  }
  const btn = h('button.avatar-btn' + (pending ? '.pending' : ''),
    { 'aria-label': pending ? `Sync now (${pending} unsaved)` : 'Sync now', title: 'Sync now' },
    icon('cloud'));
  btn.addEventListener('click', async () => {
    const ok = await runSync(btn);
    if (ok) { clear(root); home(root); }  // refresh counts + the pending dot
  });
  return btn;
}

// Shared by the button and the daily auto-sync. `quiet` suppresses the toast
// (auto-sync shouldn't nag, especially when the phone is just offline).
async function runSync(btn, { quiet = false } = {}) {
  if (btn?.dataset.busy) return;
  if (btn) { btn.dataset.busy = '1'; btn.classList.add('busy'); }
  try {
    const r = await sync.sync();
    if (!quiet) toast(`Synced · ↑${r.pushed} ↓${r.added + r.updated}`);
    return true;
  } catch (err) {
    if (!quiet) toast(`Sync failed — ${err.message}`);
    return false;
  } finally {
    if (btn) { delete btn.dataset.busy; btn.classList.remove('busy'); }
  }
}

// Settings has no tab of its own, and the cloud button stops linking to it the
// moment sync is configured — so without this gear the only way in is a button
// at the bottom of the Library tab. The sync control stays rightmost: it is the
// one you reach for often.
function brandRow(syncCtl) {
  return h('div.brand-row', brandMark(),
    h('div.brand-actions',
      h('a.avatar-btn.settings-btn', { href: '#/settings', 'aria-label': 'Settings', title: 'Settings' },
        icon('gear')),
      syncCtl));
}

function heroCard(counts, gi) {
  const stat = (n, l, good) => h('div.hero-stat' + (good ? '.good' : ''),
    h('div.n', n), h('div.l', l));
  // A rail across the card's top edge, filled to the gi share — the same number
  // as the third tile, read at a glance.
  const rail = h('div.hero-rail', {
    role: 'img',
    'aria-label': gi ? `${gi.pct}% of recorded classes were gi` : 'No gi / no-gi recorded yet',
  }, h('i', { style: `width:${gi ? gi.pct : 0}%` }));

  return h('section.card.hero',
    rail,
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

  // Amber, because this is a gap. Amber is only ever allowed to mean that.
  return h('section.card.warncard',
    h('div.card-title', 'Worth a look'),
    h('div.prompt',
      h('p', `You've written about ${position} ${filled} ${g.filledCount} times — and nothing on ${emptyRole}.`),
      h('a.small', { href: `#/map/${g.position}` }, `Open ${position} →`)));
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
      giFlag(last.gi),
      h('span.s-edit', icon('edit'), 'Edit')),
    h('div.s-title', title.slice(0, 80) + (title.length > 80 ? '…' : '')),
    rest && h('div.s-body', rest.slice(0, 130) + (rest.length > 130 ? '…' : '')),
    (last.tags ?? []).length ? h('div.tags', { style: 'margin-top:10px' },
      last.tags.slice(0, 4).map(t => tagChip(t))) : null);
}

export default async function home(root) {
  const entries = await store.allEntries();
  const focuses = await store.getFocuses();

  const config = await sync.getConfig();
  const configured = sync.isConfigured(config);
  const lastSync = await sync.getLastSync();
  const pending = configured ? store.pendingSync(entries, lastSync) : 0;

  // Daily autosaver: if sync is set up and we haven't synced yet today, do it
  // in the background, then re-render so counts and the pending dot refresh.
  // Fully quiet — a failed sync (usually just offline) shouldn't interrupt.
  if (configured && (!lastSync || lastSync.slice(0, 10) < store.todayISO())) {
    runSync(null, { quiet: true }).then(ok => {
      if (ok) { clear(root); home(root); }
    });
  }

  root.append(...[
    brandRow(syncButton({ configured, pending, root })),
    heroCard(store.countClasses(entries), store.giRatio(entries)),
    focusPanel(focuses),
    gapPanel(store.findGaps(entries)),
    sectionHead('Last session', h('a', { href: '#/library' }, 'History ›')),
    lastSession(entries),
    h('div.btn-row', { style: 'margin-top:16px' },
      h('a.btn.primary.wide.cta', { href: '#/log' }, icon('plus'), 'Log a class')),
  ].filter(Boolean));
}
