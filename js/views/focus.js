// "Working on" — the things you're drilling, as flashcards.
//
// Each card has a front (the thing) and an optional back (your cues / notes).
// Tap the card to flip it; step through the deck to review, the way you'd
// drill. The data is a { front, back } list in settings, and it syncs to the
// backup repo as of v46 (js/appstate.js): last write wins on the whole deck,
// so removing a card reaches your other device instead of coming back.
//
// v20 removed the Again/Good/Easy rating that used to follow each flip, and
// the SM-2 scheduler behind it. Drilling is not a memory test: you already
// know which things you're bad at, which is why you wrote them down. The deck
// is now what it looks like — a short stack you flick through — and Home shows
// the same cards as tiles, so most of the time you never need this page at all.

import { h, empty, icon, toast } from '../ui.js';
import * as store from '../store.js';

// One card: the thing on top, your cues underneath. Both visible at once.
//
// This flipped until v55 — tap the front, `rotateY(180deg)`, cues on the back.
// The flip was the wrong shape for what the deck is actually for: you open it
// to *read* your cues, so the interesting half was always one tap away and
// behind an animation. A flashcard hides the answer because it is testing you,
// and v20 already removed the grading that made this a test. Nothing was
// grading it, so nothing needed hiding.
function flashcard(card) {
  return h('div.flashcard',
    h('div.fc-text', card.front),
    card.back
      ? h('div.fc-cues', card.back)
      : empty('No cues yet — add them in Edit deck below.'));
}

/**
 * The deck: one card at a time, with a progress rail, a counter and a prev/next
 * pair. `start` is the card to open on, so a tile tapped on Home lands on the
 * card you actually tapped rather than back at the beginning.
 */
function deck(cards, mount, { onIndex, start = 0 } = {}) {
  let i = Math.max(0, Math.min(start, cards.length - 1));

  const render = () => {
    i = Math.max(0, Math.min(i, cards.length - 1));
    const top = h('div.deck-top',
      h('div.deck-rail', { role: 'img', 'aria-label': `Card ${i + 1} of ${cards.length}` },
        h('i', { style: `width:${((i + 1) / cards.length) * 100}%` })),
      h('span.fc-count', `${i + 1} / ${cards.length}`));
    const nav = h('div.fc-nav',
      h('button.fc-arrow', {
        type: 'button', 'aria-label': 'Previous', disabled: i === 0,
        onclick: () => { i--; render(); },
      }, '‹'),
      h('button.fc-arrow', {
        type: 'button', 'aria-label': 'Next', disabled: i === cards.length - 1,
        onclick: () => { i++; render(); },
      }, '›'));

    const stage = h('div.fc-stage', flashcard(cards[i]));

    // Swipe the card itself, the same gesture the Home tiles use. Horizontal
    // only — otherwise scrolling the page past the deck would change the card.
    let x0 = null, y0 = null;
    stage.addEventListener('touchstart', e => {
      const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
    }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = y0 = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      i += dx < 0 ? 1 : -1;
      render();
    }, { passive: true });

    mount.replaceChildren(top, stage, h('p.fc-hint', 'Swipe, or use the arrows, for the next card'), nav);
    onIndex?.(i);
  };

  render();
}

/**
 * Drag a row to reorder, with the pointer or the keyboard.
 *
 * Pointer Events rather than touch handlers, and `touch-action: none` **on the
 * grip only** — that is what stops the page scrolling under your finger while
 * you drag, without disabling scrolling anywhere else in the list. The grip
 * captures the pointer on the way down, so the drag survives the finger leaving
 * the 38px handle, which is otherwise the thing that makes a hand-rolled drag
 * feel broken.
 *
 * Rows are measured once, at pointerdown. Nothing re-measures mid-drag: the
 * others are moved with a transform, so their real boxes never change, and a
 * layout read inside a pointermove is what turns a smooth drag into a stutter.
 * Heights are read per row rather than assumed equal — a long front wraps to two
 * lines, and an expanded editor panel makes its row several times taller.
 */
function dragReorder(list, rows, onDrop) {
  let drag = null;

  const begin = (event, from) => {
    if (rows.length < 2) return;
    event.preventDefault();
    const boxes = rows.map(r => r.getBoundingClientRect());
    drag = { from, to: from, y0: event.clientY, boxes, row: rows[from], h: boxes[from].height };
    drag.row.classList.add('is-dragging');
    list.classList.add('is-reordering');
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const during = event => {
    if (!drag) return;
    const dy = event.clientY - drag.y0;
    drag.row.style.transform = `translateY(${dy}px)`;

    // Where the dragged row's middle now sits, against where everyone else's
    // middle started. Only one of these two walks can run.
    const mid = drag.boxes[drag.from].top + drag.h / 2 + dy;
    let to = drag.from;
    while (to < rows.length - 1 && mid > drag.boxes[to + 1].top + drag.boxes[to + 1].height / 2) to++;
    while (to > 0 && mid < drag.boxes[to - 1].top + drag.boxes[to - 1].height / 2) to--;
    drag.to = to;

    // Open a gap where it would land by sliding the rows it has passed.
    rows.forEach((row, i) => {
      if (i === drag.from) return;
      const shift = (drag.from < to && i > drag.from && i <= to) ? -drag.h
        : (to < drag.from && i >= to && i < drag.from) ? drag.h
        : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };

  const finish = () => {
    if (!drag) return;
    const { from, to } = drag;
    for (const row of rows) { row.style.transform = ''; row.classList.remove('is-dragging'); }
    list.classList.remove('is-reordering');
    drag = null;
    if (to !== from) onDrop(from, to);
  };

  return (grip, i) => {
    grip.addEventListener('pointerdown', e => begin(e, i));
    grip.addEventListener('pointermove', during);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    // The keyboard half. A drag handle that only answers to a pointer is a
    // control some people simply cannot reach, and this is six lines.
    grip.addEventListener('keydown', e => {
      const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      if (i + dir >= 0 && i + dir < rows.length) onDrop(i, i + dir);
    });
  };
}

/**
 * The editor: add a card, reorder the deck, and change a card after the fact.
 *
 * Until v54 the only per-card control was ×. Cues could be written when a card
 * was created and never again, so "add a cue later" meant deleting the card and
 * retyping it — which also dropped it to the bottom, because a new card is
 * always appended and there was no way to move one. The card's own back face
 * has said "tap Edit to add some" since v0.2, and there was nothing to tap.
 *
 * Order is the array's order and nothing else: `normalizeFocus` returns exactly
 * { front, back } and drops anything else on read, so a card cannot carry a
 * position of its own — and it should not, because the deck order *is* the tile
 * order on Home. Moving a card is a whole-list write, which is what
 * `js/appstate.js` already syncs focuses as ('whole'), so the order travels
 * between devices for free.
 *
 * `open` is the front of the row whose panel is expanded, threaded through the
 * re-render so a save or a move does not collapse what you were working on.
 */
function editor(cards, rerender, { open = null } = {}) {
  const front = h('input', { type: 'text', placeholder: 'What are you working on?', maxLength: 60 });
  const back = h('textarea', { placeholder: 'Cues, details, reminders… (optional)', maxLength: 400 });

  const clash = (value, exceptIndex) => cards.some(
    (c, n) => n !== exceptIndex && c.front.toLowerCase() === value.toLowerCase());

  const add = async () => {
    const f = front.value.trim();
    if (!f) return;
    if (clash(f, -1)) { toast('Already on the list'); return; }
    await store.setFocuses([...cards, { front: f, back: back.value.trim() }]);
    // Land on the card you just added rather than back at the top of the deck.
    rerender({ showFront: f });
  };

  const grips = [];
  const rows = cards.map((card, i) => {
    const isOpen = open === card.front;

    const frontEdit = h('input', { type: 'text', value: card.front, maxLength: 60 });
    const backEdit = h('textarea', {
      placeholder: 'Cues, details, reminders… (optional)', maxLength: 400,
    });
    backEdit.value = card.back;

    const save = async () => {
      const f = frontEdit.value.trim();
      if (!f) { toast('A card needs a front'); return; }
      if (clash(f, i)) { toast('Already on the list'); return; }
      await store.setFocuses(cards.map((c, n) =>
        n === i ? { front: f, back: backEdit.value.trim() } : c));
      toast('Saved');
      rerender({ showFront: f });
    };

    const remove = async () => {
      await store.setFocuses(cards.filter((_, n) => n !== i));
      rerender({});
    };

    const grip = h('button.fc-grip', {
      type: 'button',
      'aria-label': `Reorder ${card.front} — drag, or use the arrow keys`,
    }, icon('grip'));
    grips.push(grip);

    const head = h('div.fc-head',
      h('button.fc-row', {
        type: 'button',
        'aria-expanded': String(isOpen),
        'aria-label': `Edit ${card.front}`,
        onclick: () => rerender({ open: isOpen ? null : card.front }),
      },
        h('span.fc-list-front', card.front),
        h('span.now-badge', { hidden: true }, 'Now'),
        icon('edit')),
      grip);

    // Delete lives in here rather than on the row. Three small targets side by
    // side on a 360px phone is a mis-tap waiting to happen, and this one is the
    // only irreversible thing on the screen — focuses are not in the 30-day
    // trash, so a card deleted by a fat thumb is gone with its cues.
    const panel = h('div.fc-edit', { hidden: !isOpen },
      h('label', 'Front'), frontEdit,
      h('label', 'Cues'), backEdit,
      h('div.btn-row',
        h('button.btn.small.primary', { type: 'button', onclick: save }, 'Save'),
        h('button.btn.small.danger', { type: 'button', onclick: remove }, 'Delete card')));

    return h('li', head, panel);
  });

  const list = h('ul.fc-list', rows);

  // Reordering is a whole-list write, which is how `js/appstate.js` already
  // syncs focuses ('whole'), so a drag travels between devices for free.
  const bind = dragReorder(list, rows, async (from, to) => {
    const next = [...cards];
    next.splice(to, 0, next.splice(from, 1)[0]);
    await store.setFocuses(next);
    // `open` is kept and the deck stays on whatever card it was showing, so
    // moving a card never yanks anything else out from under you.
    rerender({ open });
  });
  grips.forEach(bind);

  const el = h('section.card',
    h('div.card-title', 'Edit deck'),
    rows.length ? list : null,
    rows.length ? h('p.small.muted', 'Tap a card to change its cues · drag the handle to reorder the deck and the tiles on Home') : null,
    h('label', 'New card'),
    front,
    back,
    h('div.btn-row', h('button.btn.primary', { type: 'button', onclick: add }, icon('plus'), 'Add card')));

  const mark = i => rows.forEach((row, n) => {
    row.querySelector('.now-badge').hidden = n !== i;
  });

  return { el, mark };
}

export default async function focus(root, { card, open = null, showFront = null } = {}) {
  const cards = await store.getFocuses();

  // Which card the deck is showing, tracked live so a re-render triggered by
  // the editor puts you back on it instead of snapping to the top of the deck.
  let shownFront = showFront;
  const rerender = ({ open: nextOpen = null, showFront: next } = {}) =>
    focus(clearThen(root), { card, open: nextOpen, showFront: next ?? shownFront });

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Working on'),
        h('p.page-sub', 'The things you are drilling, with your cues'))));

  const panel = editor(cards, rerender, { open });

  if (!cards.length) {
    root.append(empty('No flashcards yet. Add the first thing you want to drill below.'));
    root.append(panel.el);
    return;
  }

  // A front we were following wins over `?card=N`, which is only the tile that
  // was tapped on Home and goes stale the moment the deck is reordered.
  const byFront = shownFront ? cards.findIndex(c => c.front === shownFront) : -1;
  const start = byFront >= 0 ? byFront
    : Number.isFinite(Number(card)) ? Number(card) : 0;

  const mount = h('div.deck');
  root.append(mount);
  deck(cards, mount, {
    start,
    onIndex: i => { shownFront = cards[i]?.front ?? null; panel.mark(i); },
  });
  root.append(panel.el);
}

// Small helper: clear the view before a re-render, returning it so focus() can
// be called with the emptied node.
function clearThen(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
