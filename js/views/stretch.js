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
// 2. **The render token is the teardown.** The router just empties `#view`
//    from under whatever was drawn there; nothing tells a view it is being
//    replaced. The interval checks `isCurrent()` and shuts itself — and the
//    wake lock and the audio context — down the moment this stops being the
//    visible screen.
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

  const tone = (freq, ms, peak = 0.18, delay = 0) => {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = c.currentTime + delay;
    // Ramp in and out: a square-edged gate on a sine clicks audibly.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  };

  return {
    unlock: () => ensure(),
    ready: () => tone(430, 180, 0.16),          // "get into the shape"
    go: () => tone(880, 280, 0.20),             // "hold it" / "work"
    rest: () => tone(330, 240, 0.14),           // "stop, breathe"
    tick: () => tone(720, 90, 0.12),            // 3 · 2 · 1
    finish: () => { tone(660, 200); tone(880, 200, 0.18, 0.21); tone(1170, 420, 0.18, 0.42); },
    setMuted: v => { muted = v; },
    isMuted: () => muted,
    close: () => { if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
  };
}

/**
 * Spoken move names, recorded as short clips under audio/cues/<id>.webm —
 * a lift on top of the beeps, never a replacement for them. One Audio
 * element is reused rather than minting one per segment, and a move with no
 * clip recorded yet just stays silent (`.play()` rejects, caught and
 * dropped) instead of breaking the routine.
 */
function createVoice() {
  const audio = new Audio();
  return {
    say: id => {
      audio.src = `audio/cues/${id}.webm`;
      audio.play().catch(() => {});
    },
    stop: () => { audio.pause(); },
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

/**
 * The running routine.
 *
 * `baseElapsed` + `anchor` is the whole clock: elapsed time is what has been
 * banked plus what has run since the last resume. Pausing banks and drops the
 * anchor; skipping rewrites the bank. Nothing accumulates per tick, so nothing
 * drifts.
 */
function runner(mount, routine, { beep, voice, wake, onExit, token }) {
  const segs = segments(routine);
  const SEG = segmentMs(routine);
  const { ready: READY, work: WORK } = routine.phases;
  const totalMs = segs.length * SEG;

  let baseElapsed = 0;
  let anchor = performance.now();
  let timer = null;
  let lastKey = '';
  let lastCount = -1;
  let finished = false;

  const elapsed = () => baseElapsed + (anchor === null ? 0 : performance.now() - anchor);
  const running = () => anchor !== null;

  // ---- the screen -------------------------------------------------------
  const figSlot = h('div.st-fig');
  const nameEl = h('h2.st-name');
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

  const pauseBtn = h('button.btn.primary.st-pause', { type: 'button' }, 'Pause');
  const skipBtn = h('button.btn.st-skip', { type: 'button' }, 'Skip ›');
  const backBtn = h('button.btn.st-back', { type: 'button' }, '‹ Back');
  const soundBtn = h('button.st-sound', {
    type: 'button', 'aria-pressed': 'false', 'aria-label': 'Mute the sound', title: 'Sound on',
  }, icon('sound'));
  const endBtn = h('button.st-end', { type: 'button' }, 'End routine');

  mount.replaceChildren(
    h('div.st-top', stepEl, leftEl),
    overallRail,
    h('div.st-stage', figSlot, h('div.st-badges', sideEl, doseEl)),
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
    const { item, side } = segs[i];
    // No artwork yet → leave the space out rather than draw an empty frame.
    const fig = stretchFigure(item, `${item.name} illustration`);
    figSlot.replaceChildren(...(fig ? [fig] : []));
    figSlot.hidden = !fig;
    nameEl.textContent = item.name;
    targetEl.textContent = item.targets;
    cueEl.textContent = item.cue;
    sideEl.textContent = side ?? '';
    sideEl.hidden = !side;
    doseEl.textContent = item.dose ?? '';
    doseEl.hidden = !item.dose;
    stepEl.textContent = `${routine.workLabel} ${i + 1} of ${segs.length}`;
  };

  // During rest the screen keeps the movement you just did but says what is
  // coming, so you can set up for it before the next "get ready" starts.
  const paintRest = i => {
    const next = segs[i + 1];
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
    const span = phase === 'ready' ? READY : phase === 'work' ? WORK : SEG - READY - WORK;
    const done = phase === 'ready' ? within
      : phase === 'work' ? within - READY
      : within - READY - WORK;
    phaseBar.style.width = `${Math.min(100, (done / span) * 100)}%`;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    beep.finish();
    mount.classList.remove('is-ready', 'is-hold', 'is-rest');
    mount.replaceChildren(
      h('div.st-done',
        h('div.st-done-ico', icon('flame')),
        h('h2', routine.id === 'post-class' ? 'Stretched off' : 'Session done'),
        h('p', `${routine.items.length} ${routine.unit} · ${clock(totalMs)} mins. ${routine.doneNote}`),
        h('div.btn-row',
          h('button.btn.primary', { type: 'button', onclick: () => onExit('again') }, 'Go again'),
          h('a.btn', { href: '#/log' }, 'Log a class'))));
  };

  // ---- the tick ---------------------------------------------------------
  const tick = () => {
    // The router emptied #view under us — this is the only teardown signal.
    if (!isCurrent(token)) { stop(); wake.release(); beep.close(); voice.stop(); return; }

    const e = elapsed();
    if (e >= totalMs) { finish(); return; }

    const i = Math.floor(e / SEG);
    const within = e - i * SEG;
    const phase = within < READY ? 'ready' : within < READY + WORK ? 'work' : 'rest';
    const boundary = phase === 'ready' ? READY : phase === 'work' ? READY + WORK : SEG;
    const secs = Math.max(1, Math.ceil((boundary - within) / 1000));

    const key = `${i}:${phase}`;
    if (key !== lastKey) {
      lastKey = key;
      lastCount = -1;
      const { item, side } = segs[i];
      if (phase === 'ready') { paintSegment(i); beep.ready(); if (!beep.isMuted()) voice.say(item.id); }
      else if (phase === 'work') beep.go();
      else { paintRest(i); beep.rest(); }
      live.textContent = phase === 'rest'
        ? `Rest. Next: ${segs[i + 1]?.item.name ?? 'finish'}.`
        : `${PHASE_LABEL[phase]}. ${item.name}${side ? `, ${side}` : ''}.`;
    }

    if (secs !== lastCount) {
      lastCount = secs;
      if (secs <= 3) beep.tick();
    }

    paintClock(phase, secs, within);
    overallBar.style.width = `${(e / totalMs) * 100}%`;
    leftEl.textContent = `${clock(totalMs - e)} left`;
  };

  const start = () => { if (!timer) timer = setInterval(tick, 100); };
  const stop = () => { clearInterval(timer); timer = null; };

  // ---- controls ---------------------------------------------------------
  const setPaused = on => {
    if (on) {
      baseElapsed = elapsed();
      anchor = null;
      wake.release();
    } else {
      anchor = performance.now();
      wake.request();
    }
    pauseBtn.textContent = on ? 'Resume' : 'Pause';
    mount.classList.toggle('is-paused', on);
  };

  pauseBtn.addEventListener('click', () => setPaused(running()));

  // Skip jumps to the start of the next segment; Back to the start of this
  // one, or the previous one if you are already at the top of it.
  const jumpTo = ms => {
    baseElapsed = Math.max(0, Math.min(ms, totalMs));
    if (running()) anchor = performance.now();
    lastKey = '';
    if (baseElapsed >= totalMs) finish(); else tick();
  };
  skipBtn.addEventListener('click', () => jumpTo((Math.floor(elapsed() / SEG) + 1) * SEG));
  backBtn.addEventListener('click', () => {
    const e = elapsed();
    const i = Math.floor(e / SEG);
    const atTop = e - i * SEG < 1500;
    jumpTo(Math.max(0, (atTop ? i - 1 : i) * SEG));
  });

  soundBtn.addEventListener('click', () => {
    const muted = !beep.isMuted();
    beep.setMuted(muted);
    if (muted) voice.stop();
    soundBtn.replaceChildren(icon(muted ? 'soundOff' : 'sound'));
    soundBtn.classList.toggle('is-muted', muted);
    soundBtn.setAttribute('aria-pressed', String(muted));
    soundBtn.setAttribute('aria-label', muted ? 'Unmute the sound' : 'Mute the sound');
    soundBtn.title = muted ? 'Sound off' : 'Sound on';
  });

  endBtn.addEventListener('click', () => { stop(); wake.release(); onExit('end'); });

  const onVisible = () => { if (running()) wake.reacquire(); };
  document.addEventListener('visibilitychange', onVisible);

  tick();
  start();

  return () => {
    stop();
    voice.stop();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** The list you see before starting: what is coming, in order. */
function overview(routine) {
  return h('ol.st-list', routine.items.map(item => {
    const fig = stretchFigure(item);
    return h('li.st-item',
      fig ? h('span.st-item-fig', fig) : null,
      h('span.st-item-txt',
        h('span.st-item-name', item.name),
        h('span.st-item-sub', item.targets)),
      h('span.st-item-side', item.dose ?? (item.bilateral ? 'Both sides' : '1 hold')));
  }));
}

export default async function stretch(root, { routine: routineId } = {}) {
  const token = renderToken();
  const beep = createBeeper();
  const voice = createVoice();
  const wake = createWakeLock();

  let routine = getRoutine(routineId ?? DEFAULT_ROUTINE);
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
    wake.release();
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
        h('button.btn.primary.wide.cta', { type: 'button', onclick: begin }, 'Start')),
      overview(routine),
      h('p.st-note', routine.note));
  };

  const begin = () => {
    beep.unlock();          // must happen inside the tap
    wake.request();
    mount.className = 'st is-running';
    teardown = runner(mount, routine, {
      beep, voice, wake, token,
      onExit: reason => (reason === 'again' ? begin() : showIntro()),
    });
  };

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Stretch'),
        h('p.page-sub', 'Cool-down and mobility'))),
    mount);

  showIntro();
}
