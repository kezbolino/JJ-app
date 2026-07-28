// The user's corrections to the ontology.
//
// The shipped ontology (js/ontology.js) is a best guess written by someone who
// doesn't train. Every gym renames things. Rather than a settings screen nobody
// visits, corrections are made in the moment: a suggestion comes out wrong, you
// fix it there, and it stays fixed.
//
// Two operations, both reversible:
//   alias  — "when I write X, I mean this technique"
//   mute   — "stop suggesting anything for the word X"

import { getSetting, setSetting } from './store.js';

const KEY = 'ontologyOverrides';
const EMPTY = { aliases: [], muted: [], updatedAt: '' };

export const getOverrides = () => getSetting(KEY, EMPTY);

async function update(fn) {
  const current = await getOverrides();
  const next = fn({ aliases: [...current.aliases], muted: [...current.muted] });
  next.updatedAt = new Date().toISOString();
  await setSetting(KEY, next);
  return next;
}

const norm = term => term.trim().toLowerCase();

export const addAlias = (term, tag) => update(o => {
  const key = norm(term);
  if (!key) return o;
  return {
    // One meaning per word — teaching it again replaces the old mapping.
    aliases: [...o.aliases.filter(a => norm(a.term) !== key), { term: key, tag, at: new Date().toISOString() }],
    // Teaching a word implies you want to see it.
    muted: o.muted.filter(m => norm(m.term) !== key),
  };
});

export const removeAlias = term => update(o => ({
  ...o, aliases: o.aliases.filter(a => norm(a.term) !== norm(term)),
}));

export const muteTerm = term => update(o => {
  const key = norm(term);
  if (!key || o.muted.some(m => norm(m.term) === key)) return o;
  return {
    aliases: o.aliases.filter(a => norm(a.term) !== key),
    muted: [...o.muted, { term: key, at: new Date().toISOString() }],
  };
});

export const unmuteTerm = term => update(o => ({
  ...o, muted: o.muted.filter(m => norm(m.term) !== norm(term)),
}));

export const setOverrides = value => setSetting(KEY, { ...EMPTY, ...value });
