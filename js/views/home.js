// Dashboard — the front door.
//
// Everything here is derived from the user's own entries (the gym publishes no
// curriculum, so there is no external source to read). The panels split into
// two kinds, and the difference matters: **attendance** — the counts, the
// streak, the calendar — is a plain fact and reads honestly from week one,
// while **coverage** — the gap prompt — is a claim about what has been written
// and needs months before it says anything. Leading with the first kind is the
// answer to the cold-start problem in OPEN-QUESTIONS.md §2.
//
// The dashboard stays calm by keeping only what you look at *every* time on
// screen. The calendar is worth having and is not worth a permanent panel, so
// it lives on the back of the hero — tap the total to turn the card over.

import {
  h, card, empty, fmtDate, giFlag, tagChip, icon, sectionHead, toast, clear,
  brandMark, monthCalendar,
} from '../ui.js';
import { positionLabel, ROLE_LABEL } from '../ontology.js';
import { monthOf, monthLabel, shiftMonth } from '../dates.js';
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
      h('a.avatar-btn.settings-btn', { href: '#/settings', 'aria-label': 'Settings', title: 'Settings' },
        icon('gear')),
      syncCtl));
}

/**
 * The stats strip, which flips over to reveal the training calendar.
 *
 * This used to be a tall hero with the total set in 3rem type. It was the
 * biggest thing on the front door and it is not the most important thing —
 * a running total is a number you glance at, not one you act on. It is a strip
 * now: total, this week, 30 days and gi share on one line, with the streak.
 *
 * Tap the total and the strip turns over into a month calendar, same 3D flip
 * as the deck. The container grows as it turns, because the calendar needs the
 * height and the strip does not — both faces are absolutely positioned, so the
 * height animates alongside the rotation rather than jumping at the end.
 */
function statsCard(counts, gi, streak, entries, today) {
  const cell = (cls, n, l) => h('div.sbit.' + cls,
    h('div.sbit-n', n), h('div.sbit-l', l));

  // The total is the door to the calendar, so it gets the affordance.
  const flipBtn = h('button.sbit.sbit-total', {
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': `${counts.total} classes logged. Show the training calendar.`,
  },
    h('div.sbit-n', String(counts.total), h('span.sbit-cue', icon('calendar'))),
    h('div.sbit-l', 'Total'));

  const streakBadge = streak.current > 0
    ? h('span.streak', { title: `Longest run: ${streak.longest} weeks` },
        icon('flame'), `${streak.current} wk`)
    : null;

  const front = h('section.card.stats.flip-face',
    h('div.stats-row',
      flipBtn,
      cell('sbit-week', String(counts.week), 'Week'),
      cell('sbit-month', String(counts.month), '30 days'),
      cell('sbit-gi good', gi ? `${gi.pct}%` : '—', 'Gi'),
      streakBadge));

  const inner = h('div.flip-inner');
  const wrap = h('div.flipcard', inner);
  const back = calendarFace(entries, today, () => setFlipped(false));

  const setFlipped = on => {
    wrap.classList.toggle('is-flipped', on);
    flipBtn.setAttribute('aria-expanded', String(on));
    // Keep the hidden side out of the tab order. backface-visibility hides it
    // from the eye but not from the keyboard or a screen reader.
    front.inert = on;
    back.inert = !on;
  };

  flipBtn.addEventListener('click', () => setFlipped(!wrap.classList.contains('is-flipped')));

  inner.append(front, back);
  setFlipped(false);
  return wrap;
}

/**
 * The back of the hero: one month of training days, with swipe and arrows.
 *
 * Range is clamped to the months you actually have — from your first logged
 * class to this month — so you can't page endlessly into empty years.
 *
 * It opens on the month of your **most recent class**, not necessarily this
 * one. Flip the card on the 1st of the month and "this month" is a blank grid
 * while everything you just trained sits in the month before; opening on your
 * last session shows training whenever you look, and is the same thing as this
 * month whenever you have trained in it.
 */
function calendarFace(entries, today, onClose) {
  const index = store.trainingIndex(entries);
  const thisMonth = monthOf(today);
  const dates = entries.filter(e => e.type === 'class').map(e => e.date).sort();
  const firstMonth = dates.length ? monthOf(dates[0]) : thisMonth;

  let ym = dates.length ? monthOf(dates[dates.length - 1]) : thisMonth;
  const grid = h('div.cal-slot');
  const title = h('span.hcal-month');
  const prev = h('button.hcal-arrow', { type: 'button', 'aria-label': 'Previous month' }, '‹');
  const next = h('button.hcal-arrow', { type: 'button', 'aria-label': 'Next month' }, '›');

  const paint = () => {
    title.textContent = monthLabel(ym);
    prev.disabled = ym <= firstMonth;
    next.disabled = ym >= thisMonth;
    grid.replaceChildren(
      monthCalendar(ym, index, { today, onPick: day => `#/log/${day.ids[0]}`, showMonth: false }));
  };

  const step = n => {
    const target = shiftMonth(ym, n);
    if (target < firstMonth || target > thisMonth) return;
    ym = target;
    paint();
  };

  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  const face = h('section.card.hero-cal.flip-face.flip-back',
    h('div.hcal-head', prev, title, next),
    grid,
    h('div.hcal-foot',
      h('span.hcal-key', h('i.k-gi'), 'Gi'),
      h('span.hcal-key', h('i.k-nogi'), 'No-gi'),
      h('button.hcal-close', { type: 'button', 'aria-label': 'Back to your totals' }, 'Done')));

  face.querySelector('.hcal-close').addEventListener('click', onClose);

  // Swipe. Left pages forward, right pages back — the card behaves like a stack
  // of months. A gesture is only a swipe if it is mostly horizontal, or every
  // attempt to scroll the page past the card would change the month.
  let x0 = null, y0 = null;
  face.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY;
  }, { passive: true });
  face.addEventListener('touchend', e => {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  }, { passive: true });

  paint();
  return face;
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

/**
 * "Working on", as big swipeable tiles — the main event on the front door.
 *
 * This was a one-line banner, which is the wrong size for the thing you are
 * actually trying to change about your game. It is now a row of cards you flick
 * through sideways; tap one to open the deck at that card and read your cues.
 *
 * The swipe is native: a scroll-snapping overflow row. No touch handlers, no
 * momentum maths, and it works with a trackpad, a scrollbar and a keyboard for
 * free — all of which hand-rolled gesture code gets wrong.
 */
function workingOn(focuses) {
  const head = h('div.section-head',
    h('h3', 'Working on'),
    h('a', { href: '#/focus' }, focuses.length ? 'Edit deck ›' : 'Add ›'));

  if (!focuses.length) {
    return h('div', head,
      h('a.wo-empty', { href: '#/focus' },
        h('span.b-ico', icon('cards')),
        h('span', 'Nothing yet — add the first thing you want to drill')));
  }

  const rail = h('div.wo-rail', focuses.map((f, i) =>
    h('a.wo-tile', { href: `#/focus?card=${i}`, 'aria-label': `${f.front}. Open for cues.` },
      h('span.wo-num', `${i + 1} / ${focuses.length}`),
      h('span.wo-front', f.front),
      h('span.wo-more', f.back ? 'Tap for your cues' : 'Tap to add cues'))));

  // Dots, so a deck wider than the screen looks like one. Updated from the
  // rail's own scroll position rather than a gesture, so it stays honest
  // however you moved it.
  const dots = focuses.length > 1
    ? h('div.wo-dots', focuses.map((_, i) => h('i' + (i === 0 ? '.is-on' : ''))))
    : null;

  if (dots) {
    rail.addEventListener('scroll', () => {
      const tile = rail.firstElementChild;
      if (!tile) return;
      const step = tile.getBoundingClientRect().width + 12;   // tile + gap
      const at = Math.round(rail.scrollLeft / step);
      [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i === at));
    }, { passive: true });
  }

  return h('div', head, rail, dots);
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
    // Working on comes first and comes big: it is the thing you are trying to
    // change, and the one panel worth looking at every single time.
    workingOn(focuses),
    statsCard(store.countClasses(entries), store.giRatio(entries),
      store.weekStreak(entries, today), entries, today),
    nudgePanel(store.logNudge(entries, today), dismissedOn, today),
    beltPanel(standing),
    gapPanel(store.findGaps(entries)),
    sectionHead('Last session', h('a', { href: '#/library' }, 'History ›')),
    lastSession(entries),
    h('div.btn-row', { style: 'margin-top:16px' },
      h('a.btn.primary.wide.cta', { href: '#/log' }, icon('plus'), 'Log a class')),
  ].filter(Boolean));
}
