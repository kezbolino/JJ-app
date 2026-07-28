// Search — the fallback for whenever the structure fails you.

import { h, card, empty, fmtDate, giFlag, tagChip } from '../ui.js';
import * as store from '../store.js';

export default async function search(root, { q = '' } = {}) {
  const entries = await store.allEntries();
  const input = h('input', { type: 'text', placeholder: 'Search everything…', value: q });
  const results = h('div');

  const run = () => {
    const query = input.value;
    const hits = store.search(entries, query);
    const url = `#/search${query ? '?q=' + encodeURIComponent(query) : ''}`;
    history.replaceState(null, '', url);

    results.replaceChildren(card(
      query ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : null,
      !query
        ? empty('Type to search entries, notes, questions and tags.')
        : hits.length
          ? hits.map(e => h('a.entry', { href: `#/log/${e.id}` },
              h('div.entry-head', h('span.entry-date', fmtDate(e.date)),
                giFlag(e.gi)),
              e.body && h('div.entry-body', e.body.slice(0, 160) + (e.body.length > 160 ? '…' : '')),
              (e.tags ?? []).length ? h('div.tags', e.tags.slice(0, 4).map(t => tagChip(t))) : null))
          : empty('Nothing found.')));
  };

  input.addEventListener('input', run);
  root.append(h('h2', 'Search'), card(null, input), results);
  run();
  input.focus();
}
