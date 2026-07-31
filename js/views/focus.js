// "Working on" — the things you're drilling, as flashcards.
//
// Each card has a front (the thing) and an optional back (your cues / notes).
// Tap the card to flip it, then say how it went — and that answer decides when
// the card comes back. Until v17 the deck had no scheduler at all: every card
// was equally likely, forever, so the cue you had nailed came round exactly as
// often as the one you keep forgetting. The scheduling lives in js/srs.js,
// which is pure arithmetic and unit-tested.
//
// The data is still the same list in settings (device-local, like the rest of
// the focus feature; it does not sync), with each card now carrying its own
// { ease, interval, due, reps }.

import { h, empty, icon, toast, card as cardEl, fmtDate } from '../ui.js';
import * as store from '../store.js';
import * as srs from '../srs.js';

// One flippable card. `card` is { front, back }; flipping is local view state.
function flashcard(card, onFlip) {
  const inner = h('div.fc-inner',
    h('div.fc-face', h('div.fc-text', card.front)),
    h('div.fc-face.fc-back',
      card.back ? h('div.fc-text', card.back) : empty('No cues yet — tap Edit to add some.')));

  const el = h('button.flashcard', {
    type: 'button',
    'aria-label': `Flashcard: ${card.front}. Tap to flip.`,
    onclick: () => {
      el.classList.toggle('flipped');
      if (el.classList.contains('flipped')) onFlip?.();
    },
  }, inner);
  return el;
}

/**
 * The review session: the cards that are due, one at a time.
 *
 * The rating buttons stay hidden until the card is flipped — grading a card you
 * haven't tried to recall is just clicking. Each button carries when the card
 * would next come back, so the choice is informed rather than a guess at what
 * "Good" is supposed to mean.
 */
function reviewer(cards, mount, { onDone, onIndex, today }) {
  let i = 0;

  const render = () => {
    if (i >= cards.length) { onDone(); return; }
    const card = cards[i];

    const rate = async grade => {
      await store.reviewFocus(card.front, grade, today);
      // "Again" keeps the card in play — it goes to the back of this session's
      // queue rather than disappearing until tomorrow, which is the entire
      // point of admitting you blanked on it.
      if (grade === 'again') cards.push(card);
      i++;
      render();
    };

    const buttons = h('div.fc-grade', { hidden: true },
      srs.GRADES.map(([grade, label]) =>
        h('button.btn.small.fc-g-' + grade, { type: 'button', onclick: () => rate(grade) },
          h('span.g-label', label),
          h('span.g-when', srs.preview(card, grade, today)))));

    const top = h('div.deck-top',
      h('div.deck-rail', { role: 'img', 'aria-label': `Card ${i + 1} of ${cards.length} due` },
        h('i', { style: `width:${((i + 1) / cards.length) * 100}%` })),
      h('span.fc-count', `${i + 1} / ${cards.length}`));

    mount.replaceChildren(top,
      h('div.fc-stage', flashcard(card, () => { buttons.hidden = false; })),
      h('p.fc-hint', 'Tap the card to flip, then say how it went'),
      buttons);
    onIndex?.(card.front);
  };

  render();
}

/** Browse mode: no grading, just step through the whole deck. */
function browser(cards, mount, onIndex) {
  let i = 0;
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
    mount.replaceChildren(top, h('div.fc-stage', flashcard(cards[i])),
      h('p.fc-hint', 'Tap the card to flip'), nav);
    onIndex?.(cards[i].front);
  };
  render();
}

// The editor: add a card (front required, back optional) and remove existing
// ones. Any change persists and re-renders the whole view so the deck stays in
// step with the list.
function editor(cards, rerender, today) {
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

  // Each row shows when its card is next due, so the schedule is something you
  // can see rather than something the app does to you behind the deck.
  const rows = cards.map(c =>
    h('li',
      h('span.fc-list-front', c.front),
      h('span.fc-due' + (!c.due || c.due <= today ? '.is-due' : ''),
        !c.due ? 'new' : c.due <= today ? 'due' : fmtDate(c.due)),
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

  const mark = frontText => rows.forEach((row, n) => {
    row.querySelector('.now-badge').hidden = cards[n]?.front !== frontText;
  });

  return { el, mark };
}

export default async function focus(root) {
  const today = store.todayISO();
  const cards = await store.getFocuses();
  const due = store.dueFocuses(cards, today);
  const rerender = () => focus(clearThen(root));

  root.append(
    h('div.page-head',
      h('div',
        h('h1.page-title', 'Working on'),
        h('p.page-sub', due.length
          ? `${due.length} ${due.length === 1 ? 'card' : 'cards'} due — flip it, then rate it`
          : 'Your flashcards — tap to flip, step through to drill'))));

  const panel = editor(cards, rerender, today);

  if (!cards.length) {
    root.append(empty('No flashcards yet. Add the first thing you want to drill below.'));
    root.append(panel.el);
    return;
  }

  const mount = h('div.deck');
  root.append(mount);

  if (due.length) {
    reviewer([...due], mount, {
      today,
      onIndex: front => panel.mark(front),
      onDone: () => {
        // Nothing left due. Say so — and leave the whole deck browsable, because
        // finishing a review shouldn't lock you out of your own notes.
        mount.replaceChildren(cardEl(null,
          h('p.fc-clear', icon('cards'), 'All caught up'),
          h('p.small.muted', { style: 'text-align:center' },
            'Nothing else due today. The full deck is below for another pass.')));
        const browseMount = h('div.deck');
        mount.after(browseMount);
        browser(cards, browseMount, front => panel.mark(front));
      },
    });
  } else {
    const next = [...cards].sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0];
    root.append(cardEl(null,
      h('p.fc-clear', icon('cards'), 'Nothing due today'),
      h('p.small.muted', { style: 'text-align:center' },
        next?.due ? `Next card comes back ${fmtDate(next.due)}.` : 'Add a card to start.')));
    browser(cards, mount, front => panel.mark(front));
  }

  root.append(panel.el);
}

// Small helper: clear the view before a re-render, returning it so focus() can
// be called with the emptied node.
function clearThen(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
