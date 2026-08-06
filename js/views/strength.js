// The strength session — the third tab of the Off mat section.
//
// The engine that decides what to do lives in js/strength.js and is pure. This
// file is the form around it, and the form has exactly one job: **make logging
// a set cost one thumb-tap.** Every design choice below falls out of that.
//
//   - A set is a button showing its target. Tap it: done, at target, tempo
//     held — the normal case, one tap. Tap it again and it opens a stepper to
//     correct the number or drop the tempo flag, because sweaty hands mis-tap
//     and the fix must not be "type it in".
//   - Nothing is ever typed. There is no keyboard on this screen.
//   - The draft is written to storage on **every** tap. A lift runs over an
//     hour; the phone will lock, the app will be closed, and the router clears
//     the screen whenever you look at anything else. None of that may cost a
//     set.
//   - Last session's numbers sit next to today's target, small. With bodyweight
//     progression the numbers move so slowly that it rarely *feels* like they
//     are moving, and the only cure is showing them side by side.
//
// **On the rest timer, and the round timer removed in v18.** That one asked you
// to have a phone at the edge of the mat during training, and the lesson
// written up then was that "every comparable app has one" is not a reason.
// This one counts your rest between sets in your front room, on the same screen
// you are already tapping — the same side of the line as the stretch routines.
// It is screen-local on purpose: the set log is what must survive navigation,
// and it does, in storage. A rest countdown does not.

import { h, icon, offMatTabs, fmtDate, empty, toast, clear } from '../ui.js';
import { renderToken, isCurrent } from '../render.js';
import { createBeeper } from '../beeps.js';
import { createWakeLock } from '../wakelock.js';
import { createVoice } from '../voice.js';
import { pickCue } from '../stretches.js';
import * as store from '../store.js';
import {
  EXERCISES, EXERCISE_BY_ID, WARM_UP, DELOAD_EVERY,
  todaysPlan, isDeloadDue, prescriptionLine, lastLine, historyFor,
  newStrengthSession, sessionProgress, sessionChanges, programmeState,
  variationOf, restClock,
} from '../strength.js';

const pageHead = () => h('div.page-head',
  h('div',
    h('h1.page-title', 'Off mat'),
    h('p.page-sub', 'Stretch, mobility and strength')));

const weeksSince = (from, to) => Math.floor(
  (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 604800000);

/** "Last lifted Tue 4 Aug · 3 weeks ago" — the cold-open line. */
function sinceLine(last, today) {
  if (!last) return 'No sessions logged yet. This is session one.';
  const weeks = weeksSince(last.date, today);
  const ago = weeks <= 0 ? 'this week' : weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  return `Last lifted ${fmtDate(last.date)} · ${ago}`;
}

// ---------------------------------------------------------------------------
// The rest timer. Deadline-based, never a running total: a phone that throttles
// background timers or sleeps resumes showing the right number instead of
// drifting further behind the longer it runs. Same discipline as the stretch
// routines, for the same reason.
// ---------------------------------------------------------------------------

/** How many generic "rest is over" takes are recorded in audio/cues/. */
const REST_OVER_CUES = 5;

function createRestTimer(beep, wake, voice, token) {
  const count = h('span.sx-rest-n');
  const label = h('span.sx-rest-l');
  const bar = h('i');
  // Skip has to stop the timer *and* the beeps. Ending the rest early means
  // you are going again now, so the 3-2-1 and the "go" tone would land in the
  // middle of your next set.
  const skip = h('button.sx-rest-skip', { type: 'button', onclick: () => stop() }, 'Skip rest');
  const el = h('div.sx-rest', { hidden: true },
    h('div.sx-rest-head', label, count),
    h('div.sx-rest-rail', bar),
    skip);

  let deadline = 0, span = 0, timer = null, lastSecs = -1, cue = null;

  const stop = () => {
    clearInterval(timer);
    timer = null;
    el.hidden = true;
    wake.release();
  };

  const tick = () => {
    // The screen has been replaced. Stop — nothing here is worth surviving a
    // navigation, and a timer beeping at a screen that is gone is a bug.
    if (!isCurrent(token)) { stop(); return; }
    const left = deadline - Date.now();
    if (left <= 0) {
      beep.go();
      // The phone is face down for two minutes; the beep alone is easy to miss,
      // and it cannot tell you whether you are repeating the movement or
      // starting the next one. The voice can.
      if (cue) voice.say(cue);
      stop();
      return;
    }
    count.textContent = restClock(left);
    bar.style.width = `${Math.max(0, Math.min(100, (left / span) * 100))}%`;
    const secs = Math.ceil(left / 1000);
    if (secs !== lastSecs) {
      lastSecs = secs;
      if (secs <= 3) beep.tick();
    }
  };

  return {
    el,
    start(seconds, text, cueId = null) {
      // Called straight from the tap that logged a set, so this is inside a
      // user gesture — the only place an AudioContext will resume.
      voice.unlock();
      cue = cueId;
      // Decode it during the rest, not at the moment it is due to play.
      if (cueId) voice.preload(cueId);
      span = seconds * 1000;
      deadline = Date.now() + span;
      lastSecs = -1;
      label.textContent = text;
      el.hidden = false;
      beep.rest();
      wake.request();
      clearInterval(timer);
      timer = setInterval(tick, 200);
      tick();
    },
    stop,
  };
}

/**
 * The beeper and the voice for whichever strength screen is mounted.
 *
 * Module-scope and replaced on each mount, because a browser allows only a
 * handful of live AudioContexts and this screen is one you come back to. Up to
 * v40 each visit that started a session created a beeper and never closed it;
 * a few visits in, every tone would have gone silent with no error. Closing the
 * previous pair here bounds it at one.
 */
let audio = null;
function mountAudio() {
  audio?.beep.close();
  audio?.voice.close();
  audio = { beep: createBeeper(), voice: createVoice() };
  return audio;
}

// ---------------------------------------------------------------------------
// Before you start
// ---------------------------------------------------------------------------

function planRow(plan) {
  const last = lastLine(plan.last, plan.exercise);
  return h('li.sx-plan' + (plan.muted ? '.is-muted' : ''),
    h('div.sx-plan-top',
      h('span.sx-plan-name', plan.exercise.name),
      h('span.sx-plan-target', prescriptionLine(plan))),
    h('div.sx-plan-sub',
      h('span', plan.variation.name),
      last ? h('span.sx-plan-last', `Last: ${last}`) : null,
      plan.muted ? h('span.sx-muted-flag', 'Muted') : null),
    plan.needsLoad ? h('p.sx-load', icon('flame'),
      'Out of bodyweight road. Add a vest or a loaded rucksack, or move to the next variation.') : null);
}

function introScreen(mount, ctx) {
  const { sessions, today, plans, deloadDue, bjjToday, load, muted } = ctx;
  const last = sessions[sessions.length - 1] ?? null;

  // Amber, because this is the one thing on the screen waiting on a decision
  // from you. It is a rule about ordering, not a scolding: a lift before class
  // means turning up to class already tired.
  const bjjWarning = bjjToday
    ? h('div.banner.sx-warn',
        h('span.b-ico', icon('calendar')),
        h('span.b-txt', 'Jiu jitsu is already logged today. Lift after class, never before.'))
    : null;

  const deloadPanel = deloadDue
    ? h('section.card.sx-deload',
        h('div.card-title', 'Deload week'),
        h('p', `That's ${DELOAD_EVERY} sessions done. A deload runs the same movements at half the sets and the same reps, and moves nothing up or down. Take it or leave it.`),
        h('div.btn-row',
          h('button.btn.primary', { type: 'button', onclick: () => ctx.start(true) }, 'Take the deload'),
          h('button.btn', { type: 'button', onclick: () => ctx.dismissDeload() }, 'Skip it')))
    : null;

  mount.replaceChildren(...[
    offMatTabs('strength'),
    bjjWarning,
    deloadPanel,
    h('section.card.sx-intro',
      h('div.sx-intro-head',
        h('div',
          h('div.sx-intro-n', `${plans.filter(p => !p.muted).length} movements`),
          h('div.sx-intro-l', sinceLine(last, today))),
        h('a.sx-hist-link', { href: '#/strength?view=history' }, 'History ›')),
      h('p.sx-week',
        `This week: ${load.classes} ${load.classes === 1 ? 'class' : 'classes'} · ${load.lifts} ${load.lifts === 1 ? 'lift' : 'lifts'}`),
      h('p.sx-warmup', h('strong', 'Warm up first: '), WARM_UP.join(' · ')),
      h('button.btn.primary.wide.cta', { type: 'button', onclick: () => ctx.start(false) },
        sessions.length ? 'Start session' : 'Start your first session')),
    h('ol.sx-plans', plans.map(planRow)),
    muted.length
      ? h('p.sx-note', `${muted.length} ${muted.length === 1 ? 'movement is' : 'movements are'} muted. Unmute from inside a session.`)
      : null,
    h('p.sx-note', 'Bodyweight only, once a week. General guidance, not a coach — stop at anything sharp.'),
  ].filter(Boolean));
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * One set: tap to log it at target, tap again to open the corrections.
 *
 * The corrections panel is deliberately **not** anchored to the button. Five
 * 58px buttons wrap onto two lines on a phone, so a popover hanging below set
 * one lands squarely on top of set five — you would be tapping a stepper you
 * could see but had not aimed at. It lives under the whole row instead.
 */
function setButton(logged, index, ex, { onChange, onComplete, onEdit }) {
  const set = logged.sets[index];
  const suffix = ex.isHold ? 's' : '';
  const btn = h('button.sx-set', { type: 'button' });

  const paint = () => {
    btn.textContent = `${set.reps}${suffix}`;
    btn.classList.toggle('is-done', set.completed);
    btn.classList.toggle('is-soft', set.completed && !set.tempoHeld);
    btn.setAttribute('aria-pressed', String(set.completed));
    btn.setAttribute('aria-label',
      `Set ${index + 1}: ${set.reps}${suffix}${set.completed ? ', logged' : ', not logged yet'}`);
  };

  btn.addEventListener('click', () => {
    if (!set.completed) {
      set.completed = true;
      paint();
      onChange();
      onComplete();
      return;
    }
    // Already logged: open the corrections, don't silently toggle it off — an
    // accidental double-tap must never quietly unlog a set you did.
    onEdit(index);
  });

  paint();
  btn.repaint = paint;
  return btn;
}

/** The corrections panel for whichever set is being edited. One per card. */
function setEditor(logged, ex, { onChange, onClose, repaint }) {
  const panel = h('div.sx-edit', { hidden: true });
  const suffix = ex.isHold ? 's' : '';
  let index = null;

  const draw = () => {
    const set = logged.sets[index];
    const step = n => {
      set.reps = Math.max(0, set.reps + n);
      repaint(index); draw(); onChange();
    };
    panel.replaceChildren(
      h('div.sx-edit-head', `Set ${index + 1}`,
        h('button.sx-edit-x', { type: 'button', 'aria-label': 'Close', onclick: close }, 'Done')),
      h('div.sx-edit-row',
        h('button.sx-step', { type: 'button', 'aria-label': 'One fewer', onclick: () => step(ex.isHold ? -5 : -1) }, '−'),
        h('span.sx-edit-n', `${set.reps}${suffix}`),
        h('button.sx-step', { type: 'button', 'aria-label': 'One more', onclick: () => step(ex.isHold ? 5 : 1) }, '+')),
      h('div.sx-edit-row',
        h('button.sx-tempo' + (set.tempoHeld ? '.is-on' : ''), {
          type: 'button', 'aria-pressed': String(set.tempoHeld),
          onclick: () => { set.tempoHeld = !set.tempoHeld; repaint(index); draw(); onChange(); },
        }, set.tempoHeld ? 'Tempo held' : 'Tempo broke'),
        h('button.sx-undo', {
          type: 'button',
          onclick: () => { set.completed = false; repaint(index); close(); onChange(); },
        }, 'Not done')));
  };

  function close() { index = null; panel.hidden = true; onClose(); }

  return {
    el: panel,
    open(i) {
      if (index === i) { close(); return; }   // tapping the same set again shuts it
      index = i;
      panel.hidden = false;
      draw();
    },
    close,
  };
}

function exerciseCard(logged, ctx) {
  const ex = EXERCISE_BY_ID[logged.exerciseId];
  if (!ex) return null;

  const variation = ex.variations.find(v => v.id === logged.variationId) ?? ex.variations[0];
  const target = logged.target;
  const targetBits = [`${target.sets} × ${target.reps}${ex.isHold ? 's' : ''}`];
  if (ex.unilateral) targetBits[0] += ' each side';
  if (target.eccentricSec) targetBits.push(`${target.eccentricSec}s down`);
  if (target.pauseSec) targetBits.push(`${target.pauseSec}s pause`);
  const last = lastLine(ctx.lastFor(ex.id), ex);

  const setsRow = h('div.sx-sets');
  const card = h('section.card.sx-ex' + (logged.skipped ? '.is-muted' : ''),
    h('div.sx-ex-head',
      h('div',
        h('h3.sx-ex-name', ex.name),
        h('p.sx-ex-var', variation.name)),
      h('button.sx-mute', {
        type: 'button', 'aria-pressed': String(Boolean(logged.skipped)),
        title: logged.skipped ? 'Put this movement back in' : 'Mute this movement — something is sore',
        onclick: () => ctx.toggleSkip(logged),
      }, logged.skipped ? 'Unmute' : 'Mute')),
    h('div.sx-ex-target',
      h('span.sx-target', targetBits.join(' · ')),
      last ? h('span.sx-last', `Last: ${last}`) : null),
    // The cue is on screen without tapping into anything. Reading it is the
    // point; hiding it behind a disclosure would mean nobody ever does.
    h('p.sx-cue', ex.cue),
    ctx.stateFor(ex.id).needsLoad
      ? h('p.sx-load', icon('flame'), 'This one needs added weight now — a vest or a loaded rucksack.')
      : null,
    setsRow);

  if (!logged.skipped) {
    const buttons = [];
    const editor = setEditor(logged, ex, {
      onChange: ctx.save,
      onClose: () => {},
      repaint: i => buttons[i].repaint(),
    });
    buttons.push(...logged.sets.map((_, i) => setButton(logged, i, ex, {
      onChange: ctx.save,
      onEdit: j => editor.open(j),
      onComplete: () => {
        editor.close();
        const remaining = logged.sets.some(s => !s.completed);
        // Same movement again → a generic "rest is over". Moving on → the name
        // of the movement you are moving on to, which is the more useful thing
        // to hear when the phone is face down.
        const next = remaining ? null : ctx.nextExerciseId(logged.exerciseId);
        ctx.rest(ex.restSec,
          remaining ? `Rest · ${ex.name}` : `Rest · next up after ${ex.name}`,
          next ?? ctx.restOverCue());
      },
    })));
    setsRow.append(...buttons);
    card.append(editor.el);
  } else {
    setsRow.append(h('p.sx-skipped', 'Muted for this session — nothing here counts either way.'));
  }

  return card;
}

function sessionScreen(mount, ctx) {
  const draft = ctx.draft;
  const bar = h('i');
  const rail = h('div.sx-rail', bar);
  const countEl = h('span.sx-progress');
  const finishBtn = h('button.btn.primary.wide', { type: 'button' }, 'Finish session');
  let confirming = false;

  const paintProgress = () => {
    const p = sessionProgress(draft);
    bar.style.width = `${p.pct}%`;
    countEl.textContent = `${p.done} of ${p.total} sets`;
  };

  finishBtn.addEventListener('click', () => {
    const p = sessionProgress(draft);
    if (p.done < p.total && !confirming) {
      // Unfinished sets count as missed, and two missed sets is what starts the
      // path back down the ladder. Ending early by mis-tap must not do that
      // quietly, so it takes a second, deliberate tap.
      confirming = true;
      finishBtn.textContent = `${p.total - p.done} sets unlogged — finish anyway?`;
      finishBtn.classList.add('sx-confirm');
      return;
    }
    ctx.finish();
  });

  const cards = draft.exercises.map(logged => exerciseCard(logged, {
    ...ctx,
    save: () => { paintProgress(); ctx.save(); },
  })).filter(Boolean);

  mount.replaceChildren(
    offMatTabs('strength'),
    h('div.sx-top',
      h('span.sx-when', draft.deload ? 'Deload session' : fmtDate(draft.date)),
      countEl),
    rail,
    ctx.restTimer.el,
    ...cards,
    h('div.btn-row', { style: 'margin-top:16px' }, finishBtn),
    h('button.sx-abandon', {
      type: 'button',
      onclick: () => ctx.abandon(),
    }, 'Discard this session'));

  paintProgress();
}

// ---------------------------------------------------------------------------
// After
// ---------------------------------------------------------------------------

/**
 * `onBack` is a callback, not an `href`, and that is not a style preference.
 * This screen sits at `#/strength` — the hash it would link back to — so a link
 * fires no hashchange and the router never re-renders. The button would simply
 * do nothing, which is exactly the kind of dead end that is invisible until
 * somebody taps it.
 */
function doneScreen(mount, changes, onBack) {
  mount.replaceChildren(
    offMatTabs('strength'),
    h('section.card.sx-done',
      h('div.sx-done-ico', icon('flame')),
      h('h2', 'Session logged'),
      changes.length
        ? h('div',
            h('p.sx-done-sub', 'Next time:'),
            h('ul.sx-changes', changes.map(c =>
              h('li', h('strong', c.exercise.name), ` ${c.change}.`))))
        : h('p.sx-done-sub', 'Nothing moved this time — the prescription stands. That is the programme working, not stalling.'),
      h('p.sx-done-note', 'Nothing was written to your journal. This is the lift, not a class.'),
      h('div.btn-row',
        h('button.btn.primary', { type: 'button', onclick: onBack }, 'Back to the plan'),
        h('a.btn', { href: '#/' }, 'Home'))));
}

// ---------------------------------------------------------------------------
// History — proof that the numbers are moving
// ---------------------------------------------------------------------------

function historyScreen(mount, sessions) {
  const state = programmeState(sessions);

  if (!sessions.length) {
    mount.replaceChildren(
      offMatTabs('strength'),
      h('div.sx-top', h('a.sx-hist-link', { href: '#/strength' }, '‹ Back to the plan')),
      empty('Nothing logged yet. Finish a session and it shows up here.'));
    return;
  }

  mount.replaceChildren(
    offMatTabs('strength'),
    h('div.sx-top',
      h('a.sx-hist-link', { href: '#/strength' }, '‹ Back to the plan'),
      h('span.sx-progress', `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`)),
    ...EXERCISES.map(ex => {
      const rows = historyFor(sessions, ex.id);
      const s = state[ex.id];
      return h('section.card.sx-ex',
        h('div.sx-ex-head',
          h('div',
            h('h3.sx-ex-name', ex.name),
            h('p.sx-ex-var', `Now: ${variationOf(s, ex).name} · ${s.sets} × ${s.reps}${ex.isHold ? 's' : ''}`))),
        rows.length
          ? h('ul.sx-hist', rows.slice(0, 12).map(row =>
              h('li',
                h('span.sx-hist-d', fmtDate(row.session.date)),
                h('span.sx-hist-n', lastLine(row.logged, ex) ?? '—'),
                row.session.deload ? h('span.sx-hist-tag', 'deload') : null)))
          : h('p.sx-skipped', 'Not logged yet.'));
    }));
}

// ---------------------------------------------------------------------------

export default async function strength(root, { view } = {}) {
  const token = renderToken();
  const today = store.todayISO();

  const mount = h('div.sx');
  root.append(pageHead(), mount);

  const [entries, sessions, muted, draft] = await Promise.all([
    store.allEntries(), store.getStrengthSessions(), store.getMutedExercises(), store.getStrengthDraft(),
  ]);
  if (!isCurrent(token)) return;

  if (view === 'history') { historyScreen(mount, sessions); return; }

  const { beep, voice } = mountAudio();
  const wake = createWakeLock();
  const restTimer = createRestTimer(beep, wake, voice, token);

  let lastRestOver = 0;   // never the same "rest is over" take twice running
  const state = programmeState(sessions);
  const lastSession = sessions[sessions.length - 1] ?? null;

  const showIntro = async (deloadDismissed = false) => {
    restTimer.stop();
    introScreen(mount, {
      sessions, today, muted,
      plans: todaysPlan(sessions, { muted }),
      deloadDue: isDeloadDue(sessions) && !deloadDismissed,
      bjjToday: entries.some(e => e.type === 'class' && e.date === today),
      load: store.weekLoad(entries, sessions, today),
      dismissDeload: () => showIntro(true),
      start: async deload => {
        // The AudioContext has to be unlocked inside a tap or every beep on
        // this screen is silent. This is that tap.
        beep.unlock();
        voice.unlock();
        const fresh = newStrengthSession(today, sessions, { deload, muted });
        // Announce what you are opening with, here, on the tap.
        //
        // Not decoration: until v42 the *only* thing that ever spoke was the
        // end of a rest, so nothing at all happened for the first two minutes
        // of a session and there was no way to tell working audio from broken
        // audio. A cue on the Start tap is both useful and the fastest possible
        // answer to "is this thing on".
        const opener = fresh.exercises.find(e => !e.skipped);
        if (opener) voice.say(opener.exerciseId);
        await store.setStrengthDraft(fresh);
        showSession(fresh);
      },
    });
  };

  const showSession = current => {
    sessionScreen(mount, {
      draft: current,
      restTimer,
      stateFor: id => state[id],
      lastFor: id => lastSession?.exercises?.find(e => e.exerciseId === id) ?? null,
      save: () => { store.setStrengthDraft(current).catch(() => {}); },
      rest: (seconds, label, cue) => restTimer.start(seconds, label, cue),
      // The next movement with work still to do. Skipped ones are not coming.
      nextExerciseId: id => {
        const list = current.exercises;
        const at = list.findIndex(e => e.exerciseId === id);
        return list.slice(at + 1)
          .find(e => !e.skipped && e.sets.some(x => !x.completed))?.exerciseId ?? null;
      },
      restOverCue: () => {
        lastRestOver = pickCue(REST_OVER_CUES, lastRestOver);
        return `rest-over-${lastRestOver}`;
      },
      toggleSkip: async logged => {
        logged.skipped = !logged.skipped;
        await store.toggleMutedExercise(logged.exerciseId);
        await store.setStrengthDraft(current);
        showSession(current);
      },
      abandon: async () => {
        restTimer.stop();
        await store.clearStrengthDraft();
        toast('Session discarded');
        showIntro();
      },
      finish: async () => {
        restTimer.stop();
        beep.finish();
        const changes = sessionChanges(sessions, current);
        await store.saveStrengthSession(current);
        // Rebuilding the whole view is what refreshes the plan off the log that
        // was just written — `sessions` in this closure is now a version behind.
        doneScreen(mount, changes, () => { clear(root); strength(root, {}); });
      },
    });
  };

  if (draft && draft.date === today) showSession(draft);
  else if (draft) {
    // A draft from another day is a session that was started and never
    // finished. Filing it under today would be a lie about when it happened,
    // and progressing off it would be worse, so it is dropped.
    await store.clearStrengthDraft();
    showIntro();
  } else showIntro();
}
