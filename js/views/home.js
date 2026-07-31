// Dashboard — the front door.
//
// Everything here is derived from the user's own entries (the gym publishes no
// curriculum, so there is no external source to read). The panels split into
// two kinds, and the difference matters: **attendance** — the calendar, the
// streak, the counts — is a plain fact and reads honestly from week one, while
// **coverage** — the gap prompt — is a claim about what has been written and
// needs months before it says anything. Leading with the first kind is the
// answer to the cold-start problem in OPEN-QUESTIONS.md §2.

import {
  h, card, empty, fmtDate, giFlag, tagChip, icon, sectionHead, toast, clear,
  brandMark, monthCalendar,
} from '../ui.js';
import { positionLabel, ROLE_LABEL } from '../ontology.js';
import { recentMonths } from '../dates.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { renderToken, isCurrent } from '../render.js';

// The top-right button is a sync control (it used to open Settings — that's
// still reachable from the gear beside it). Not configured yet → it links to
// Settings to set sync up. Configured → tap to sync now; a dot shows when there
// are local changes not yet pushed. The app also syncs itself once a day (see
// home()), so the button is mostly a manual nudge and a status light.
function syncButton({ configured, pending, root }) {
  if (!configured) {
    return h('a.avatar-btn', { href: '#/settings', 'aria-label': 'Set up sync' }, icon('cloud'));
  }
  const btn = h('button.avatar-btn' + (pending ? '.pending' : ''),
    { 'aria-label': pending ? `Sync now (${pending} unsaved)` : 'Sync now', title: 'Sync now' },
    icon('cloud'));
  btn.addEventListener('click', async () => {
    const token = renderToken();
    const ok = await runSync(btn);
    // Only redraw if this is still the screen — see the note in app.js. A sync
    // started here and settling after a tap on Log used to wipe the log form.
    if (ok && isCurrent(token)) { clear(root); home(root); }
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
function brandRow(syncCtl, standing) {
  return h('div.brand-row', brandMark(standing),
    h('div.brand-actions',
      h('a.avatar-btn', { href: '#/timer', 'aria-label': 'Round timer', title: 'Round timer' },
        icon('timer')),
      h('a.avatar-btn.settings-btn', { href: '#/settings', 'aria-label': 'Settings', title: 'Settings' },
        icon('gear')),
      syncCtl));
}

function heroCard(counts, gi, streak) {
  const stat = (n, l, good) => h('div.hero-stat' + (good ? '.good' : ''),
    h('div.n', n), h('div.l', l));
  // A rail across the card's top edge, filled to the gi share — the same number
  // as the third tile, read at a glance.
  const rail = h('div.hero-rail', {
    role: 'img',
    'aria-label': gi ? `${gi.pct}% of recorded classes were gi` : 'No gi / no-gi recorded yet',
  }, h('i', { style: `width:${gi ? gi.pct : 0}%` }));

  // Weeks trained, not consecutive days — see store.weekStreak for why. It sits
  // beside the total because both are attendance, and attendance is a fact.
  const streakBadge = streak.current > 0
    ? h('span.streak', { title: `Longest run: ${streak.longest} weeks` },
        icon('flame'), `${streak.current} wk`)
    : null;

  return h('section.card.hero',
    rail,
    h('div.hero-top',
      h('div',
        h('div.hero-label', 'Total classes logged'),
        h('div.hero-num', String(counts.total))),
      streakBadge),
    h('hr.hero-divide'),
    h('div.hero-stats',
      stat(String(counts.week), 'This week'),
      stat(String(counts.month), 'Last 30 days'),
      stat(gi ? `${gi.pct}%` : '—', 'Gi / No-gi', true)));
}

/**
 * The training calendar — two months of days, filled where a class is logged.
 *
 * This is the panel that works on day one. Coverage needs months of writing
 * before an empty cell means anything; a calendar means something the moment
 * there are two marks on it.
 */
function calendarCard(entries, today) {
  const index = store.trainingIndex(entries);
  return card('Training calendar',
    h('div.cal-row', recentMonths(2, today).map(ym =>
      monthCalendar(ym, index, { today, onPick: day => `#/log/${day.ids[0]}` }))),
    h('div.cal-legend',
      h('span', h('i.k-gi'), 'Gi'),
      h('span', h('i.k-nogi'), 'No-gi'),
      h('span', h('i.k-both'), 'Both'),
      h('span', h('i.k-off'), 'Nothing logged')));
}

/**
 * "You usually train Thursdays — nothing logged for last Thursday."
 *
 * The honest version of a reminder. Chrome's web push goes through Google's
 * push service and this phone is de-Googled, so a real scheduled notification
 * is not a promise this app can keep (docs/ENHANCEMENTS.md §7). This fires when
 * you open the app instead — a smaller promise it can actually keep.
 * Dismissible, and it stays dismissed for the rest of the day.
 */
function nudgePanel(nudge, dismissedOn, today) {
  if (!nudge || dismissedOn === today) return null;

  const banner = h('div.banner.nudge',
    h('span.b-ico', icon('calendar')),
    h('span.b-txt', `Nothing logged for ${fmtDate(nudge.date)} — you usually train that day.`),
    h('a.b-edit', { href: `#/log?date=${nudge.date}` }, 'Log it'),
    h('button.b-close', {
      type: 'button', 'aria-label': 'Dismiss',
      onclick: async () => {
        await store.setSetting('nudgeDismissedOn', today);
        banner.remove();
      },
    }, '×'));
  return banner;
}

// The focus list is a flashcard deck of its own — the front door shows what is
// due and links across. Editing and flipping live on the Working-on page,
// keeping the dashboard calm.
function focusPanel(focuses, due) {
  const fronts = focuses.map(f => f.front);
  const text = !fronts.length ? 'Nothing yet — add flashcards'
    : due.length ? `${due.length} ${due.length === 1 ? 'card' : 'cards'} due: ${due[0].front}`
    : `Working on: ${fronts.join(' · ')}`;

  return h('a.banner' + (due.length ? '.is-due' : ''), { href: '#/focus' },
    h('span.b-ico', icon(due.length ? 'cards' : 'pin')),
    h('span.b-txt' + (fronts.length ? '' : '.muted'), text),
    h('span.b-edit', !fronts.length ? 'Add' : due.length ? 'Review' : 'Drill'));
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

/** Rank and classes since — both facts the user supplied, nothing inferred. */
function beltPanel(standing) {
  if (!standing) return null;
  const n = standing.classesSince;
  return h('a.banner.belt-banner', { href: '#/settings' },
    h('span.b-ico', h('i.belt-dot.belt-' + standing.rank)),
    h('span.b-txt',
      h('strong', standing.rank[0].toUpperCase() + standing.rank.slice(1) + ' belt'),
      ` · ${n} ${n === 1 ? 'class' : 'classes'} since ${fmtDate(standing.date)}`));
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

  const marks = [
    giFlag(last.gi),
    last.session ? h('span.gi-flag.s-type', store.SESSION_LABEL[last.session]) : null,
    Number.isFinite(last.rounds) && last.rounds > 0
      ? h('span.gi-flag.s-rounds', `${last.rounds} rounds`) : null,
  ].filter(Boolean);

  return h('a.card.session', { href: `#/log/${last.id}` },
    h('div.s-head',
      h('span.s-when', icon('calendar'), fmtDate(last.date)),
      ...marks,
      h('span.s-edit', icon('edit'), 'Edit')),
    h('div.s-title', title.slice(0, 80) + (title.length > 80 ? '…' : '')),
    rest && h('div.s-body', rest.slice(0, 130) + (rest.length > 130 ? '…' : '')),
    (last.tags ?? []).length ? h('div.tags', { style: 'margin-top:10px' },
      last.tags.slice(0, 4).map(t => tagChip(t))) : null);
}

export default async function home(root) {
  const token = renderToken();
  const today = store.todayISO();

  const entries = await store.allEntries();
  const focuses = await store.getFocuses();
  const due = store.dueFocuses(focuses, today);
  const promotions = await store.getPromotions();
  const dismissedOn = await store.getSetting('nudgeDismissedOn', '');

  const config = await sync.getConfig();
  const configured = sync.isConfigured(config);
  const lastSync = await sync.getLastSync();
  const pending = configured ? store.pendingSync(entries, lastSync) : 0;

  // Daily autosaver: if sync is set up and we haven't synced yet today, do it
  // in the background, then re-render so counts and the pending dot refresh.
  // Fully quiet — a failed sync (usually just offline) shouldn't interrupt.
  // The token check is what stops a slow sync from wiping a screen the user has
  // navigated to in the meantime.
  if (configured && (!lastSync || lastSync.slice(0, 10) < today)) {
    runSync(null, { quiet: true }).then(ok => {
      if (ok && isCurrent(token)) { clear(root); home(root); }
    });
  }

  const standing = store.beltStanding(entries, promotions);

  root.append(...[
    brandRow(syncButton({ configured, pending, root }), standing),
    heroCard(store.countClasses(entries), store.giRatio(entries), store.weekStreak(entries, today)),
    nudgePanel(store.logNudge(entries, today), dismissedOn, today),
    beltPanel(standing),
    focusPanel(focuses, due),
    calendarCard(entries, today),
    gapPanel(store.findGaps(entries)),
    sectionHead('Last session', h('a', { href: '#/library' }, 'History ›')),
    lastSession(entries),
    h('div.btn-row', { style: 'margin-top:16px' },
      h('a.btn.primary.wide.cta', { href: '#/log' }, icon('plus'), 'Log a class')),
    h('div.btn-row',
      h('a.btn.wide', { href: '#/timer' }, icon('timer'), 'Round timer')),
  ].filter(Boolean));
}
