// Log a class — the capture screen.
//
// Capture friction is the whole product: if writing this up after training is
// a chore, no data accumulates and every other feature has nothing to show.
// So: sensible defaults, nothing mandatory, tags suggested as you type.
//
// Suggestions can also be corrected here, because mid-log is when you notice
// they're wrong. ⊘ on a suggestion stops that word being suggested ever again;
// "Teach a word" maps your gym's name for something onto the real technique.

import { h, card, toast, tagChip, empty, icon } from '../ui.js';
import { POSITIONS, POSITION_BY_ID, CONCEPTS, rolesFor } from '../ontology.js';
import { suggestTags, tagKey } from '../tagger.js';
import * as overrides from '../overrides.js';
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

/**
 * Position → role → technique pickers that narrow as you go.
 * Used both for adding a tag by hand and for teaching the app a new word.
 */
function tagPicker() {
  const positionSelect = h('select',
    h('option', { value: '' }, 'Position…'),
    POSITIONS.map(p => h('option', { value: p.id }, p.label)),
    h('option', { value: '__concept' }, '— Concept —'));

  const roleSelect = h('select', { disabled: true }, h('option', 'Role…'));
  const techniqueSelect = h('select', { disabled: true }, h('option', 'Technique…'));

  const fillRoles = () => {
    const value = positionSelect.value;
    roleSelect.disabled = !value;
    techniqueSelect.disabled = value === '__concept' || !value;

    if (value === '__concept') {
      roleSelect.replaceChildren(
        h('option', { value: '' }, 'Which concept…'),
        ...CONCEPTS.map(c => h('option', { value: c }, c)));
    } else if (value) {
      roleSelect.replaceChildren(
        h('option', { value: '' }, 'Whole position'),
        ...rolesFor(value).map(r => h('option', { value: r.id }, r.label)));
    } else {
      // Disabled selects still need a label, or they render as an empty box.
      roleSelect.replaceChildren(h('option', { value: '' }, 'Role…'));
    }
    techniqueSelect.replaceChildren(h('option', { value: '' }, value ? 'Any technique' : 'Technique…'));
  };

  const fillTechniques = () => {
    const pos = POSITION_BY_ID[positionSelect.value];
    if (!pos) return;
    const role = roleSelect.value;
    const options = pos.techniques.filter(t => !role || t.role === role);
    techniqueSelect.replaceChildren(
      h('option', { value: '' }, 'Any technique'),
      ...options.map(t => h('option', { value: t.id }, t.label)));
  };

  positionSelect.addEventListener('change', fillRoles);
  roleSelect.addEventListener('change', fillTechniques);

  return {
    fields: [positionSelect, roleSelect, techniqueSelect],
    /** The tag described by the current selection, or null. */
    read() {
      const position = positionSelect.value;
      if (!position) return null;
      if (position === '__concept') {
        return roleSelect.value ? { kind: 'concept', concept: roleSelect.value } : null;
      }
      return {
        kind: 'pos',
        position,
        role: roleSelect.value || null,
        ...(techniqueSelect.value ? { technique: techniqueSelect.value } : {}),
      };
    },
    reset() {
      positionSelect.value = '';
      fillRoles();
    },
  };
}

export default async function log(root, { id } = {}) {
  const entry = id ? await store.getEntry(id) : store.newEntry();
  if (!entry) { root.append(empty('That entry no longer exists.')); return; }
  entry.sections ??= { techniques: '', rolling: '', thoughts: '' };

  let corrections = await overrides.getOverrides();

  const tagsBox = h('div.tags');
  const suggestBox = h('div.tags');
  const advanced = h('div', { hidden: true });

  const field = (key, placeholder) => h('textarea', {
    placeholder,
    value: entry.sections[key] ?? '',
    oninput: e => { entry.sections[key] = e.target.value; scheduleSuggest(); },
  });

  const addChip = () => h('span.tag.add', {
    role: 'button', tabindex: 0,
    onclick: () => { advanced.hidden = false; advanced.scrollIntoView({ block: 'nearest' }); },
  }, '+ Add');

  const renderTags = () => {
    tagsBox.replaceChildren(
      ...entry.tags.map(tag => tagChip(tag, {
        onRemove: () => {
          entry.tags = entry.tags.filter(t => tagKey(t) !== tagKey(tag));
          renderTags();
          renderSuggestions();
        },
      })),
      addChip());
  };

  const renderSuggestions = () => {
    const have = new Set(entry.tags.map(tagKey));
    const suggestions = suggestTags(store.entryText(entry), corrections)
      .filter(s => !have.has(tagKey(s.tag)));

    suggestBox.replaceChildren(
      ...(suggestions.length
        ? suggestions.map(({ tag, term }) => tagChip(tag, {
            onAdd: () => { entry.tags.push(tag); renderTags(); renderSuggestions(); },
            onMute: async () => {
              corrections = await overrides.muteTerm(term);
              toast(`Won't suggest "${term}" again`);
              renderSuggestions();
            },
          }))
        : [empty('Nothing spotted yet.')]));
  };

  let timer;
  const scheduleSuggest = () => { clearTimeout(timer); timer = setTimeout(renderSuggestions, 250); };

  const addTag = tag => {
    const have = new Set(entry.tags.map(tagKey));
    if (!have.has(tagKey(tag))) { entry.tags.push(tag); renderTags(); renderSuggestions(); }
  };

  // --- add a tag by hand ---
  const manualPicker = tagPicker();
  const manualRow = h('div.btn-row',
    ...manualPicker.fields,
    h('button.btn.small', {
      onclick: () => {
        const tag = manualPicker.read();
        if (!tag) { toast('Pick a position first'); return; }
        addTag(tag);
        manualPicker.reset();
      },
    }, 'Add tag'));

  // --- teach the app one of your gym's words ---
  const teachPicker = tagPicker();
  const teachInput = h('input', { type: 'text', placeholder: 'The word you actually use…', maxLength: 40 });
  const teachRow = h('div.teach',
    teachInput,
    h('div.btn-row',
      ...teachPicker.fields,
      h('button.btn.small', {
        onclick: async () => {
          const term = teachInput.value.trim();
          const tag = teachPicker.read();
          if (!term) { toast('Type the word first'); return; }
          if (!tag) { toast('Pick what it means'); return; }
          corrections = await overrides.addAlias(term, tag);
          teachInput.value = '';
          teachPicker.reset();
          toast(`"${term}" learned`);
          renderSuggestions();
        },
      }, 'Teach it')));

  // The advanced panel: add a tag by hand, or teach the app a word. Tucked
  // behind "Show options" so the common path — type, tap a suggestion — stays
  // uncluttered.
  advanced.append(
    h('div.field-label', { style: 'margin-top:4px' }, 'Add a tag by hand'),
    manualRow,
    h('hr.hr'),
    h('div.field-label', 'Teach a word'),
    h('p.small.muted', { style: 'margin:-4px 0 8px' },
      'Your gym\'s name for something, mapped onto what it actually is.'),
    teachRow);

  const optsBtn = h('button.link', {
    onclick: () => {
      advanced.hidden = !advanced.hidden;
      optsBtn.textContent = advanced.hidden ? 'Show options' : 'Hide options';
    },
  }, 'Show options');

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

  root.append(...[
    h('div.log-head',
      h('h1.page-title', id ? 'Edit entry' : 'Log a class'),
      h('a.page-action', { href: '#/' }, 'Cancel')),

    h('div.date-row',
      h('div.date-field',
        icon('calendar'),
        h('input', { type: 'date', value: entry.date, oninput: e => { entry.date = e.target.value; } })),
      giSelector(entry)),

    h('div.field',
      h('label.field-label', 'What we drilled'),
      field('techniques', 'Knee slice pass, leg weave, cross face pressure…')),
    h('div.field',
      h('label.field-label', 'Rolling notes'),
      field('rolling', 'Passed Steve twice. Got guillotined three times…')),
    h('div.field',
      h('label.field-label', 'Key thoughts & adjustments'),
      field('thoughts', 'Need to keep my hips lower when passing.')),

    h('hr.hr'),

    h('div.tags-head',
      h('span.field-label', 'Categorization & tags'),
      optsBtn),
    tagsBox,
    h('div.field-label', { style: 'margin:16px 0 8px' }, 'Suggested'),
    suggestBox,
    h('p.small.muted', { style: 'margin-top:8px' },
      'Tap to accept. ⊘ means it got the word wrong — it won\'t suggest that one again.'),
    advanced,

    h('div.btn-row', { style: 'margin-top:20px' },
      h('button.btn.primary.wide.cta', { onclick: save }, id ? 'Save changes' : 'Save entry')),
    id && h('div.btn-row', h('button.btn', { onclick: remove }, 'Delete entry')),
  ].filter(Boolean));

  renderTags();
  renderSuggestions();
}
