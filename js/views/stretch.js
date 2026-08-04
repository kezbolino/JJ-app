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
// 1. **Time comes from the clock, never from counting ticks.** Every segment
//    inside a routine is the same length, so the current segment is one
//    division over elapsed milliseconds. A phone that throttles timers in the
//    background, or sleeps for a minute, resumes on the correct movement
//    instead of drifting further behind the longer you run.
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
//    when you tap Start. The spoken move names are the one exception — real
//    audio clips under audio/cues/<id>.webm — because there is no synthesising
//    a name; muting the sound stops both.
// 4. **A rest phase of 0 is not special-cased.** The cool-down simply has one,
//    so it never fires. That keeps one code path for both routines.
//
// This is not the round timer that was removed in v18 — that one asked you to
// have a phone at the edge of the mat during training. Both of these run when
// you are off it.

import { h, icon } from '../ui.js';
import { renderToken, isCurrent } from '../render.js';
import {
  ROUTINES, DEFAULT_ROUTINE, getRoutine, segments, segmentMs, routineMs,
  clock, stretchFigure, hasArt,
} from '../stretches.js';

/**
 * Synthesised beeps. No asset, no fetch, nothing to cache.
 *
 * The context is created on the first call and that call has to come from a
 * tap, or the browser starts it suspended and every tone is silent.
 */
function createBeeper() {
  let ctx = null;
  let muted = false;

  const ensure = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  // Square, not sine: a square wave's extra harmonics read as sharper and
  // cut through a TV or background noise far better than a pure tone at the
  // same gain — the pitches and gains below were raised at the same time,
  // for the same reason.
  const tone = (freq, ms, peak = 0.3, delay = 0) => {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const t0 = c.currentTime + delay;
    // Ramp in and out: a square-edged gate on a tone clicks audibly.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  };

  return {
    unlock: () => ensure(),
    ready: () => tone(900, 180, 0.30),          // "get into the shape"
    go: () => tone(1250, 280, 0.35),            // "hold it" / "work"
    rest: () => tone(700, 240, 0.28),           // "stop, breathe"
    tick: () => tone(1500, 90, 0.32),           // 3 · 2 · 1
    finish: () => { tone(950, 200, 0.3); tone(1300, 200, 0.3, 0.21); tone(1750, 420, 0.3, 0.42); },
    setMuted: v => { muted = v; },
    isMuted: () => muted,
    close: () => { if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
  };
}

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

/** Best-effort screen wake lock — the phone shouldn't sleep mid-hold. */
function createWakeLock() {
  let lock = null;
  const request = async () => {
    if (!('wakeLock' in navigator)) return;
    try { lock = await navigator.wakeLock.request('screen'); } catch { /* not critical */ }
  };
  return {
    request,
    // Android drops the lock whenever the tab is hidden; take it again on return.
    reacquire: () => { if (document.visibilityState === 'visible') request(); },
    release: () => { try { lock?.release(); } catch { /* already gone */ } lock = null; },
  };
}

// ---------------------------------------------------------------------------
// The engine. One `session` at a time, living at module scope so it survives
// the router clearing `#view` out from under whatever screen was drawn there.
// Nothing in here touches the DOM — that is the renderer's job, below.
// ---------------------------------------------------------------------------

let session = null;

const sessionElapsed = s => s.baseElapsed + (s.anchor === null ? 0 : performance.now() - s.anchor);
const sessionRunning = s => s.anchor !== null;

/** Everything about the current instant, purely a function of elapsed time. */
function computeState(s) {
  const e = sessionElapsed(s);
  if (e >= s.totalMs) return { e, done: true };
  const i = Math.floor(e / s.SEG);
  const within = e - i * s.SEG;
  const phase = within < s.READY ? 'ready' : within < s.READY + s.WORK ? 'work' : 'rest';
  const boundary = phase === 'ready' ? s.READY : phase === 'work' ? s.READY + s.WORK : s.SEG;
  const secs = Math.max(1, Math.ceil((boundary - within) / 1000));
  return { e, done: false, i, within, phase, secs };
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
    const { item } = s.segs[st.i];
    if (st.phase === 'ready') { s.beep.ready(); if (!s.beep.isMuted()) s.voice.say(item.id); }
    else if (st.phase === 'work') s.beep.go();
    else s.beep.rest();
  }
  if (st.secs !== s.lastCount) {
    s.lastCount = st.secs;
    if (st.secs <= 3) s.beep.tick();
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
    routine, segs, SEG: segmentMs(routine),
    READY: routine.phases.ready, WORK: routine.phases.work,
    totalMs: segs.length * segmentMs(routine),
    baseElapsed: 0, anchor: performance.now(),
    lastKey: '', lastCount: -1, finished: false,
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
  const endBtn = h('button.st-end', { type: 'button' }, 'End routine');

  mount.replaceChildren(
    h('div.st-top', stepEl, leftEl),
    overallRail,
    h('div.st-stage', figSlot, h('div.st-badges', warmupEl, sideEl, doseEl)),
    nameEl,
    targetEl,
    h('div.st-clock', phaseEl, countEl),
    phaseRail,
    cueEl,
    h('div.st-ctl', backBtn, pauseBtn, skipBtn),
    h('div.st-foot', soundBtn, endBtn),
    live);

  // ---- painting ---------------------------------------------------------
  const paintSegment = i => {
    const { item, side } = s.segs[i];
    // No artwork yet → leave the space out rather than draw an empty frame.
    const fig = stretchFigure(item, `${item.name} illustration`);
    figSlot.replaceChildren(...(fig ? [fig] : []));
    figSlot.hidden = !fig;
    nameEl.textContent = item.name;
    targetEl.textContent = item.targets;
    cueEl.textContent = item.cue;
    warmupEl.hidden = !item.warmup;
    sideEl.textContent = side ?? '';
    sideEl.hidden = !side;
    doseEl.textContent = item.dose ?? '';
    doseEl.hidden = !item.dose;
    stepEl.textContent = `${routine.workLabel} ${i + 1} of ${s.segs.length}`;
  };

  // During rest the screen keeps the movement you just did but says what is
  // coming, so you can set up for it before the next "get ready" starts.
  const paintRest = i => {
    const next = s.segs[i + 1];
    cueEl.textContent = next
      ? `Next: ${next.item.name}${next.side ? ` — ${next.side.toLowerCase()}` : ''}`
      : 'Last one — nearly there.';
  };

  const PHASE_LABEL = { ready: 'Get ready', work: routine.workLabel, rest: 'Rest' };

  const paintClock = (phase, secs, within) => {
    phaseEl.textContent = PHASE_LABEL[phase];
    countEl.textContent = `0:${String(secs).padStart(2, '0')}`;
    mount.classList.toggle('is-ready', phase === 'ready');
    mount.classList.toggle('is-hold', phase === 'work');
    mount.classList.toggle('is-rest', phase === 'rest');
    const span = phase === 'ready' ? s.READY : phase === 'work' ? s.WORK : s.SEG - s.READY - s.WORK;
    const done = phase === 'ready' ? within
      : phase === 'work' ? within - s.READY
      : within - s.READY - s.WORK;
    phaseBar.style.width = `${Math.min(100, (done / span) * 100)}%`;
  };

  const finishScreen = () => {
    mount.classList.remove('is-ready', 'is-hold', 'is-rest');
    mount.replaceChildren(
      h('div.st-done',
        h('div.st-done-ico', icon('flame')),
        h('h2', routine.id === 'post-class' ? 'Stretched off' : 'Session done'),
        h('p', `${routine.items.length} ${routine.unit} · ${clock(s.totalMs)} mins. ${routine.doneNote}`),
        h('div.btn-row',
          h('button.btn.primary', { type: 'button', onclick: () => onExit('again') }, 'Go again'),
          h('a.btn', { href: '#/log' }, 'Log a class'))));
  };

  let lastAnnounceKey = '';
  const paint = st => {
    // A newer screen has taken over #view; this one is done painting, but
    // the routine underneath it is not — leave the session running.
    if (!isCurrent(token)) { s.renderers.delete(paint); return; }
    if (st.done) { finishScreen(); return; }

    const { item, side } = s.segs[st.i];
    if (st.phase === 'rest') paintRest(st.i); else paintSegment(st.i);

    const key = `${st.i}:${st.phase}`;
    if (key !== lastAnnounceKey) {
      lastAnnounceKey = key;
      live.textContent = st.phase === 'rest'
        ? `Rest. Next: ${s.segs[st.i + 1]?.item.name ?? 'finish'}.`
        : `${PHASE_LABEL[st.phase]}. ${item.name}${side ? `, ${side}` : ''}.`;
    }

    paintClock(st.phase, st.secs, st.within);
    overallBar.style.width = `${(st.e / s.totalMs) * 100}%`;
    leftEl.textContent = `${clock(s.totalMs - st.e)} left`;
    pauseBtn.textContent = sessionRunning(s) ? 'Pause' : 'Resume';
    mount.classList.toggle('is-paused', !sessionRunning(s));
  };

  // ---- controls ---------------------------------------------------------
  pauseBtn.addEventListener('click', () => { setPaused(s, sessionRunning(s)); paint(computeState(s)); });
  skipBtn.addEventListener('click', () => jumpTo(s, (Math.floor(sessionElapsed(s) / s.SEG) + 1) * s.SEG));
  backBtn.addEventListener('click', () => {
    const e = sessionElapsed(s);
    const i = Math.floor(e / s.SEG);
    const atTop = e - i * s.SEG < 1500;
    jumpTo(s, Math.max(0, (atTop ? i - 1 : i) * s.SEG));
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

  // Segmented picker. Choosing swaps the intro in place and rewrites the hash
  // with replaceState — no hashchange, so the router doesn't rebuild the view
  // under us, but a reload still lands on the routine you picked.
  const picker = () => h('div.st-pick', { role: 'tablist' },
    ROUTINES.map(r => {
      const on = r.id === routine.id;
      return h('button' + (on ? '.is-on' : ''), {
        type: 'button', role: 'tab', 'aria-selected': String(on),
        onclick: () => {
          if (r.id === routine.id) return;
          routine = r;
          history.replaceState(null, '', `#/stretch?r=${r.id}`);
          showIntro();
        },
      }, r.name);
    }));

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
        h('h1.page-title', 'Stretch'),
        h('p.page-sub', 'Cool-down and mobility'))),
    mount);

  if (session) showRunning(); else showIntro();
}
