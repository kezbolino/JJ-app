// Round timer — the one screen that is useful *during* training.
//
// Everything else in this app happens after the session. This is the thing
// people currently open a second app for: rounds, rest, a beep you can hear
// over a mat full of people.
//
// Two deliberate implementation choices:
//
//   * Time is computed from a start timestamp, never accumulated from ticks.
//     A phone in a gym bag suspends the tab, `setInterval` stops firing, and a
//     counter built on ticks silently runs slow. Reading the clock each frame
//     means the timer self-corrects the moment the screen wakes.
//
//   * The beep is synthesised with an oscillator, not played from a file. No
//     asset to ship, cache or fail to load offline — and it can be as loud and
//     as plain as a gym needs.

import { h, card, icon, toast } from '../ui.js';

const PRESETS = [
  { label: '5 × 5 min', rounds: 5, work: 300, rest: 60 },
  { label: '6 × 3 min', rounds: 6, work: 180, rest: 30 },
  { label: '3 × 6 min', rounds: 3, work: 360, rest: 60 },
];

const KEY = 'jj-timer';           // device-local, like the appearance settings

const clock = seconds => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '');
    if (saved?.rounds && saved?.work) return saved;
  } catch { /* first run, or hand-edited */ }
  return { ...PRESETS[0] };
}
const saveSettings = s =>
  localStorage.setItem(KEY, JSON.stringify({ rounds: s.rounds, work: s.work, rest: s.rest }));

/**
 * A short two-tone beep. `count` blasts, so the end of a round and the end of
 * the session don't sound the same. Created per call and left to garbage
 * collect — holding an AudioContext open for a whole session gets it suspended
 * by the browser anyway.
 */
function beep(count = 1) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    for (let i = 0; i < count; i++) {
      const at = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.type = 'square';
      // A hard start and stop clicks; a 20ms ramp at each end doesn't.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    }
    setTimeout(() => ctx.close().catch(() => {}), 400 + count * 300);
  } catch { /* no audio on this device; the display still works */ }
}

export default async function timer(root) {
  let settings = loadSettings();

  // Phase state. `endsAt` is a wall-clock ms deadline — see the note up top.
  let phase = 'idle';        // idle | work | rest | done
  let round = 1;
  let endsAt = 0;
  let remaining = settings.work;
  let raf = null;
  let wakeLock = null;

  const bigTime = h('div.t-time', clock(settings.work));
  const phaseLabel = h('div.t-phase', 'Ready');
  const roundLabel = h('div.t-round', `Round 1 of ${settings.rounds}`);
  const ring = h('div.t-ring-fill');
  const startBtn = h('button.btn.primary.wide.cta', { type: 'button' }, icon('play'), 'Start');
  const resetBtn = h('button.btn', { type: 'button' }, 'Reset');
  const stage = h('div.t-stage', h('div.t-ring', ring), bigTime, phaseLabel, roundLabel);

  // Keep the screen on while a round runs. Not supported everywhere, and it is
  // released the moment the tab is hidden, so re-request on the way back.
  const holdScreen = async () => {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* fine */ }
  };
  const releaseScreen = () => { wakeLock?.release?.().catch(() => {}); wakeLock = null; };
  const onVisible = () => { if (document.visibilityState === 'visible' && phase !== 'idle' && phase !== 'done') holdScreen(); };
  document.addEventListener('visibilitychange', onVisible);

  const total = () => (phase === 'rest' ? settings.rest : settings.work);

  const paint = () => {
    bigTime.textContent = clock(remaining);
    const span = total();
    const done = span ? 1 - Math.max(0, remaining) / span : 0;
    ring.style.setProperty('--t-progress', String(Math.min(1, Math.max(0, done))));
    stage.classList.toggle('is-rest', phase === 'rest');
    stage.classList.toggle('is-done', phase === 'done');
    roundLabel.textContent = phase === 'done'
      ? `${settings.rounds} ${settings.rounds === 1 ? 'round' : 'rounds'} done`
      : `Round ${Math.min(round, settings.rounds)} of ${settings.rounds}`;
    phaseLabel.textContent =
      phase === 'work' ? 'Roll' : phase === 'rest' ? 'Rest' : phase === 'done' ? 'Finished' : 'Ready';
  };

  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; };

  const tick = () => {
    remaining = (endsAt - Date.now()) / 1000;
    if (remaining <= 0) { advance(); return; }
    paint();
    raf = requestAnimationFrame(tick);
  };

  const begin = (nextPhase, seconds) => {
    phase = nextPhase;
    remaining = seconds;
    endsAt = Date.now() + seconds * 1000;
    paint();
    stop();
    raf = requestAnimationFrame(tick);
  };

  const advance = () => {
    stop();
    if (phase === 'work') {
      if (round >= settings.rounds) {
        phase = 'done';
        remaining = 0;
        beep(3);
        releaseScreen();
        startBtn.replaceChildren(icon('play'), 'Start again');
        paint();
        return;
      }
      beep(1);
      begin('rest', settings.rest);
    } else {
      round++;
      beep(2);
      begin('work', settings.work);
    }
  };

  const reset = () => {
    stop();
    releaseScreen();
    phase = 'idle';
    round = 1;
    remaining = settings.work;
    startBtn.replaceChildren(icon('play'), 'Start');
    paint();
  };

  startBtn.addEventListener('click', () => {
    if (phase === 'work' || phase === 'rest') {          // pause
      stop();
      remaining = (endsAt - Date.now()) / 1000;
      phase = phase === 'work' ? 'paused-work' : 'paused-rest';
      startBtn.replaceChildren(icon('play'), 'Resume');
      releaseScreen();
      return;
    }
    if (phase === 'paused-work' || phase === 'paused-rest') {
      const resumed = phase === 'paused-work' ? 'work' : 'rest';
      startBtn.replaceChildren(icon('pause'), 'Pause');
      holdScreen();
      begin(resumed, remaining);
      return;
    }
    // idle or done — a fresh session. The first beep also unlocks audio, which
    // mobile browsers only allow from inside a user gesture.
    round = 1;
    beep(1);
    holdScreen();
    startBtn.replaceChildren(icon('pause'), 'Pause');
    begin('work', settings.work);
  });

  resetBtn.addEventListener('click', reset);

  // --- setup ---------------------------------------------------------------

  let paintPresets = null;

  const numberField = (label, value, min, max, onChange) => {
    const input = h('input', {
      type: 'number', value: String(value), min: String(min), max: String(max), inputMode: 'numeric',
    });
    input.addEventListener('change', () => {
      const n = Math.min(max, Math.max(min, Number(input.value) || min));
      input.value = String(n);
      onChange(n);
    });
    return h('div.t-field', h('label.field-label', label), input);
  };

  const applySettings = () => {
    saveSettings(settings);
    if (phase === 'idle') remaining = settings.work;
    paint();
    paintPresets?.();
  };

  const samePreset = preset =>
    preset.rounds === settings.rounds && preset.work === settings.work && preset.rest === settings.rest;

  const presetRow = h('div.seg.t-presets', PRESETS.map(preset => {
    const btn = h('button', { type: 'button', 'aria-pressed': String(samePreset(preset)) }, preset.label);
    btn.addEventListener('click', () => {
      settings = { ...preset };
      round = 1;
      stop();
      phase = 'idle';
      startBtn.replaceChildren(icon('play'), 'Start');
      remaining = settings.work;
      applySettings();
      renderFields();
    });
    return btn;
  }));

  const fields = h('div.t-fields');
  const renderFields = () => fields.replaceChildren(
    numberField('Rounds', settings.rounds, 1, 30, n => { settings.rounds = n; applySettings(); }),
    numberField('Round (min)', Math.round(settings.work / 60), 1, 60, n => { settings.work = n * 60; applySettings(); }),
    numberField('Rest (sec)', settings.rest, 0, 300, n => { settings.rest = n; applySettings(); }));
  renderFields();

  // A hand-typed setup matches no preset, and that is a legitimate state — the
  // row simply shows none of them pressed rather than lying about which is on.
  paintPresets = () => {
    for (let i = 0; i < presetRow.children.length; i++) {
      presetRow.children[i].setAttribute('aria-pressed', String(samePreset(PRESETS[i])));
    }
  };

  // The router clears #view on navigation, which orphans the rAF loop and the
  // wake lock. Nothing else tears this down, so hang the cleanup off the node
  // itself and watch for it leaving the document.
  const observer = new MutationObserver(() => {
    if (!root.contains(stage)) {
      stop();
      releaseScreen();
      document.removeEventListener('visibilitychange', onVisible);
      observer.disconnect();
    }
  });
  observer.observe(root, { childList: true });

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Round timer'),
        h('p.page-sub', 'Rounds, rest and a beep you can hear over the mat'))),
    h('section.card.t-card', stage,
      h('div.btn-row', { style: 'margin-top:18px' }, startBtn),
      h('div.btn-row', resetBtn)),
    card('Setup', presetRow, fields,
      h('p.small.muted', { style: 'margin-top:10px' },
        'Kept on this device. The screen stays awake while a round is running.')),
    h('div.btn-row', h('a.small.muted', { href: '#/' }, '‹ Home')));

  paint();
  if (!window.AudioContext && !window.webkitAudioContext) {
    toast('No audio on this browser — the timer still counts');
  }
}
