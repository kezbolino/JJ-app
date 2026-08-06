// The stretch screen: pick a routine, then run it.
//
// Two routines share this one engine — the post-class cool-down (passive
// holds) and the rest-day session (bodyweight end-range strength). They differ
// in what a segment is made of, not in how time is counted. See
// js/stretches.js for the list and for why they are different kinds of thing.
//
// Four things here are deliberate, and two of them are bugs this app has
// already paid for once:
//
// 1. **Time comes from the clock, never from counting ticks.** Each segment's
//    start and end are precomputed once (see `segments()` in js/stretches.js),
//    and the current one is a lookup into that table — so a phone that
//    throttles timers in the background, or sleeps for a minute, resumes on the
//    correct movement instead of drifting further behind the longer you run.
//    Segments used to be uniform and the lookup used to be a division; the
//    warm-up, which is work only, ended that. What has *not* changed, and must
//    not, is that nothing accumulates per tick.
// 2. **The routine lives at module scope, not inside the screen.** A single
//    `session` object below survives navigating to another tab — the engine
//    (the `setInterval`, the beeps, the voice cues) keeps running regardless
//    of what `#view` currently holds, so tapping over to Log mid-hold doesn't
//    silence anything. What the render token now gates is narrower than it
//    used to be: only *painting* the screen, not the engine itself. Each
//    mounted screen registers a paint callback in `session.renderers`; the
//    callback checks its own token on every tick and unregisters itself the
//    moment a newer screen has taken over `#view`, so a stale screen you've
//    already left can't get repainted, but the routine underneath it doesn't
//    stop. Coming back to `#/stretch` re-attaches to whatever is still
//    running instead of restarting at the intro.
// 3. **Beeps are synthesised, not files.** An AudioContext oscillator costs no
//    bytes in the shell and nothing to cache, which is the whole shape of this
//    app. The context can only be created from a user gesture, so it is built
//    when you tap Start — see js/beeps.js, shared with the strength session's
//    rest timer. The spoken move names are the one exception — real
//    audio clips under audio/cues/<id>.webm — because there is no synthesising
//    a name; muting the sound stops both.
// 4. **A phase of length 0 is not special-cased.** The cool-down simply has a
//    rest of 0, and a warm-up movement a get-ready of 0, so those phases never
//    fire. One code path covers every routine.
//
// This is not the round timer that was removed in v18 — that one asked you to
// have a phone at the edge of the mat during training. Both of these run when
// you are off it.

import { h, icon, offMatTabs } from '../ui.js';
import { renderToken, isCurrent } from '../render.js';
import { createBeeper } from '../beeps.js';
import { createWakeLock } from '../wakelock.js';
import { logMobilitySession } from '../store.js';
import {
  DEFAULT_ROUTINE, getRoutine, segments, routineMs,
  clock, stretchFigure, pickOtherSide, pickHype, segmentAt,
} from '../stretches.js';

/**
 * Spoken move names, recorded as short clips under audio/cues/<id>.webm —
 * a lift on top of the beeps, never a replacement for them.
 *
 * This plays clips through Web Audio, the same as the beeps, rather than a
 * plain `Audio` element — deliberately. A bare `Audio().play()` called from
 * a `setInterval` tick (as every segment after the first is) is not running
 * inside a user gesture, and Chrome is free to silently reject it; the promise
 * rejection was being swallowed, so it looked like "the first move announces
 * itself, then nothing." An `AudioContext` resumed once inside the Start tap
 * stays usable from anywhere afterward — that is the whole reason the beeps
 * never hit this — so voice clips are decoded once and played as buffers
 * through that same kind of context instead.
 */
function createVoice() {
  let ctx = null;
  let closed = false;
  let current = null;
  const buffers = new Map();

  const ensure = () => {
    if (closed) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const load = async (c, id) => {
    if (buffers.has(id)) return buffers.get(id);
    try {
      const res = await fetch(`audio/cues/${id}.webm`);
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(id, buf);
      return buf;
    } catch { return null; } // no clip recorded yet — stay silent, don't break the routine
  };

  const stop = () => {
    if (current) { try { current.stop(); } catch { /* already ended */ } current = null; }
  };

  return {
    unlock: () => ensure(),
    say: async id => {
      const c = ensure();
      if (!c) return;
      const buf = await load(c, id);
      if (!buf || closed) return;   // torn down while the clip was still decoding
      stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start();
      current = src;
    },
    stop,
    close: () => { stop(); closed = true; if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
  };
}

// ---------------------------------------------------------------------------
// The engine. One `session` at a time, living at module scope so it survives
// the router clearing `#view` out from under whatever screen was drawn there.
// Nothing in here touches the DOM — that is the renderer's job, below.
// ---------------------------------------------------------------------------

let session = null;

/**
 * Which clip to announce as a segment starts: the movement's own name, or —
 * on the second half of a two-sided movement — one of the generic "now the
 * other side" takes. `pickOtherSide` lives in js/stretches.js so it can be
 * unit-tested; the choice is the only part of the audio path checkable
 * without ears.
 *
 * **The test for "second side" is that the previous segment is the same
 * movement**, not that the side is labelled "Right side". `segments()` happens
 * to word it that way today; keying audio to a display string means a copy edit
 * silently changes what you hear.
 */
function cueFor(s, i) {
  const isSecondSide = i > 0 && s.segs[i - 1].item.id === s.segs[i].item.id;
  if (!isSecondSide) return s.segs[i].item.id;
  s.lastOtherSide = pickOtherSide(s.lastOtherSide);
  return `other-side-${s.lastOtherSide}`;
}

/**
 * How often a set gets something spoken on top of the beeps.
 *
 * Both are well under 1 on purpose. The beeps are the baseline and they carry
 * the timing on their own; the voice is a garnish, and a garnish on every
 * single set is just the noise the app makes. The spoken countdown is rarer
 * again because it replaces the 3-2-1 ticks rather than sitting alongside
 * them — losing that cue on every set would cost you the one piece of
 * information the beeps exist to give.
 */
const COUNTDOWN_CHANCE = 0.18;
const HYPE_CHANCE = 0.45;

const sessionElapsed = s => s.baseElapsed + (s.anchor === null ? 0 : performance.now() - s.anchor);
const sessionRunning = s => s.anchor !== null;

/**
 * Everything about the current instant, purely a function of elapsed time.
 *
 * Segments are no longer all the same length — a warm-up movement is work only
 * — so the index comes from a binary search over precomputed offsets rather
 * than a division. Still a pure lookup, still no accumulation, so sleeping
 * through half a routine still resumes in the right place.
 */
function computeState(s) {
  const e = sessionElapsed(s);
  if (e >= s.totalMs) return { e, done: true };
  const i = segmentAt(s.segs, e);
  if (i < 0) return { e, done: true };
  const seg = s.segs[i];
  const { ready, work, rest } = seg.phases;
  const within = e - seg.start;
  const phase = within < ready ? 'ready' : within < ready + work ? 'work' : 'rest';
  const boundary = phase === 'ready' ? ready : phase === 'work' ? ready + work : ready + work + rest;
  const secs = Math.max(1, Math.ceil((boundary - within) / 1000));
  return { e, done: false, i, seg, within, phase, secs };
}

function engineTick() {
  const s = session;
  if (!s) return;
  const st = computeState(s);
  if (st.done) { finishSession(); return; }

  const key = `${st.i}:${st.phase}`;
  if (key !== s.lastKey) {
    s.lastKey = key;
    s.lastCount = -1;
    const muted = s.beep.isMuted();
    // A warm-up movement has no get-ready, so *work* is where it opens and
    // where its name belongs. Keying off the phases rather than the `warmup`
    // flag means this stays right for anything else that skips a phase.
    const opensHere = st.phase === (st.seg.phases.ready > 0 ? 'ready' : 'work');

    if (opensHere) {
      // Decide this set's flourishes once, on entry, so the countdown and the
      // hype line can't both land — the countdown already ends on "let's go".
      // A movement that flows straight in gets neither: there is no countdown
      // without a get-ready, and its own name is already playing.
      s.countdownDue = st.seg.phases.ready > 0 && Math.random() < COUNTDOWN_CHANCE;
      s.hypeDue = st.seg.phases.ready > 0 && !s.countdownDue && Math.random() < HYPE_CHANCE;
      if (!muted) s.voice.say(cueFor(s, st.i));
    }

    if (st.phase === 'ready') s.beep.ready();
    else if (st.phase === 'work') {
      s.beep.go();
      if (s.hypeDue && !muted) {
        s.lastHype = pickHype(s.lastHype);
        s.voice.say(`hype-${s.lastHype}`);
      }
    } else s.beep.rest();
  }
  if (st.secs !== s.lastCount) {
    s.lastCount = st.secs;
    if (st.secs <= 3) {
      // The spoken "3, 2, 1, let's go" *replaces* the three ticks rather than
      // playing over them. Muted falls back to the ticks, so the last three
      // seconds are never silent.
      const spoken = st.phase === 'ready' && s.countdownDue && !s.beep.isMuted();
      if (!spoken) s.beep.tick();
      else if (st.secs === 3) s.voice.say('countdown');
    }
  }

  for (const paint of s.renderers) paint(st);
}

function startSession(routine) {
  endSession(); // defensive: replace, don't stack, if one is somehow still live
  const beep = createBeeper();
  const voice = createVoice();
  const wake = createWakeLock();
  beep.unlock();           // must happen inside the tap
  voice.unlock();          // same reason — an AudioContext resumes from a gesture or not at all
  wake.request();

  const segs = segments(routine);
  const s = {
    routine, segs,
    // The timeline's own end, not a segment count × a length — warm-up
    // movements are shorter than the rest, so there is no single length.
    totalMs: routineMs(routine),
    baseElapsed: 0, anchor: performance.now(),
    lastKey: '', lastCount: -1, lastOtherSide: 0, lastHype: 0,
    countdownDue: false, hypeDue: false, finished: false,
    beep, voice, wake, timer: null, renderers: new Set(),
  };
  s.onVisible = () => { if (sessionRunning(s)) s.wake.reacquire(); };
  document.addEventListener('visibilitychange', s.onVisible);
  session = s;
  s.timer = setInterval(engineTick, 100);
  engineTick();
}

/** The routine ran its full length. Let the finish chime ring out, then clean up. */
function finishSession() {
  const s = session;
  if (!s || s.finished) return;
  s.finished = true;
  // Mark it on the calendar. Only a routine run to the end counts — ending
  // early is not a session you did, and the calendar is a record of facts.
  // This is never a class: see the note on logMobilitySession in store.js.
  logMobilitySession(s.routine.id).catch(() => { /* the calendar can wait */ });
  clearInterval(s.timer);
  s.timer = null;
  s.beep.finish();
  for (const paint of s.renderers) paint({ done: true });
  setTimeout(() => { if (session === s) endSession(); }, 900);
}

/** The only way the engine actually stops: End routine, or the timeout above. */
function endSession() {
  const s = session;
  if (!s) return;
  session = null;
  clearInterval(s.timer);
  s.wake.release();
  s.beep.close();
  s.voice.close();
  document.removeEventListener('visibilitychange', s.onVisible);
}

function setPaused(s, on) {
  if (on) { s.baseElapsed = sessionElapsed(s); s.anchor = null; s.wake.release(); }
  else { s.anchor = performance.now(); s.wake.request(); }
}

// Skip jumps to the start of the next segment; Back to the start of this one,
// or the previous one if you are already at the top of it.
function jumpTo(s, ms) {
  s.baseElapsed = Math.max(0, Math.min(ms, s.totalMs));
  if (sessionRunning(s)) s.anchor = performance.now();
  s.lastKey = '';
  if (s.baseElapsed >= s.totalMs) finishSession(); else engineTick();
}

// ---------------------------------------------------------------------------
// The renderer. Built fresh every time `#/stretch` is visited; attaches to
// whatever `session` already exists rather than owning the clock itself.
// ---------------------------------------------------------------------------

/**
 * Draws the running screen for the current `session` into `mount`, and
 * registers to keep drawing it on every engine tick. Returns a detach
 * function — call it when *this* screen is done, which only unregisters the
 * paint callback, and does not touch the session underneath it.
 */
function attachRunning(mount, token, onExit) {
  const s = session;
  const routine = s.routine;

  // ---- the screen -------------------------------------------------------
  const figSlot = h('div.st-fig');
  const nameEl = h('h2.st-name');
  const warmupEl = h('span.st-warmup', 'Warm-up');
  const nextEl = h('span.st-next', 'Next up');
  const sideEl = h('span.st-side');
  const doseEl = h('span.st-dose');
  const targetEl = h('p.st-targets');
  const cueEl = h('p.st-cue');
  const phaseEl = h('span.st-phase');
  const countEl = h('span.st-count');
  const phaseBar = h('i');
  const phaseRail = h('div.st-phaserail', phaseBar);
  const overallBar = h('i');
  const overallRail = h('div.st-rail', overallBar);
  const stepEl = h('span.st-step');
  const leftEl = h('span.st-left');
  // Changes announce themselves; the ticking seconds deliberately do not.
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });

  const pauseBtn = h('button.btn.primary.st-pause', { type: 'button' }, sessionRunning(s) ? 'Pause' : 'Resume');
  const skipBtn = h('button.btn.st-skip', { type: 'button' }, 'Skip ›');
  const backBtn = h('button.btn.st-back', { type: 'button' }, '‹ Back');
  const muted = s.beep.isMuted();
  const soundBtn = h('button.st-sound' + (muted ? '.is-muted' : ''), {
    type: 'button', 'aria-pressed': String(muted), 'aria-label': muted ? 'Unmute the sound' : 'Mute the sound',
    title: muted ? 'Sound off' : 'Sound on',
  }, icon(muted ? 'soundOff' : 'sound'));
  const endBtn = h('button.btn.danger.st-end', { type: 'button' }, 'End routine');

  mount.replaceChildren(
    h('div.st-top', stepEl, leftEl),
    overallRail,
    h('div.st-stage', figSlot, h('div.st-badges', nextEl, warmupEl, sideEl, doseEl)),
    nameEl,
    targetEl,
    h('div.st-clock', phaseEl, countEl),
    phaseRail,
    cueEl,
    h('div.st-ctl', backBtn, pauseBtn, skipBtn),
    h('div.st-foot', soundBtn, endBtn),
    live);

  // ---- painting ---------------------------------------------------------
  // `stepIdx` is which segment the counter reads; `showIdx` is which movement
  // is drawn. They are the same except during rest, when the counter still
  // belongs to the set you just finished but the picture is already the next
  // one — that is the whole point of a rest, and you cannot set up for a
  // movement you cannot see.
  const paintSegment = (showIdx, stepIdx, ahead) => {
    const { item, side } = s.segs[showIdx];
    // No artwork yet → leave the space out rather than draw an empty frame.
    const fig = stretchFigure(item, `${item.name} illustration`);
    figSlot.replaceChildren(...(fig ? [fig] : []));
    figSlot.hidden = !fig;
    nameEl.textContent = item.name;
    targetEl.textContent = item.targets;
    cueEl.textContent = item.cue;
    warmupEl.hidden = !item.warmup || ahead;
    nextEl.hidden = !ahead;
    sideEl.textContent = side ?? '';
    sideEl.hidden = !side;
    doseEl.textContent = item.dose ?? '';
    doseEl.hidden = !item.dose;
    stepEl.textContent = `${routine.workLabel} ${stepIdx + 1} of ${s.segs.length}`;
  };

  // Rest: show what is coming, not what is done.
  const paintRest = i => {
    if (s.segs[i + 1]) { paintSegment(i + 1, i, true); return; }
    // Nothing after this one — don't invite a set-up that isn't coming.
    figSlot.replaceChildren();
    figSlot.hidden = true;
    nextEl.hidden = true;
    warmupEl.hidden = true;
    sideEl.hidden = true;
    doseEl.hidden = true;
    nameEl.textContent = 'Last one done';
    targetEl.textContent = '';
    cueEl.textContent = 'Breathe. That is the session.';
    stepEl.textContent = `${routine.workLabel} ${i + 1} of ${s.segs.length}`;
  };

  const PHASE_LABEL = { ready: 'Get ready', work: routine.workLabel, rest: 'Rest' };

  const paintClock = (seg, phase, secs, within) => {
    const { ready, work, rest } = seg.phases;
    phaseEl.textContent = PHASE_LABEL[phase];
    countEl.textContent = `0:${String(secs).padStart(2, '0')}`;
    mount.classList.toggle('is-ready', phase === 'ready');
    mount.classList.toggle('is-hold', phase === 'work');
    mount.classList.toggle('is-rest', phase === 'rest');
    const span = phase === 'ready' ? ready : phase === 'work' ? work : rest;
    const done = phase === 'ready' ? within
      : phase === 'work' ? within - ready
      : within - ready - work;
    phaseBar.style.width = `${span ? Math.min(100, (done / span) * 100) : 0}%`;
  };

  const finishScreen = () => {
    mount.classList.remove('is-ready', 'is-hold', 'is-rest');
    mount.replaceChildren(
      h('div.st-done',
        h('div.st-done-ico', icon('flame')),
        h('h2', routine.id === 'post-class' ? 'Stretched off' : 'Session done'),
        h('p', `${routine.items.length} ${routine.unit} · ${clock(s.totalMs)} mins. ${routine.doneNote}`),
        h('div.btn-row',
          h('button.btn.primary', { type: 'button', onclick: () => onExit('again') }, 'Go again'))));
  };

  let lastAnnounceKey = '';
  const paint = st => {
    // A newer screen has taken over #view; this one is done painting, but
    // the routine underneath it is not — leave the session running.
    if (!isCurrent(token)) { s.renderers.delete(paint); return; }
    if (st.done) { finishScreen(); return; }

    const { item, side } = s.segs[st.i];
    if (st.phase === 'rest') paintRest(st.i); else paintSegment(st.i, st.i, false);

    const key = `${st.i}:${st.phase}`;
    if (key !== lastAnnounceKey) {
      lastAnnounceKey = key;
      live.textContent = st.phase === 'rest'
        ? `Rest. Next: ${s.segs[st.i + 1]?.item.name ?? 'finish'}.`
        : `${PHASE_LABEL[st.phase]}. ${item.name}${side ? `, ${side}` : ''}.`;
    }

    paintClock(st.seg, st.phase, st.secs, st.within);
    overallBar.style.width = `${(st.e / s.totalMs) * 100}%`;
    leftEl.textContent = `${clock(s.totalMs - st.e)} left`;
    pauseBtn.textContent = sessionRunning(s) ? 'Pause' : 'Resume';
    mount.classList.toggle('is-paused', !sessionRunning(s));
  };

  // ---- controls ---------------------------------------------------------
  pauseBtn.addEventListener('click', () => { setPaused(s, sessionRunning(s)); paint(computeState(s)); });
  skipBtn.addEventListener('click', () => {
    const i = segmentAt(s.segs, sessionElapsed(s));
    jumpTo(s, i < 0 ? s.totalMs : s.segs[i].end);
  });
  backBtn.addEventListener('click', () => {
    const e = sessionElapsed(s);
    const i = segmentAt(s.segs, e);
    if (i < 0) { jumpTo(s, s.segs[s.segs.length - 1].start); return; }
    // Already at the top of this one → go to the previous one instead, which
    // is what "back" means when you have only just arrived.
    const atTop = e - s.segs[i].start < 1500;
    jumpTo(s, s.segs[atTop ? Math.max(0, i - 1) : i].start);
  });

  soundBtn.addEventListener('click', () => {
    const nowMuted = !s.beep.isMuted();
    s.beep.setMuted(nowMuted);
    if (nowMuted) s.voice.stop();
    soundBtn.replaceChildren(icon(nowMuted ? 'soundOff' : 'sound'));
    soundBtn.classList.toggle('is-muted', nowMuted);
    soundBtn.setAttribute('aria-pressed', String(nowMuted));
    soundBtn.setAttribute('aria-label', nowMuted ? 'Unmute the sound' : 'Mute the sound');
    soundBtn.title = nowMuted ? 'Sound off' : 'Sound on';
  });

  endBtn.addEventListener('click', () => { endSession(); onExit('end'); });

  s.renderers.add(paint);
  paint(computeState(s));

  return () => { s.renderers.delete(paint); };
}

/** One `<ol>` of items, the shared rendering for the intro's list(s). */
function itemList(items) {
  return h('ol.st-list', items.map(item => {
    const fig = stretchFigure(item);
    return h('li.st-item',
      fig ? h('span.st-item-fig', fig) : null,
      h('span.st-item-txt',
        h('span.st-item-name', item.name),
        h('span.st-item-sub', item.targets)),
      h('span.st-item-side', item.dose ?? (item.bilateral ? 'Both sides' : '1 hold')));
  }));
}

/** The list you see before starting: what is coming, in order. A routine
 * with warm-up movements (currently just rest day — see js/stretches.js)
 * gets them split into their own section instead of blending into the main
 * list, so it reads as "warm up, then the real session" rather than 17
 * undifferentiated items. */
function overview(routine) {
  const warmups = routine.items.filter(i => i.warmup);
  if (!warmups.length) return itemList(routine.items);

  const main = routine.items.filter(i => !i.warmup);
  return h('div',
    h('div.section-head', h('h3', 'Warm-up')),
    itemList(warmups),
    h('div.section-head', h('h3', 'Main session')),
    itemList(main));
}

export default async function stretch(root, { routine: routineId } = {}) {
  const token = renderToken();

  // A routine already running takes priority over whatever was in the URL —
  // you can't switch what's running mid-session, and this is how coming back
  // to the tab resumes it instead of restarting at the intro.
  let routine = session ? session.routine : getRoutine(routineId ?? DEFAULT_ROUTINE);
  const mount = h('div.st');
  let teardown = null;

  // Segmented picker, shared with the strength view (js/ui.js). Choosing a
  // routine swaps the intro in place and rewrites the hash with replaceState —
  // no hashchange, so the router doesn't rebuild the view under us, but a
  // reload still lands on the routine you picked. The Strength tab is a real
  // link, because that is a different screen entirely.
  const picker = () => offMatTabs(routine.id, id => {
    routine = getRoutine(id);
    history.replaceState(null, '', `#/stretch?r=${id}`);
    showIntro();
  });

  const showIntro = () => {
    teardown?.();
    teardown = null;
    mount.className = 'st';

    const segs = segments(routine);
    const { ready, work, rest } = routine.phases;

    mount.replaceChildren(
      picker(),
      h('section.card.st-intro',
        h('div.st-intro-head',
          h('div',
            h('div.st-intro-n', `${clock(routineMs(routine))} mins`),
            h('div.st-intro-l', `${routine.items.length} ${routine.unit} · ${segs.length} sets`)),
          h('div.st-intro-cycle',
            h('span', `${ready / 1000}s READY`),
            h('span.st-arrow', '→'),
            h('span', `${work / 1000}s ${routine.workLabel.toUpperCase()}`),
            ...(rest ? [h('span.st-arrow', '→'), h('span', `${rest / 1000}s REST`)] : []))),
        routine.needs.length
          ? h('p.st-needs', `You'll need: ${routine.needs.join(' · ')}`)
          : null,
        h('p.st-volume-hint', icon('sound'), 'Turn your volume up — cues and beeps can’t be heard on silent.'),
        h('button.btn.primary.wide.cta', { type: 'button', onclick: begin }, 'Start')),
      overview(routine),
      h('p.st-note', routine.note));
  };

  const showRunning = () => {
    teardown?.();
    teardown = null;
    mount.className = 'st is-running';
    teardown = attachRunning(mount, token, reason => (reason === 'again' ? begin() : showIntro()));
  };

  const begin = () => {
    startSession(routine);
    showRunning();
  };

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Off mat'),
        h('p.page-sub', 'Stretch, mobility and strength'))),
    mount);

  if (session) showRunning(); else showIntro();
}
