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
