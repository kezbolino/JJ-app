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

// One flippable card. `card` is { front, back }; flipping is local view state.
function flashcard(card) {
  const inner = h('div.fc-inner',
    h('div.fc-face', h('div.fc-text', card.front)),
    h('div.fc-face.fc-back',
      card.back ? h('div.fc-text', card.back) : empty('No cues yet — tap Edit to add some.')));

  const el = h('button.flashcard', {
    type: 'button',
    'aria-label': `Flashcard: ${card.front}. Tap to flip.`,
    onclick: () => el.classList.toggle('flipped'),
  }, inner);
  return el;
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

    mount.replaceChildren(top, stage, h('p.fc-hint', 'Tap the card to flip · swipe for the next'), nav);
    onIndex?.(i);
  };

  render();
}

// The editor: add a card (front required, back optional) and remove existing
// ones. Any change persists and re-renders the whole view so the deck stays in
// step with the list.
function editor(cards, rerender) {
  const front = h('input', { type: 'text', placeholder: 'What are you working on?', maxLength: 60 });
  const back = h('textarea', { placeholder: 'Cues, details, reminders… (optional)', maxLength: 400 });

  const add = async () => {
    const f = front.value.trim();
    if (!f) return;
    if (cards.some(c => c.front.toLowerCase() === f.toLowerCase())) {
      toast('Already on the list');
      return;
    }
    await store.setFocuses([...cards, { front: f, back: back.value.trim() }]);
    rerender();
  };

  const remove = async card => {
    await store.setFocuses(cards.filter(c => c.front !== card.front));
    rerender();
  };

  const rows = cards.map(c =>
    h('li',
      h('span.fc-list-front', c.front),
      h('span.now-badge', { hidden: true }, 'Now'),
      h('button', {
        type: 'button', 'aria-label': `Remove ${c.front}`, onclick: () => remove(c),
      }, '×')));

  const el = h('section.card',
    h('div.card-title', 'Edit deck'),
    rows.length ? h('ul.fc-list', rows) : null,
    h('label', 'New card'),
    front,
    back,
    h('div.btn-row', h('button.btn.primary', { type: 'button', onclick: add }, icon('plus'), 'Add card')));

  const mark = i => rows.forEach((row, n) => {
    row.querySelector('.now-badge').hidden = n !== i;
  });

  return { el, mark };
}

export default async function focus(root, { card } = {}) {
  const cards = await store.getFocuses();
  const rerender = () => focus(clearThen(root), { card });

  // `?card=N` comes from tapping a tile on Home.
  const start = Number.isFinite(Number(card)) ? Number(card) : 0;

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Working on'),
        h('p.page-sub', 'Your flashcards — tap to flip, swipe through to drill'))));

  const panel = editor(cards, rerender);

  if (!cards.length) {
    root.append(empty('No flashcards yet. Add the first thing you want to drill below.'));
    root.append(panel.el);
    return;
  }

  const mount = h('div.deck');
  root.append(mount);
  deck(cards, mount, { start, onIndex: i => panel.mark(i) });
  root.append(panel.el);
}

// Small helper: clear the view before a re-render, returning it so focus() can
// be called with the emptied node.
function clearThen(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
