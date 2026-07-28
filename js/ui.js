// Tiny DOM helpers. No framework — this app has to run from a static file
// host with no build step, on a phone, offline.

import { POSITION_BY_ID, ROLE_LABEL } from './ontology.js';

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
