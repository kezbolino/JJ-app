// The post-class stretch routine, on a timer.
//
// 10 seconds to get into the shape, 30 to hold it, once per side. The list and
// the figures live in js/stretches.js; this file is the clock, the sound and
// the screen.
//
// Three things here are deliberate, and two of them are bugs this app has
// already paid for once:
//
// 1. **Time comes from the clock, never from counting ticks.** Every segment is
//    the same length, so the whole routine is one arithmetic expression over
//    elapsed milliseconds. A phone that throttles timers in the background, or
//    sleeps for a minute, resumes on the correct stretch instead of drifting
//    further behind the longer you run.
// 2. **The render token is the teardown.** The router just empties `#view` from
//    under whatever was drawn there; nothing tells a view it is being replaced.
//    The interval checks `isCurrent()` and shuts itself — and the wake lock and
//    the audio context — down the moment this stops being the visible screen.
// 3. **Beeps are synthesised, not files.** An AudioContext oscillator costs no
//    bytes in the shell and nothing to cache, which is the whole shape of this
//    app. The context can only be created from a user gesture, so it is built
//    when you tap Start.
//
// This is not the round timer that was removed in v18 — that one asked you to
// have a phone at the edge of the mat during training. This runs afterwards,
// when you are off the mat and winding down, which is where the app lives.

import { h, clear, icon } from '../ui.js';
import { renderToken, isCurrent } from '../render.js';
import {
  STRETCHES, segments, routineMs, clock, stretchFigure,
  READY_MS, SEGMENT_MS,
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
    go: () => tone(880, 280, 0.20),             // "hold it"
    tick: () => tone(720, 90, 0.12),            // 3 · 2 · 1
    finish: () => { tone(660, 200); tone(880, 200, 0.18, 0.21); tone(1170, 420, 0.18, 0.42); },
    setMuted: v => { muted = v; },
    isMuted: () => muted,
    close: () => { if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
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
function runner(mount, segs, { beep, wake, onExit, token }) {
  const totalMs = segs.length * SEGMENT_MS;
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
    type: 'button', 'aria-pressed': 'false', 'aria-label': 'Mute the beeps', title: 'Sound on',
  }, icon('sound'));
  const endBtn = h('button.st-end', { type: 'button' }, 'End routine');

  mount.replaceChildren(
    h('div.st-top', stepEl, leftEl),
    overallRail,
    h('div.st-stage', figSlot, sideEl),
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
    const { stretch: s, side } = segs[i];
    figSlot.replaceChildren(stretchFigure(s.figure, `${s.name} illustration`));
    nameEl.textContent = s.name;
    targetEl.textContent = s.targets;
    cueEl.textContent = s.cue;
    sideEl.textContent = side ?? '';
    sideEl.hidden = !side;
    stepEl.textContent = `Hold ${i + 1} of ${segs.length}`;
  };

  const paintClock = (phase, secs, within) => {
    const ready = phase === 'ready';
    phaseEl.textContent = ready ? 'Get ready' : 'Hold';
    countEl.textContent = `0:${String(secs).padStart(2, '0')}`;
    mount.classList.toggle('is-ready', ready);
    mount.classList.toggle('is-hold', !ready);
    const span = ready ? READY_MS : SEGMENT_MS - READY_MS;
    const done = ready ? within : within - READY_MS;
    phaseBar.style.width = `${Math.min(100, (done / span) * 100)}%`;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    beep.finish();
    mount.classList.remove('is-ready', 'is-hold');
    mount.replaceChildren(
      h('div.st-done',
        h('div.st-done-ico', icon('flame')),
        h('h2', 'Stretched off'),
        h('p', `${STRETCHES.length} stretches · ${clock(totalMs)}. Nothing was logged — this is just the cool-down.`),
        h('div.btn-row',
          h('button.btn.primary', { type: 'button', onclick: () => onExit('again') }, 'Go again'),
          h('a.btn', { href: '#/log' }, 'Log the class'))));
  };

  // ---- the tick ---------------------------------------------------------
  const tick = () => {
    // The router emptied #view under us — this is the only teardown signal.
    if (!isCurrent(token)) { stop(); wake.release(); beep.close(); return; }

    const e = elapsed();
    if (e >= totalMs) { finish(); return; }

    const i = Math.floor(e / SEGMENT_MS);
    const within = e - i * SEGMENT_MS;
    const phase = within < READY_MS ? 'ready' : 'hold';
    const remaining = (phase === 'ready' ? READY_MS : SEGMENT_MS) - within;
    const secs = Math.max(1, Math.ceil(remaining / 1000));

    const key = `${i}:${phase}`;
    if (key !== lastKey) {
      lastKey = key;
      lastCount = -1;
      if (phase === 'ready') { paintSegment(i); beep.ready(); } else beep.go();
      const { stretch: s, side } = segs[i];
      live.textContent = phase === 'ready'
        ? `Get ready. ${s.name}${side ? `, ${side}` : ''}.`
        : `Hold. ${s.name}${side ? `, ${side}` : ''}.`;
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

  // Skip jumps to the start of the next hold; Back to the start of this one,
  // or the previous one if you are already at the top of it.
  const jumpTo = ms => {
    baseElapsed = Math.max(0, Math.min(ms, totalMs));
    if (running()) anchor = performance.now();
    lastKey = '';
    if (baseElapsed >= totalMs) finish(); else tick();
  };
  skipBtn.addEventListener('click', () => {
    const i = Math.floor(elapsed() / SEGMENT_MS);
    jumpTo((i + 1) * SEGMENT_MS);
  });
  backBtn.addEventListener('click', () => {
    const e = elapsed();
    const i = Math.floor(e / SEGMENT_MS);
    const atTop = e - i * SEGMENT_MS < 1500;
    jumpTo(Math.max(0, (atTop ? i - 1 : i) * SEGMENT_MS));
  });

  soundBtn.addEventListener('click', () => {
    const muted = !beep.isMuted();
    beep.setMuted(muted);
    soundBtn.replaceChildren(icon(muted ? 'soundOff' : 'sound'));
    soundBtn.classList.toggle('is-muted', muted);
    soundBtn.setAttribute('aria-pressed', String(muted));
    soundBtn.setAttribute('aria-label', muted ? 'Unmute the beeps' : 'Mute the beeps');
    soundBtn.title = muted ? 'Sound off' : 'Sound on';
  });

  endBtn.addEventListener('click', () => { stop(); wake.release(); onExit('end'); });

  const onVisible = () => { if (running()) wake.reacquire(); };
  document.addEventListener('visibilitychange', onVisible);

  tick();
  start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** The list you see before starting: what is coming, in order. */
function overview() {
  return h('ol.st-list', STRETCHES.map(s =>
    h('li.st-item',
      h('span.st-item-fig', stretchFigure(s.figure)),
      h('span.st-item-txt',
        h('span.st-item-name', s.name),
        h('span.st-item-sub', s.targets)),
      h('span.st-item-side', s.bilateral ? 'Both sides' : '1 hold'))));
}

export default async function stretch(root) {
  const token = renderToken();
  const segs = segments();
  const total = routineMs();
  const beep = createBeeper();
  const wake = createWakeLock();

  const mount = h('div.st');
  let teardown = null;

  const showIntro = () => {
    teardown?.();
    teardown = null;
    wake.release();
    mount.className = 'st';
    mount.replaceChildren(
      h('section.card.st-intro',
        h('div.st-intro-head',
          h('div',
            h('div.st-intro-n', clock(total)),
            h('div.st-intro-l', `${STRETCHES.length} stretches · ${segs.length} holds`)),
          h('div.st-intro-cycle',
            h('span', '10s get ready'),
            h('span.st-arrow', '→'),
            h('span', '30s hold'))),
        h('button.btn.primary.wide.cta', { type: 'button', onclick: begin }, 'Start stretching')),
      overview(),
      h('p.st-note',
        'General guidance, not physio. Ease into each one and back off anything that pinches.'));
  };

  const begin = () => {
    beep.unlock();          // must happen inside the tap
    wake.request();
    mount.className = 'st is-running';
    teardown = runner(mount, segs, {
      beep, wake, token,
      onExit: reason => (reason === 'again' ? begin() : showIntro()),
    });
  };

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Stretch'),
        h('p.page-sub', 'Post-class cool-down'))),
    mount);

  showIntro();
}
