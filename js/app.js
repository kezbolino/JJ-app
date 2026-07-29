// Router and boot.

import { clear, h } from './ui.js';
import { VERSION } from './version.js';
import home from './views/home.js';
import focus from './views/focus.js';
import log from './views/log.js';
import map from './views/map.js';
import position from './views/position.js';
import library from './views/library.js';
import search from './views/search.js';
import settings from './views/settings.js';

const view = document.getElementById('view');

const foot = document.getElementById('appfoot');
if (foot) foot.textContent = `JJ-app ${VERSION}`;

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

  const tab = head === 'settings' ? '/library' : head === 'focus' ? '/' : '/' + (head ?? '');
  for (const link of document.querySelectorAll('.tabbar a')) {
    link.toggleAttribute('aria-current', link.dataset.tab === tab);
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
  }

  const render = () => {
    switch (head) {
      case undefined:  return home(view);
      case 'focus':    return focus(view);
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

// Web Share Target. Android's share sheet opens the app at `./?share_text=…`
// (see manifest.webmanifest). A standalone transcriber like Scrib records and
// transcribes fully on-device, then shares the plain text here. We stash it,
// strip the query so a reload can't re-import it, and land on a fresh log
// entry; log.js reads the stash and the existing tagger tags it — no AI, no
// audio ever touching this app. See docs/OPEN-QUESTIONS.md §14.
function consumeShare() {
  if (!location.search) return;
  const params = new URLSearchParams(location.search);
  const text = (params.get('share_text') || '').trim();
  const title = (params.get('share_title') || '').trim();
  const note = text || title;
  // replaceState (not location.hash =) so no extra hashchange fires: route()
  // below renders the log screen exactly once.
  if (note) {
    sessionStorage.setItem('pendingShare', note);
    history.replaceState(null, '', location.pathname + '#/log');
  } else {
    history.replaceState(null, '', location.pathname + (location.hash || ''));
  }
}

consumeShare();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  });
}
