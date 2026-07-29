// "Working on" — the things you're drilling, as flashcards.
//
// Each card has a front (the thing) and an optional back (your cues / notes).
// Tap the card to flip it; step through the deck to review, the way you'd
// drill. This is the front door's focus list turned into something you study,
// not just a banner — but the data is the same { front, back } list in settings
// (device-local, like the rest of the focus feature; it does not sync).

import { h, empty, icon, toast } from '../ui.js';
import * as store from '../store.js';

// One flippable card. `card` is { front, back }; flipping is local view state.
function flashcard(card) {
  const inner = h('div.fc-inner',
    h('div.fc-face.fc-front', h('div.fc-text', card.front)),
    h('div.fc-face.fc-back',
      card.back ? h('div.fc-text', card.back) : empty('No cues yet — tap Edit to add some.')));

  const el = h('button.flashcard', {
    type: 'button',
    'aria-label': `Flashcard: ${card.front}. Tap to flip.`,
    onclick: () => el.classList.toggle('flipped'),
  }, inner);
  return el;
}

// The deck: one card at a time, with prev/next and a position counter. Kept as
// its own function so the render can be swapped in place without a full reload.
function deck(cards, mount) {
  let i = 0;
  const render = () => {
    i = Math.max(0, Math.min(i, cards.length - 1));
    const card = cards[i];
    const stage = h('div.fc-stage', flashcard(card));
    const nav = h('div.fc-nav',
      h('button.fc-arrow', {
        type: 'button', 'aria-label': 'Previous',
        disabled: i === 0, onclick: () => { i--; render(); },
      }, '‹'),
      h('span.fc-count', `${i + 1} / ${cards.length}`),
      h('button.fc-arrow', {
        type: 'button', 'aria-label': 'Next',
        disabled: i === cards.length - 1, onclick: () => { i++; render(); },
      }, '›'));
    mount.replaceChildren(stage, h('p.fc-hint', 'Tap the card to flip'), nav);
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
    await store.setFocuses(cards.filter(c => c !== card));
    rerender();
  };

  const list = cards.length
    ? h('ul.fc-list', cards.map(c =>
        h('li',
          h('span.fc-list-front', c.front),
          h('button', {
            type: 'button', 'aria-label': `Remove ${c.front}`, onclick: () => remove(c),
          }, '×'))))
    : null;

  return h('section.card',
    h('div.card-title', 'Edit deck'),
    list,
    h('label', 'New card'),
    front,
    back,
    h('div.btn-row', h('button.btn.primary', { type: 'button', onclick: add }, icon('plus'), 'Add card')));
}

export default async function focus(root) {
  const cards = await store.getFocuses();
  const rerender = () => focus(clearThen(root));

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Working on'),
        h('p.page-sub', 'Your flashcards — tap to flip, swipe through to drill'))));

  if (cards.length) {
    const mount = h('div.deck');
    root.append(mount);
    deck(cards, mount);
  } else {
    root.append(empty('No flashcards yet. Add the first thing you want to drill below.'));
  }

  root.append(editor(cards, rerender));
}

// Small helper: clear the view before a re-render, returning it so focus() can
// be called with the emptied node.
function clearThen(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
