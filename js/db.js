// IndexedDB wrapper. Small on purpose.
//
// ⚠️ This is device-local storage. Clearing site data wipes it. Sync/backup to
// a private GitHub data repo is the agreed answer (docs/OPEN-QUESTIONS.md §13)
// and is not built yet — js/backup.js has manual export/import in the meantime.

const DB_NAME = 'jj-app';
const DB_VERSION = 1;

/** Bump DB_VERSION and add a case here; never rewrite an existing case. */
function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    const entries = db.createObjectStore('entries', { keyPath: 'id' });
    entries.createIndex('date', 'date');
    entries.createIndex('type', 'type');
    db.createObjectStore('settings', { keyPath: 'key' });
  }
}

let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => migrate(req.result, e.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const put    = (store, value) => tx(store, 'readwrite', s => s.put(value));
export const del    = (store, key)   => tx(store, 'readwrite', s => s.delete(key));
export const get    = (store, key)   => tx(store, 'readonly',  s => s.get(key));
export const getAll = (store)        => tx(store, 'readonly',  s => s.getAll());

export async function clearAll() {
  const db = await open();
  await Promise.all([...db.objectStoreNames].map(n => tx(n, 'readwrite', s => s.clear())));
}
