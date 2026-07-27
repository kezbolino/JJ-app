// Log a class — the capture screen.
//
// Capture friction is the whole product: if writing this up after training is
// a chore, no data accumulates and every other feature has nothing to show.
// So: sensible defaults, nothing mandatory, tags suggested as you type.

import { h, card, toast, tagChip, empty } from '../ui.js';
import { POSITIONS, ROLES, CONCEPTS, rolesFor } from '../ontology.js';
import { suggestTags, tagKey } from '../tagger.js';
import * as store from '../store.js';

/** Gi / no-gi. Tapping the active one clears it — not every entry is a class. */
function giSelector(entry) {
  const buttons = ['gi', 'nogi'].map(value =>
    h('button', { type: 'button', value }, value === 'gi' ? 'Gi' : 'No-gi'));

  const sync = () => buttons.forEach(b =>
    b.setAttribute('aria-pressed', String(entry.gi === b.value)));

  for (const button of buttons) {
    button.addEventListener('click', () => {
      entry.gi = entry.gi === button.value ? null : button.value;
      sync();
      button.blur();
    });
  }
  sync();
  return h('div.seg', ...buttons);
}

/** Manual tag builder: position, then the roles that position actually has. */
function manualTagRow(onAdd) {
  const positionSelect = h('select',
    h('option', { value: '' }, 'Position…'),
    POSITIONS.map(p => h('option', { value: p.id }, p.label)),
    h('option', { value: '__concept' }, '— Concept —'));

  const secondSelect = h('select', { disabled: true }, h('option', 'Role…'));

  positionSelect.addEventListener('change', () => {
    const value = positionSelect.value;
    secondSelect.replaceChildren();
    secondSelect.disabled = !value;
    if (value === '__concept') {
      secondSelect.append(...CONCEPTS.map(c => h('option', { value: c }, c)));
    } else if (value) {
      secondSelect.append(
        h('option', { value: '' }, 'Whole position'),
        ...rolesFor(value).map(r => h('option', { value: r.id }, r.label)));
    }
  });

  const add = () => {
    const position = positionSelect.value;
    if (!position) return;
    if (position === '__concept') {
      if (secondSelect.value) onAdd({ kind: 'concept', concept: secondSelect.value });
    } else {
      onAdd({ kind: 'pos', position, role: secondSelect.value || null });
    }
    positionSelect.value = '';
    secondSelect.replaceChildren(h('option', 'Role…'));
    secondSelect.disabled = true;
  };

  return h('div.btn-row', positionSelect, secondSelect, h('button.btn.small', { onclick: add }, 'Add tag'));
}

export default async function log(root, { id } = {}) {
  const entry = id ? await store.getEntry(id) : store.newEntry();
  if (!entry) { root.append(empty('That entry no longer exists.')); return; }
  entry.sections ??= { techniques: '', rolling: '', thoughts: '' };

  const tagsBox = h('div.tags');
  const suggestBox = h('div.tags');

  const field = (key, placeholder) => h('textarea', {
    placeholder,
    value: entry.sections[key] ?? '',
    oninput: e => { entry.sections[key] = e.target.value; scheduleSuggest(); },
  });

  const renderTags = () => {
    tagsBox.replaceChildren(
      ...(entry.tags.length
        ? entry.tags.map(tag => tagChip(tag, {
            onRemove: () => {
              entry.tags = entry.tags.filter(t => tagKey(t) !== tagKey(tag));
              renderTags();
              renderSuggestions();
            },
          }))
        : [empty('No tags yet — type above, or add one manually.')]));
  };

  const renderSuggestions = () => {
    const have = new Set(entry.tags.map(tagKey));
    const suggestions = suggestTags(store.entryText(entry)).filter(t => !have.has(tagKey(t)));
    suggestBox.replaceChildren(
      ...(suggestions.length
        ? suggestions.map(tag => tagChip(tag, {
            onAdd: () => { entry.tags.push(tag); renderTags(); renderSuggestions(); },
          }))
        : [empty('Nothing spotted yet.')]));
  };

  let timer;
  const scheduleSuggest = () => { clearTimeout(timer); timer = setTimeout(renderSuggestions, 250); };

  const addTag = tag => {
    const have = new Set(entry.tags.map(tagKey));
    if (!have.has(tagKey(tag))) { entry.tags.push(tag); renderTags(); renderSuggestions(); }
  };

  const save = async () => {
    await store.saveEntry(entry);
    toast(id ? 'Updated' : 'Logged');
    location.hash = '#/';
  };

  const remove = async () => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await store.deleteEntry(entry.id);
    toast('Deleted');
    location.hash = '#/';
  };

  root.append(
    h('h2', id ? 'Edit entry' : 'Log a class'),

    card(null,
      h('label', 'Date'),
      h('input', { type: 'date', value: entry.date, oninput: e => { entry.date = e.target.value; } }),
      h('label', 'Coach'),
      h('input', { type: 'text', value: entry.coach, placeholder: 'Who taught it?',
                   oninput: e => { entry.coach = e.target.value; } }),
      h('label', 'Gi or no-gi'),
      giSelector(entry)),

    card('What we did',
      h('label', 'Techniques'),
      field('techniques', 'Knee slice pass, leg weave, cross face pressure…'),
      h('label', 'Rolling notes'),
      field('rolling', 'Passed Steve twice. Got guillotined three times…'),
      h('label', 'Thoughts'),
      field('thoughts', 'Need to keep my hips lower when passing.')),

    card('Tags', tagsBox, h('div', { style: 'height:10px' }), manualTagRow(addTag)),
    card('Suggested', suggestBox),

    h('div.btn-row',
      h('button.btn.primary', { onclick: save }, id ? 'Save changes' : 'Save entry'),
      h('a.btn', { href: '#/' }, 'Cancel'),
      id && h('button.btn', { onclick: remove }, 'Delete')),
  );

  renderTags();
  renderSuggestions();
}
