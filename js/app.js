// Router and boot.

import { clear, h } from './ui.js';
import home from './views/home.js';
import log from './views/log.js';
import map from './views/map.js';
import position from './views/position.js';
import library from './views/library.js';
import search from './views/search.js';
import settings from './views/settings.js';

const view = document.getElementById('view');

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, queryString = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: Object.fromEntries(new URLSearchParams(queryString)) };
}

function route() {
  const { parts, query } = parseHash();
  const [head, a, b] = parts;

  clear(view);
  window.scrollTo(0, 0);

  const tab = head === 'settings' ? '/library' : '/' + (head ?? '');
  for (const link of document.querySelectorAll('.tabbar a')) {
    link.toggleAttribute('aria-current', link.dataset.tab === tab);
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
  }

  const render = () => {
    switch (head) {
      case undefined:  return home(view);
      case 'log':      return log(view, { id: a });
      case 'map':      return a ? position(view, { positionId: a, role: b ?? null }) : map(view);
      case 'library':  return library(view);
      case 'settings': return settings(view);
      case 'search':   return search(view, { q: query.q ?? '' });
      default:         view.append(h('p.empty', 'Page not found.'));
    }
  };

  Promise.resolve(render()).catch(err => {
    console.error(err);
    view.append(h('p.empty', `Something went wrong: ${err.message}`));
  });
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  });
}
