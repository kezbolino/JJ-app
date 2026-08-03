// Tiny DOM helpers. No framework — this app has to run from a static file
// host with no build step, on a phone, offline.

import { POSITION_BY_ID, ROLE_LABEL } from './ontology.js';
import { monthGrid, monthLabel, DAY_NAMES } from './dates.js';

/**
 * h('div.card', {onclick}, 'text', childNode)
 * Strings become text nodes, never HTML — user content is never parsed.
 */
export function h(spec, attrs = null, ...children) {
  const [tagName, ...classes] = spec.split('.');
  const el = document.createElement(tagName || 'div');
  if (classes.length) el.className = classes.join(' ');

  if (attrs && (attrs.nodeType || typeof attrs === 'string' || Array.isArray(attrs))) {
    children.unshift(attrs);
  } else if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className += ' ' + value;
      else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
      else el.setAttribute(key, value);
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(node) { while (node.firstChild) node.firstChild.remove(); return node; }

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = h('div.toast', message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

export function card(title, ...children) {
  return h('section.card', title && h('div.card-title', title), ...children);
}

export function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function tagLabel(tag) {
  if (tag.kind === 'concept') return tag.concept;
  const pos = POSITION_BY_ID[tag.position];
  const technique = tag.technique && pos?.techniques.find(t => t.id === tag.technique);
  return technique ? technique.label : (pos?.label ?? tag.position);
}

/**
 * A tag chip.
 *   onRemove — an × that takes it off this entry
 *   onAdd    — the whole chip becomes tappable, to accept a suggestion
 *   onMute   — an × that teaches the app to stop suggesting this word at all
 */
export function tagChip(tag, { onRemove, onAdd, onMute } = {}) {
  const isConcept = tag.kind === 'concept';
  const parts = [tagLabel(tag)];
  if (!isConcept) {
    const pos = POSITION_BY_ID[tag.position];
    const bits = [];
    if (tag.technique && pos) bits.push(pos.label);
    if (tag.role) bits.push(ROLE_LABEL[tag.role] ?? tag.role);
    if (bits.length) parts.push(h('span.role', bits.join(' · ')));
  }
  // The label is the tap target when adding, so the mute × has to stop the
  // click from bubbling up into "accept".
  const mute = onMute && h('button.mute', {
    onclick: event => { event.stopPropagation(); event.preventDefault(); onMute(); },
    'aria-label': `Never suggest ${tagLabel(tag)}`,
    title: 'Wrong — stop suggesting this word',
  }, '⊘');

  return h(
    'span.tag' + (isConcept ? '.concept' : '') + (onAdd ? '.suggest' : ''),
    onAdd ? { onclick: onAdd, role: 'button', tabindex: 0 } : null,
    ...parts,
    onRemove && h('button', { onclick: onRemove, 'aria-label': `Remove ${tagLabel(tag)}` }, '×'),
    onAdd && h('span.role', '+'),
    mute
  );
}

export function giFlag(gi) {
  if (!gi) return null;
  return h('span.gi-flag', gi === 'nogi' ? 'No-gi' : 'Gi');
}

export function empty(message) { return h('p.empty', message); }

/**
 * Twenty discrete cells, filled from a real percentage — the honest replacement
 * for a bar whose length you have to eyeball. The label carries the number, so
 * colour and length are never the only carrier.
 *
 * Cells reveal in a short stagger rather than animating a width, because a
 * growing bar reads as a value changing when nothing has changed.
 */
export function tally(pct, label) {
  const CELLS = 20;
  const on = Math.round((Math.max(0, Math.min(100, pct)) / 100) * CELLS);
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    cells.push(h('span.tally__c' + (i < on ? '.is-on' : ''),
      { style: `animation-delay:${(i * 18) / 1000}s` }));
  }
  return h('div.tally', { role: 'img', 'aria-label': label }, cells);
}

/**
 * A month of training days.
 *
 * One cell per day, filled if a class is logged. This is the honest half of the
 * app — attendance is a fact, so unlike coverage it needs no hedging and says
 * something real from week one. Gi and no-gi are drawn differently so the grid
 * carries two facts without a legend fight; a day with both is marked as both.
 *
 * `index` is a Map from `store.trainingIndex()`. `today` is passed in rather
 * than read here so the grid renders identically in a test.
 */
export function monthCalendar(ym, index, { today = '', onPick = null, showMonth = true } = {}) {
  const cells = monthGrid(ym).map(date => {
    if (!date) return h('span.cal__pad');

    const day = index.get(date);
    const n = Number(date.slice(8));
    const classes = ['cal__day'];
    if (day) {
      classes.push('is-on');
      if (day.gi && day.nogi) classes.push('is-both');
      else if (day.nogi) classes.push('is-nogi');
    }
    if (date === today) classes.push('is-today');

    const label = day
      ? `${date}: ${day.count} ${day.count === 1 ? 'class' : 'classes'}`
      : `${date}: nothing logged`;

    // A day with something in it is a link into that entry; an empty day is
    // inert, not an invitation to backfill a class that never happened.
    if (day && onPick) {
      return h('a.' + classes.join('.'), { href: onPick(day), title: label, 'aria-label': label }, String(n));
    }
    return h('span.' + classes.join('.'), { title: label, 'aria-label': label }, String(n));
  });

  // The month name is optional: on the flipped hero it already sits in the
  // header between the two arrows, and repeating it inside the grid just
  // crowds a card that has a fixed height to live within.
  return h('div.cal',
    showMonth ? h('div.cal__month', monthLabel(ym)) : null,
    h('div.cal__grid',
      DAY_NAMES.map(d => h('span.cal__dow', d.slice(0, 1))),
      cells));
}

/** The adult belt ranks, in order. Equal-weight now — see brandMark() below. */
export const BELT_RANKS = ['white', 'blue', 'purple', 'brown', 'black'];

/**
 * Glyph layout for the JUJI wordmark, precomputed once at design time rather
 * than measured at runtime (see CLAUDE.md's v25 session log entry for how):
 * Nunito bold, -0.035em tracking, each character's x/width as a fraction of
 * font-size. The uppercase U is compressed to 85% of its natural width —
 * unscaled, Nunito's U runs more than double the advance width of J or I at
 * this weight and reads as noticeably fatter than the rest of the word.
 * Fixed to Nunito regardless of the user's App-font setting (Settings →
 * Appearance): this is the brand mark, not body text, same as the app icon.
 */
const WORDMARK_GLYPHS = [
  { ch: 'J', x: 0,          w: 0.31906250 },
  { ch: 'U', x: 0.31895833, w: 0.57640625, compressed: true },
  { ch: 'J', x: 0.89526042, w: 0.31906250 },
  { ch: 'I', x: 1.21421875, w: 0.24708333 },
];
const WORDMARK_WIDTH_EM = 1.46130208;
const WORDMARK_ASCENT_EM = 1.01333333;  // -bbox.y / fontSize, baseline to top
const WORDMARK_HEIGHT_EM = 1.36666667;  // bbox.height / fontSize

const WORDMARK_FONT_SIZE = 32;
const WORDMARK_PILL_GAP = WORDMARK_FONT_SIZE * (3 / 29);
const WORDMARK_PILL_H = WORDMARK_FONT_SIZE * (6 / 29);
const WORDMARK_PILL_RADIUS = WORDMARK_PILL_H * 0.2;
const WORDMARK_MARGIN_TOP = WORDMARK_FONT_SIZE * (7 / 29);

/** svg('text', {x,y,...}) — the SVG-namespace sibling of h(), text content only. */
function svgText(attrs, text) {
  const t = document.createElementNS(SVG_NS, 'text');
  for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v);
  t.textContent = text;
  return t;
}

function wordmarkSvg() {
  const svgW = WORDMARK_FONT_SIZE * WORDMARK_WIDTH_EM;
  const svgH = WORDMARK_FONT_SIZE * WORDMARK_HEIGHT_EM;
  const baselineY = WORDMARK_FONT_SIZE * WORDMARK_ASCENT_EM;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'wordmark-svg');

  for (const g of WORDMARK_GLYPHS) {
    const attrs = {
      x: g.x * WORDMARK_FONT_SIZE, y: baselineY,
      'font-size': WORDMARK_FONT_SIZE, 'font-weight': 700,
      'font-family': 'Nunito, sans-serif',
    };
    if (g.compressed) {
      attrs.textLength = g.w * WORDMARK_FONT_SIZE;
      attrs.lengthAdjust = 'spacingAndGlyphs';
    }
    svg.append(svgText(attrs, g.ch));
  }
  return svg;
}

/**
 * The brand device: the JUJI wordmark over five equal belt-rank pills.
 *
 * Pass a `standing` from `store.beltStanding()` and the pills stop being
 * decoration: the ranks up to and including yours are drawn in full, the
 * ones after are held back. It shows the rank you told the app you were
 * given — nothing here estimates a rank or marks progress *through* a belt,
 * because how far along you are is not something an app can know.
 */
export function brandMark(standing = null) {
  const reached = standing ? BELT_RANKS.findIndex(rank => rank === standing.rank) : -1;
  const aria = reached >= 0
    ? `Belt ranks. Yours: ${standing.rank}, awarded ${standing.date}.`
    : `Belt ranks: ${BELT_RANKS.join(', ')}`;

  const pillW = (WORDMARK_FONT_SIZE * WORDMARK_WIDTH_EM - WORDMARK_PILL_GAP * (BELT_RANKS.length - 1)) / BELT_RANKS.length;

  return h('div.brand-mark',
    h('h1.brand-jj', { 'aria-label': 'Ju Ji' }, wordmarkSvg()),
    h('div.belt' + (reached >= 0 ? '.is-ranked' : ''), {
      role: 'img', 'aria-label': aria, style: `gap:${WORDMARK_PILL_GAP}px; margin-top:${WORDMARK_MARGIN_TOP}px`,
    },
      BELT_RANKS.map((rank, i) => h('i.belt-' + rank + (reached >= 0 && i > reached ? '.is-future' : ''), {
        style: `width:${pillW}px; height:${WORDMARK_PILL_H}px; border-radius:${WORDMARK_PILL_RADIUS}px`,
        title: reached >= 0 && i === reached ? `${rank} — your rank since ${standing.date}` : rank,
      }))));
}

// ---- inline SVG icons ------------------------------------------------------
// App-authored, static markup — never built from user content. Drawn with the
// SVG namespace because document.createElement (what h() uses) can't make SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';

const SHAPES = {
  user:     [['circle', 12, 8.5, 3.6], ['path', 'M5.5 19.5a6.5 6.5 0 0 1 13 0']],
  pin:      [['path', 'M12 21s6.5-5.8 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.2 6.5 11 6.5 11Z'], ['circle', 12, 10, 2.3]],
  calendar: [['rect', 4, 5, 16, 15, 2], ['line', 4, 10, 20, 10], ['line', 8, 3, 8, 7], ['line', 16, 3, 16, 7]],
  search:   [['circle', 11, 11, 7], ['line', 16.5, 16.5, 21, 21]],
  video:    [['rect', 3, 6, 13, 12, 2], ['path', 'M16 10.5 21 8v8l-5-2.5Z']],
  chevron:  [['path', 'M9 6l6 6-6 6']],
  plus:     [['line', 12, 5, 12, 19], ['line', 5, 12, 19, 12]],
  cloud:    [['path', 'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18H7Z']],
  edit:     [['path', 'M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5 17v3Z'], ['line', 14, 6, 18, 10]],
  star:     [['path', 'M12 3.6l2.47 5 5.53.8-4 3.9.94 5.5L12 16.2 7.06 18.8 8 13.3l-4-3.9 5.53-.8z']],
  mic:      [['rect', 9, 3, 6, 11, 3], ['path', 'M5 11a7 7 0 0 0 14 0'], ['line', 12, 18, 12, 21], ['line', 8, 21, 16, 21]],
  trash:    [['path', 'M6 7h12'], ['path', 'M9 7V5h6v2'], ['path', 'M7 7l1 13h8l1-13'], ['line', 10.5, 10.5, 10.5, 16.5], ['line', 13.5, 10.5, 13.5, 16.5]],
  undo:     [['path', 'M4 9h10a5 5 0 0 1 0 10h-4'], ['path', 'M7.5 5.5 4 9l3.5 3.5']],
  flame:    [['path', 'M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.7.8-3.2 1.7-4.3.3 1.2 1 2 1.8 2.3C10.2 8.4 12 6.2 12 3Z']],
  // A stack of cards, for the deck.
  cards:    [['rect', 4, 7, 12, 13, 2], ['path', 'M8 5h9a2 2 0 0 1 2 2v10']],
  // A cog: eight teeth around a hub. Drawn as one path so the stroke joins
  // cleanly at this size — the primitives would leave gaps between the teeth.
  gear:     [['circle', 12, 12, 3.1],
             ['path', 'M12 2.4l1.5 2.2a7.6 7.6 0 0 1 2 .83l2.5-.7 1.06 1.84-1.8 1.9c.2.66.32 1.35.34 2.05l2.4 1.08v2.12l-2.4 1.08a7.6 7.6 0 0 1-.34 2.05l1.8 1.9-1.06 1.84-2.5-.7c-.62.36-1.3.64-2 .83L12 21.6l-1.5-2.2a7.6 7.6 0 0 1-2-.83l-2.5.7-1.06-1.84 1.8-1.9a7.6 7.6 0 0 1-.34-2.05L4 12.4v-2.12l2.4-1.08c.02-.7.14-1.39.34-2.05l-1.8-1.9L6 3.41l2.5.7c.62-.36 1.3-.64 2-.83L12 2.4Z']],
};

/** icon('search') → an <svg> node, sized by CSS (font/width). */
export function icon(name) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.8');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  for (const [kind, ...a] of SHAPES[name] ?? []) {
    if (kind === 'path') {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', a[0]);
      el.append(p);
    } else if (kind === 'circle') {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', a[0]); c.setAttribute('cy', a[1]); c.setAttribute('r', a[2]);
      el.append(c);
    } else if (kind === 'line') {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]);
      l.setAttribute('x2', a[2]); l.setAttribute('y2', a[3]);
      el.append(l);
    } else if (kind === 'rect') {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', a[0]); r.setAttribute('y', a[1]);
      r.setAttribute('width', a[2]); r.setAttribute('height', a[3]);
      if (a[4] != null) r.setAttribute('rx', a[4]);
      el.append(r);
    }
  }
  return el;
}

/** A "Title            action ›" row used above lists. */
export function sectionHead(title, action) {
  return h('div.section-head', h('h3', title), action || null);
}
