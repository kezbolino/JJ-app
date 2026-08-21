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
import { pickVoice, VOICE_IDS } from '../voices.js';
import { pickFinish, stretchFigure } from '../stretches.js';
import { getVoicePref } from '../appearance.js';
import { pickCue } from '../stretches.js';
import * as store from '../store.js';
import {
  EXERCISES, EXERCISE_BY_ID, WARM_UP, DELOAD_EVERY,
  todaysPlan, isDeloadDue, prescriptionLine, lastLine, historyFor,
  newStrengthSession, sessionProgress, sessionChanges, programmeState,
  variationOf, restClock, sessionBlocks, restBetween, partnerOf,
  sessionDuration, durationLine, PAIRED_REST,
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

/** How long the finish chime rings for, so the spoken line lands after it. */
const CHIME_MS = 900;

function createRestTimer(beep, wake, voice, token) {
  const count = h('span.sx-rest-n');
  const label = h('span.sx-rest-l');
  const bar = h('i');
  // Skip has to stop the timer *and* the beeps. Ending the rest early means
  // you are going again now, so the 3-2-1 and the "go" tone would land in the
  // middle of your next set.
  const skip = h('button.sx-rest-skip', { type: 'button', onclick: () => stop() }, 'Skip rest');
  // The undo for the set that just started this rest.
  //
  // A mis-tapped set was reported as impossible to undo. It never was: the
  // corrections panel opens on a second tap and has always had a "Not done".
  // The problem is that **nothing on screen says so** — a logged set looks
  // final, and there is no reason to guess that tapping it again does anything
  // other than log it twice. So the fix is two cues, not a new mechanism: a line
  // under the sets row saying what a second tap does, and this button, in the
  // bar that is already sticky to the top of the screen and already appears the
  // instant a set goes in. That is where the eye is immediately after the tap
  // that needs undoing, so it is where the undo belongs.
  const undo = h('button.sx-rest-undo', { type: 'button' }, 'Undo that set');
  const el = h('div.sx-rest', { hidden: true },
    h('div.sx-rest-head', label, count),
    h('div.sx-rest-rail', bar),
    h('div.sx-rest-actions', undo, skip));

  let deadline = 0, span = 0, timer = null, lastSecs = -1, cue = null, onUndo = null;

  undo.addEventListener('click', () => {
    const fn = onUndo;
    stop();
    fn?.();
  });

  const stop = () => {
    clearInterval(timer);
    timer = null;
    el.hidden = true;
    onUndo = null;
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
    start(seconds, text, cueId = null, undoFn = null) {
      // Called straight from the tap that logged a set, so this is inside a
      // user gesture — the only place an AudioContext will resume.
      voice.unlock();
      cue = cueId;
      onUndo = undoFn;
      undo.hidden = !undoFn;
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

// ---------------------------------------------------------------------------
// The hold timer.
//
// A hold is the one thing on this screen you cannot pace yourself: "hang for
// 20–30 seconds" and "hollow body for 45" both need something outside your head
// to count, and on the hollow body you are flat on your back looking at the
// ceiling, so it has to be *audible* rather than visible. That is why there is a
// spoken 3-2-1 lead-in and a tone at each end, and why the bar is sticky — the
// screen is a courtesy here, the sound is the feature.
//
// Deadline-based, like everything else that counts time in this app. Two phases
// in one clock: a short lead-in to get set, then the hold itself.
//
// Clocked off `performance.now()`, not `Date.now()` like the rest timer above.
// It is monotonic, so a hold cannot be lengthened or cut short by the system
// clock moving under it, and it is what the stretch routines already use for
// exactly this job. It is also what `fastPage()` in the test suite overrides,
// which is the only way to test a 45-second hold without waiting 45 seconds.
// ---------------------------------------------------------------------------

/** Seconds of "get into position" before a hold starts. */
const HOLD_LEAD_SEC = 3;
/**
 * Stop under this many seconds into a hold and nothing is logged.
 *
 * Nobody holds a hollow body for four seconds on purpose, so a stop that early
 * is a cancel — you started the wrong one, or you were not ready. Logging it as
 * a completed four-second set would be worse than logging nothing: a set that
 * short counts as missed, and two missed sets is what walks the prescription
 * back down the ladder. Bailing at 30 of 45 is a real result and is kept.
 */
const HOLD_MIN_SEC = 5;

function createHoldTimer(beep, voice, wake, token) {
  const count = h('span.sx-hold-n');
  const label = h('span.sx-hold-l');
  const bar = h('i');
  const stopBtn = h('button.sx-hold-stop', { type: 'button' }, 'Stop');
  const el = h('div.sx-hold', { hidden: true },
    h('div.sx-hold-head', label, count),
    h('div.sx-hold-rail', bar),
    stopBtn);

  let phase = null, deadline = 0, holdSec = 0, timer = null, lastSecs = -1, finish = null;
  let name = '';

  const clear_ = () => {
    clearInterval(timer);
    timer = null;
    phase = null;
    el.hidden = true;
    wake.release();
  };

  /** End the hold and report how many seconds were actually held. */
  const settle = held => {
    const fn = finish;
    finish = null;
    clear_();
    fn?.(Math.max(0, Math.round(held)));
  };

  stopBtn.addEventListener('click', () => {
    // Stopping during the lead-in is a cancel, not a zero-second hold — you
    // changed your mind before starting, and logging 0s would feed a missed set
    // into the ladder for something you never attempted.
    if (phase === 'lead') { finish = null; clear_(); return; }
    const held = holdSec - Math.max(0, (deadline - performance.now()) / 1000);
    if (held < HOLD_MIN_SEC) { finish = null; clear_(); toast('Hold cancelled — nothing logged'); return; }
    settle(held);
  });

  const tick = () => {
    if (!isCurrent(token)) { finish = null; clear_(); return; }
    const left = deadline - performance.now();

    if (phase === 'lead') {
      if (left <= 0) {
        phase = 'hold';
        deadline = performance.now() + holdSec * 1000;
        lastSecs = -1;
        label.textContent = name;
        beep.go();
        tick();
        return;
      }
      count.textContent = String(Math.ceil(left / 1000));
      bar.style.width = '100%';
      const secs = Math.ceil(left / 1000);
      // The spoken countdown replaces the ticks rather than playing over them,
      // exactly as it does on the stretch routines — and muted falls back to
      // ticks, so the last three seconds are never silent.
      if (secs !== lastSecs) { lastSecs = secs; if (beep.isMuted()) beep.tick(); }
      return;
    }

    if (left <= 0) { beep.finish(); settle(holdSec); return; }
    count.textContent = restClock(left);
    bar.style.width = `${Math.max(0, Math.min(100, (left / (holdSec * 1000)) * 100))}%`;
    const secs = Math.ceil(left / 1000);
    if (secs !== lastSecs) { lastSecs = secs; if (secs <= 3) beep.tick(); }
  };

  return {
    el,
    /** Count into a hold of `seconds`, then time it. Always from a tap. */
    start({ seconds, name: movement, onFinish }) {
      beep.unlock();
      voice.unlock();
      name = movement;
      holdSec = seconds;
      finish = onFinish;
      phase = 'lead';
      deadline = performance.now() + HOLD_LEAD_SEC * 1000;
      lastSecs = -1;
      label.textContent = `Get set · ${movement}`;
      el.hidden = false;
      if (!beep.isMuted()) voice.say('countdown');
      wake.request();
      clearInterval(timer);
      timer = setInterval(tick, 200);
      tick();
    },
    stop() { finish = null; clear_(); },
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

/**
 * The voice for the day's lift, held across screen mounts.
 *
 * A lift is one session even though the screen is not: you leave it and come
 * back between movements, and `mountAudio` runs each time. Rolling there would
 * change who is talking to you halfway through. Keyed by the date, so
 * tomorrow's lift rolls again — and a named voice needs no key at all, since
 * `pickVoice` returns it whatever is remembered here.
 */
let voicePick = { day: null, voice: null };
function sessionVoice(day) {
  const pref = getVoicePref();
  // A named voice needs no memory: it is already the answer, and reading it
  // fresh is what makes a change in Settings land on the very next mount.
  if (VOICE_IDS.includes(pref)) return pref;
  if (voicePick.day !== day) voicePick = { day, voice: pickVoice(pref) };
  return voicePick.voice;
}

function mountAudio(day) {
  audio?.beep.close();
  audio?.voice.close();
  audio = { beep: createBeeper(), voice: createVoice(sessionVoice(day)) };
  return audio;
}

// ---------------------------------------------------------------------------
// Before you start
// ---------------------------------------------------------------------------

function planRow(plan, pairPos = null) {
  const last = lastLine(plan.last, plan.exercise);
  const pairClass = pairPos ? `.is-pair.is-pair-${pairPos}` : '';
  return h('li.sx-plan' + pairClass + (plan.muted ? '.is-muted' : ''),
    pairPos === 'top'
      ? h('span.sx-pair-tag', h('b', 'SUPERSET'), h('span', ` · ${PAIRED_REST}s between`))
      : null,
    h('div.sx-plan-top',
      h('span.sx-plan-name', plan.exercise.name),
      h('span.sx-plan-target', prescriptionLine(plan))),
    h('div.sx-plan-sub',
      h('span', plan.variation.name),
      last ? h('span.sx-plan-last', `Last: ${last}`) : null,
      plan.muted ? h('span.sx-muted-flag', 'Muted') : null),
    plan.needsLoad ? h('p.sx-load', icon('flame'),
      'Out of bodyweight road. Add weight — a kettlebell held between the feet, a loaded rucksack — or move to the next variation.') : null);
}

function introScreen(mount, ctx) {
  const { sessions, today, plans, deloadDue, bjjToday, load, muted } = ctx;
  const last = sessions[sessions.length - 1] ?? null;
  const duration = sessionDuration(plans);

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
      // How long this is going to take, up front, the way the stretch routines
      // have always shown their total. Derived from the plan on screen — mute a
      // movement and this number moves with it — so it can never drift the way
      // the hand-written "60–75 minutes" in docs/STRENGTH.md did.
      h('p.sx-duration',
        h('span.sx-duration-n', durationLine(duration)),
        h('span.sx-duration-b',
          `${duration.sets} sets · ${Math.round(duration.restSec / 60)} min of it resting`)),
      h('p.sx-week',
        `This week: ${load.classes} ${load.classes === 1 ? 'class' : 'classes'} · ${load.lifts} ${load.lifts === 1 ? 'lift' : 'lifts'}`),
      h('p.sx-warmup', h('strong', 'Warm up first: '), WARM_UP.map(w => w.name).join(' · ')),
      h('button.btn.primary.wide.cta', { type: 'button', onclick: () => ctx.start(false) },
        sessions.length ? 'Start session' : 'Start your first session')),
    h('ol.sx-plans', sessionBlocks(plans).flatMap(block => block.kind === 'pair'
      ? [planRow(block.items[0], 'top'), planRow(block.items[1], 'bottom')]
      : [planRow(block.items[0])])),
    muted.length
      ? h('p.sx-note', `${muted.length} ${muted.length === 1 ? 'movement is' : 'movements are'} muted. Unmute from inside a session.`)
      : null,
    // Not "bodyweight only" any more — that line outlived the kettlebells added
    // in v44 and the RDL that replaced the Nordic curl in v49.
    h('p.sx-note', 'Bodyweight and kettlebells, once a week. General guidance, not a coach — stop at anything sharp.'),
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

function exerciseCard(logged, ctx, { inPair = false } = {}) {
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
  // Inside a superset the pair wrapper is the card, so the two movements in it
  // are plain blocks. The `.sx-ex` class stays on both either way: it is what
  // the tests index by, and more to the point it is what "a movement" means on
  // this screen regardless of who it is standing next to.
  const shell = (inPair ? 'section.sx-ex.is-paired' : 'section.card.sx-ex')
    + (logged.skipped ? '.is-muted' : '');

  // Tapping the name says it out loud.
  //
  // The name used to land on the first *set* tap, which is a beat too late —
  // you log a set after you have done it, so the app was announcing pull-ups
  // once the pull-ups were over. This is the "I am starting this now" tap, and
  // it forces the cue even if the movement has already been announced, because
  // an explicit ask should always be answered.
  const sayBtn = h('button.sx-say', {
    type: 'button',
    title: `Say "${ex.name}"`,
    'aria-label': `Say ${ex.name} out loud`,
    onclick: () => ctx.announce(ex.id, { force: true }),
  }, icon('sound'));

  // A figure beside the name. Small — 44px, the size the routine list uses —
  // because this screen is numbers and buttons and the drawing is there to say
  // *which* movement you are on at a glance, not to teach it. `stretchFigure`
  // returns null for an id with no artwork, and the head simply has one fewer
  // child then: the same contract the routines have had since PENDING_ART.
  const fig = stretchFigure(ex, ex.name);

  const card = h(shell,
    h('div.sx-ex-head',
      ...(fig ? [h('div.sx-ex-fig', fig)] : []),
      h('div.sx-ex-titles',
        h('h3.sx-ex-name', ex.name, sayBtn),
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
      ? h('p.sx-load', icon('flame'), 'This one needs added weight now — a kettlebell between the feet, or a loaded rucksack.')
      : null,
    setsRow);

  if (!logged.skipped) {
    const buttons = [];

    /** The corrections hint only earns its space once there is something to
     *  correct, so the card carries a flag rather than the sentence always. */
    const paintLogged = () =>
      card.classList.toggle('has-logged', logged.sets.some(s => s.completed));

    const editor = setEditor(logged, ex, {
      onChange: ctx.save,
      onClose: () => {},
      // The editor's "Not done" un-completes a set, which can empty the card —
      // so the hint has to be re-evaluated from here too, not just on the way in.
      repaint: i => { buttons[i].repaint(); paintLogged(); },
    });

    const undoSet = i => {
      logged.sets[i].completed = false;
      buttons[i].repaint();
      paintLogged();
      ctx.save();
    };

    /**
     * What happens after a set goes in, whether it was tapped or timed.
     *
     * The rest length is asked for rather than assumed — see `restBetween` — so
     * grinding a movement out instead of alternating gives you the full two
     * minutes rather than the superset's sixty seconds.
     */
    const afterSet = i => {
      editor.close();
      paintLogged();
      ctx.announce(ex.id);
      const all = ctx.allLogged();
      const seconds = restBetween(ex.id, all);
      const mateId = partnerOf(ex.id);
      const mate = mateId ? all.find(l => l.exerciseId === mateId) : null;
      const mateNext = mate && !mate.skipped && mate.sets.some(s => !s.completed);
      const mineLeft = logged.sets.some(s => !s.completed);

      let label, cue;
      if (mateNext) {
        // The alternation is the whole point of the pairing, so the rest names
        // the *other* movement — this is the moment you would otherwise forget
        // and start another set of the one you just did.
        label = `Rest · then ${EXERCISE_BY_ID[mateId].name}`;
        cue = ctx.cueFor(mateId);
      } else if (mineLeft) {
        label = `Rest · ${ex.name}`;
        cue = ctx.restOverCue();
      } else {
        const next = ctx.nextExerciseId(ex.id);
        label = next ? `Rest · next up after ${ex.name}` : `Rest · that was the last set`;
        cue = next ? ctx.cueFor(next) : ctx.restOverCue();
      }
      ctx.rest(seconds, label, cue, () => undoSet(i));
    };

    buttons.push(...logged.sets.map((_, i) => setButton(logged, i, ex, {
      onChange: ctx.save,
      onEdit: j => editor.open(j),
      onComplete: () => afterSet(i),
    })));
    setsRow.append(...buttons);

    if (ex.isHold) {
      // A hold is the one thing here you cannot count for yourself while doing
      // it. Timing it also logs it, at whatever was actually held — stop at 32
      // seconds of a 45-second target and 32 is what goes in the log, which is
      // both more honest and less typing than correcting it afterwards.
      setsRow.append(h('button.sx-time', {
        type: 'button',
        onclick: () => {
          const i = logged.sets.findIndex(s => !s.completed);
          if (i < 0) { toast('Every set of this one is already logged'); return; }
          ctx.hold({
            seconds: logged.sets[i].reps,
            name: ex.name,
            onFinish: held => {
              logged.sets[i].reps = held;
              logged.sets[i].completed = true;
              buttons[i].repaint();
              ctx.save();
              afterSet(i);
            },
          });
        },
      }, icon('sound'), 'Time it'));
    }

    card.append(editor.el);
    // Says out loud what the second tap does. The corrections have worked since
    // v35 and nothing advertised them, so a mis-tap read as permanent.
    card.append(h('p.sx-sets-hint', 'Tap a logged set again to change the number or undo it.'));
    // A session resumed from a draft can already have sets in it.
    paintLogged();
  } else {
    setsRow.append(h('p.sx-skipped', 'Muted for this session — nothing here counts either way.'));
  }

  return card;
}

/**
 * Two movements you alternate between.
 *
 * The pairing is advisory, not enforced: both movements' sets are on screen at
 * once and you can tap them in any order you like. That is deliberate. The
 * engine already handles being ignored — rest back to the full two minutes if
 * the partner has nothing waiting — so enforcing an order would only add a way
 * to be wrong about which set you just did.
 */
function pairCard(items, ctx) {
  const cards = items.map(logged => exerciseCard(logged, ctx, { inPair: true })).filter(Boolean);
  if (!cards.length) return null;
  const names = items.map(l => EXERCISE_BY_ID[l.exerciseId]?.name).filter(Boolean);
  return h('section.card.sx-pair',
    h('div.sx-pair-head',
      h('span.sx-pair-label', 'Superset'),
      h('span.sx-pair-sub', `Alternate · ${PAIRED_REST}s between`)),
    h('p.sx-pair-note',
      `One set of ${names[0]}, rest, one set of ${names[1]}, rest, repeat. Each movement still gets its full recovery — the other one just happens during it.`),
    ...cards);
}

/**
 * The warm-up: five rows you tap off. No reps logged, nothing that reaches the
 * progression engine — it is a checklist, and the only thing it owes you is a
 * memory that you have done it.
 *
 * It speaks, as of v49. It was the one part of the session with no voice at
 * all, which made it feel like the bit before the app starts paying attention.
 * Ticking a row announces the next one, so you can work through the whole thing
 * without looking at the screen — and four of the five clips were already in
 * `audio/cues/<voice>/` from the rest-day routine, so this cost no recording.
 */
function warmupCard(draft, ctx) {
  const rows = draft.warmup ?? [];
  if (!rows.length) return null;

  const card = h('section.card.sx-warmup-card');
  const count = h('span.sx-wu-count');

  const paint = () => {
    const done = rows.filter(r => r.done).length;
    count.textContent = `${done} of ${rows.length}`;
    card.classList.toggle('is-done', done === rows.length);
  };

  /** Announce whichever row is next, so the list reads itself out as you go. */
  const sayNext = () => {
    const next = rows.find(r => !r.done);
    const spec = next && WARM_UP.find(w => w.id === next.id);
    if (spec?.cue) ctx.sayCue(spec.cue);
  };

  const list = h('ul.sx-wu-list', rows.map(row => {
    const spec = WARM_UP.find(w => w.id === row.id);
    const tick = h('span.sx-wu-tick', row.done ? '✓' : '');
    const toggle = h('button', { type: 'button', 'aria-pressed': String(Boolean(row.done)) },
      tick,
      h('span.sx-wu-txt',
        h('span.sx-wu-name', spec?.name ?? row.id),
        spec?.dose ? h('span.sx-wu-dose', spec.dose) : null));
    const btn = h('li.sx-wu' + (row.done ? '.is-done' : ''), toggle);

    const setDone = done => {
      row.done = done;
      btn.classList.toggle('is-done', done);
      tick.textContent = done ? '✓' : '';
      toggle.setAttribute('aria-pressed', String(done));
      paint();
      ctx.save();
    };

    toggle.addEventListener('click', () => {
      setDone(!row.done);
      if (row.done) sayNext();
    });

    // "Hang for 20–30 seconds" is the one item on this list you cannot pace by
    // feel, because you are hanging off a bar and cannot see the screen.
    if (spec?.holdSec) {
      btn.append(h('button.sx-wu-time', {
        type: 'button',
        'aria-label': `Time the ${spec.name.toLowerCase()}`,
        onclick: () => ctx.hold({
          seconds: spec.holdSec,
          name: spec.name,
          onFinish: () => { setDone(true); sayNext(); },
        }),
      }, 'Time it'));
    }
    return btn;
  }));

  card.append(
    h('div.sx-ex-head',
      h('div', h('h3.sx-ex-name', 'Warm-up'),
        h('p.sx-ex-var', 'Before the first set. Nothing here is logged.')),
      count),
    list);
  paint();
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

  const cardCtx = { ...ctx, save: () => { paintProgress(); ctx.save(); } };
  const cards = sessionBlocks(draft.exercises)
    .map(block => (block.kind === 'pair'
      ? pairCard(block.items, cardCtx)
      : exerciseCard(block.items[0], cardCtx)))
    .filter(Boolean);

  mount.replaceChildren(...[
    offMatTabs('strength'),
    h('div.sx-top',
      h('span.sx-when', draft.deload ? 'Deload session' : fmtDate(draft.date)),
      countEl),
    rail,
    // Siblings, not wrapped in a container: both are `position: sticky`, and a
    // sticky element can only stick within its parent's box — putting the two of
    // them in a plain wrapper div would confine them to the height of that
    // wrapper and they would scroll away with it. They never show at once (a
    // hold stops the rest and vice versa), so sharing a `top` costs nothing.
    ctx.restTimer.el,
    ctx.holdTimer.el,
    warmupCard(draft, cardCtx),
    ...cards,
    h('div.btn-row', { style: 'margin-top:16px' }, finishBtn),
    h('button.sx-abandon', {
      type: 'button',
      onclick: () => ctx.abandon(),
    }, 'Discard this session'),
  ].filter(Boolean));

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

  const { beep, voice } = mountAudio(today);
  const wake = createWakeLock();
  const restTimer = createRestTimer(beep, wake, voice, token);
  const holdTimer = createHoldTimer(beep, voice, wake, token);

  let lastRestOver = 0;   // never the same "rest is over" take twice running
  const restOverCue = () => {
    lastRestOver = pickCue(REST_OVER_CUES, lastRestOver);
    return `rest-over-${lastRestOver}`;
  };
  const announced = new Set();   // movements already named aloud this session
  const state = programmeState(sessions);
  const lastSession = sessions[sessions.length - 1] ?? null;

  const showIntro = async (deloadDismissed = false) => {
    restTimer.stop();
    holdTimer.stop();
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
        // Start speaks again, and this time it says the right thing.
        //
        // v42 announced the opening *lift* here, which was correct until v43 put
        // the warm-up first — then Start said "pull-ups" over a screen showing
        // arm circles, so v44 silenced it. The reason given was that no warm-up
        // cue was recorded. Three of them were, in `audio/cues/`, left over from
        // the rest-day routine; they were simply never wired up. Now they are,
        // so the opening cue names what is actually on screen. The lift names
        // still land on their own first set, which covers the routes into a
        // session that never show this button at all.
        const first = WARM_UP.find(w => w.cue);
        if (first) voice.say(first.cue);
        await store.setStrengthDraft(fresh);
        showSession(fresh);
      },
    });
  };

  const showSession = current => {
    sessionScreen(mount, {
      draft: current,
      restTimer,
      holdTimer,
      stateFor: id => state[id],
      lastFor: id => lastSession?.exercises?.find(e => e.exerciseId === id) ?? null,
      allLogged: () => current.exercises,
      save: () => { store.setStrengthDraft(current).catch(() => {}); },
      rest: (seconds, label, cue, undo) => restTimer.start(seconds, label, cue, undo),
      // A hold and a rest must never run at once — two clocks beeping over each
      // other is worse than either.
      hold: opts => { restTimer.stop(); holdTimer.start(opts); },
      // Say a movement's name once per session. The end of a rest already
      // announces whatever is coming next, so this must not repeat it two
      // minutes later when you actually start the thing — unless you asked, by
      // tapping the speaker on the card, in which case answer every time.
      announce: (id, { force = false } = {}) => {
        if (announced.has(id) && !force) return;
        announced.add(id);
        voice.say(id);
      },
      /** Play a clip that is not a movement name — the warm-up cues. */
      sayCue: id => voice.say(id),
      /**
       * The cue for a rest that is about to hand over to `id`: its name if it
       * has not been said yet, a generic "rest is over" if it has. Claiming the
       * name here is what stops it being repeated when you start the movement.
       */
      cueFor: id => {
        if (announced.has(id)) return restOverCue();
        announced.add(id);
        return id;
      },
      markAnnounced: id => announced.add(id),
      // The next movement with work still to do. Skipped ones are not coming.
      nextExerciseId: id => {
        const list = current.exercises;
        const at = list.findIndex(e => e.exerciseId === id);
        return list.slice(at + 1)
          .find(e => !e.skipped && e.sets.some(x => !x.completed))?.exerciseId ?? null;
      },
      restOverCue,
      toggleSkip: async logged => {
        logged.skipped = !logged.skipped;
        await store.toggleMutedExercise(logged.exerciseId);
        await store.setStrengthDraft(current);
        showSession(current);
      },
      abandon: async () => {
        restTimer.stop();
        holdTimer.stop();
        await store.clearStrengthDraft();
        toast('Session discarded');
        showIntro();
      },
      finish: async () => {
        restTimer.stop();
        holdTimer.stop();
        beep.finish();
        // Chime first, voice after — same order as a routine's finish, and the
        // same reason: the chime is the signal, the line is the flourish. No
        // teardown to time here, because this screen keeps its audio alive for
        // as long as it is mounted; the summary renders underneath it.
        if (!beep.isMuted()) setTimeout(() => voice.say(`finish-${pickFinish()}`), CHIME_MS);
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
