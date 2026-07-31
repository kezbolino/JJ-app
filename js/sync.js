// Backup and sync to a private GitHub repo, as markdown.
//
// Local IndexedDB stays the source of truth; the repo is the backup and the
// bridge between phone and desktop. Notes are written as .md files so the
// backup is readable on github.com and openable in Obsidian.
//
// Uses the Git Data API rather than the Contents API so an entire sync lands
// as ONE commit, instead of one commit per note.

import { getSetting, setSetting, allEntries, allEntriesRaw, putEntryRaw, removeEntryRaw } from './store.js';
import {
  toMarkdown, fromMarkdown, pathFor, buildIndex,
  overridesToMarkdown, overridesFromMarkdown,
} from './markdown.js';
import { getOverrides, setOverrides } from './overrides.js';

const DEFAULT_API = 'https://api.github.com';
const INDEX_PATH = 'README.md';
const OVERRIDES_PATH = 'ontology-overrides.md';

/** Files in the repo that aren't journal entries. */
const isSpecial = path => path === INDEX_PATH || path === OVERRIDES_PATH;

// ---- config --------------------------------------------------------------
// The token lives in this browser's IndexedDB and is never written to either
// repo. Use a fine-grained PAT scoped to the data repo alone, Contents: R/W.

export const getConfig = () => getSetting('sync', { owner: '', repo: '', branch: 'main', token: '' });
export const setConfig = config => setSetting('sync', config);
export const isConfigured = config => Boolean(config?.owner && config?.repo && config?.token);

const getState = () => getSetting('syncState', { commit: null, paths: {} });
const setState = state => setSetting('syncState', state);

export const getLastSync = () => getSetting('lastSyncAt', null);

// ---- plumbing ------------------------------------------------------------

// `apiBase` is normally unset. It exists so the sync tests can point at a fake
// GitHub, and it would also serve a GitHub Enterprise host.
async function api(config, path, options = {}) {
  const res = await fetch(`${config.apiBase || DEFAULT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const message = /"message"\s*:\s*"([^"]+)"/.exec(detail)?.[1] ?? res.statusText;
    const error = new Error(`GitHub ${res.status}: ${message}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

const repoPath = (config, suffix) => `/repos/${config.owner}/${config.repo}${suffix}`;

/** btoa() is byte-oriented; encode UTF-8 first or accents and — break. */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Cheap content fingerprint, so we don't keep a second copy of every note. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export async function checkAccess(config) {
  const repo = await api(config, repoPath(config, ''));
  if (!repo.permissions?.push) throw new Error('Token cannot write to that repo');
  return { private: repo.private, defaultBranch: repo.default_branch };
}

// ---- pull ----------------------------------------------------------------

async function headCommit(config) {
  try {
    const ref = await api(config, repoPath(config, `/git/ref/heads/${config.branch}`));
    return ref.object.sha;
  } catch (err) {
    if (err.status === 404 || err.status === 409) return null; // empty repo
    throw err;
  }
}

async function baseTreeSha(config, commitSha) {
  if (!commitSha) return null;
  const commit = await api(config, repoPath(config, `/git/commits/${commitSha}`));
  return commit.tree.sha;
}

async function remoteTree(config, commitSha) {
  const treeSha = await baseTreeSha(config, commitSha);
  if (!treeSha) return { notes: {}, special: {} };
  const tree = await api(config, repoPath(config, `/git/trees/${treeSha}?recursive=1`));
  const notes = {}, special = {};
  for (const node of tree.tree) {
    if (node.type !== 'blob' || !node.path.endsWith('.md')) continue;
    (isSpecial(node.path) ? special : notes)[node.path] = node.sha;
  }
  return { notes, special };
}

const readBlob = async (config, sha) =>
  fromBase64((await api(config, repoPath(config, `/git/blobs/${sha}`))).content);

/**
 * Bring down anything the repo has that we don't, or that is newer there.
 * Merge is by `updatedAt`, same rule as the JSON import — never destructive.
 */
export async function pull(config) {
  const commitSha = await headCommit(config);
  if (!commitSha) return { added: 0, updated: 0, removed: 0, checked: 0 };

  const { notes: remote, special } = await remoteTree(config, commitSha);

  // Ontology corrections, last-write-wins on the whole set.
  if (special[OVERRIDES_PATH]) {
    try {
      const theirs = overridesFromMarkdown(await readBlob(config, special[OVERRIDES_PATH]));
      const mine = await getOverrides();
      if ((theirs.updatedAt ?? '') > (mine.updatedAt ?? '')) await setOverrides(theirs);
    } catch { /* malformed or hand-edited; local wins */ }
  }

  // Trashed entries are still rows here, so pull has to see them: an entry in
  // the trash whose file is still in the repo would otherwise look like a note
  // this device has never met, and get restored behind the user's back.
  const local = await allEntriesRaw();
  const byId = new Map(local.map(e => [e.id, e]));
  const knownBlobs = new Set(local.map(e => e.syncBlob).filter(Boolean));
  const trashed = new Set(local.filter(e => e.deletedAt).map(e => e.id));
  const tombstones = await getSetting('tombstones', {});

  let added = 0, updated = 0;
  const touched = new Set();

  for (const [path, blobSha] of Object.entries(remote)) {
    const blobKnown = knownBlobs.has(blobSha);
    const text = blobKnown ? null : await readBlob(config, blobSha);

    let entry = null;
    if (text !== null) {
      try { entry = fromMarkdown(text); } catch { continue; } // not one of ours
    }
    if (entry && !entry.id) continue;

    if (blobKnown) { touched.add(local.find(e => e.syncBlob === blobSha)?.id); continue; }
    if (tombstones[entry.id]) continue; // we deleted it; the push will remove the file
    if (trashed.has(entry.id)) continue; // in our trash — don't undo that here

    touched.add(entry.id);
    const bookkeeping = { syncPath: path, syncBlob: blobSha, syncHash: hash(text) };
    const mine = byId.get(entry.id);
    if (!mine) {
      await putEntryRaw({ ...entry, ...bookkeeping });
      added++;
    } else if ((entry.updatedAt ?? '') > (mine.updatedAt ?? '')) {
      await putEntryRaw({ ...mine, ...entry, ...bookkeeping });
      updated++;
    }
  }

  // A note we previously synced whose file has vanished was deleted on another
  // device. Entries never synced (no syncPath) are local-only and left alone.
  let removed = 0;
  for (const entry of local) {
    if (!entry.syncPath || touched.has(entry.id)) continue;
    // Something already in our trash has no file by design — that is this
    // device's own deletion, not another device's, and the 30-day undo window
    // belongs to the user, not to the sync.
    if (entry.deletedAt) continue;
    if (!remote[entry.syncPath]) { await removeEntryRaw(entry.id); removed++; }
  }

  return { added, updated, removed, checked: Object.keys(remote).length };
}

// ---- push ----------------------------------------------------------------

/**
 * Write every local entry that has changed since the last sync, plus a
 * regenerated index, as a single commit.
 */
export async function push(config) {
  const entries = await allEntries();
  const state = await getState();
  const parent = await headCommit(config);

  const changed = [];
  const seenPaths = new Set();

  for (const entry of entries) {
    const path = pathFor(entry);
    seenPaths.add(path);
    const markdown = toMarkdown(entry);
    // Re-upload when the file moved (date edited) or the text actually differs.
    if (entry.syncPath !== path || entry.syncHash !== hash(markdown)) {
      changed.push({ entry, path, markdown });
    }
  }

  const indexText = buildIndex(entries);
  const indexChanged = state.indexHash !== hash(indexText);

  const overridesText = overridesToMarkdown(await getOverrides());
  const overridesChanged = state.overridesHash !== hash(overridesText);

  // Paths to remove: ones we wrote before that no longer belong to an entry
  // (deleted, or renamed because the date changed), plus explicit tombstones.
  const tombstones = await getSetting('tombstones', {});
  const gone = new Set([
    ...Object.keys(state.paths ?? {}).filter(p => !seenPaths.has(p)),
    ...Object.values(tombstones).map(t => t.path).filter(p => !seenPaths.has(p)),
  ]);

  if (!changed.length && !indexChanged && !overridesChanged && !gone.size) {
    // Still record what the repo holds, so a later delete knows what to remove.
    await setState({ ...state, paths: Object.fromEntries([...seenPaths].map(p => [p, true])) });
    return { pushed: 0, deleted: 0, commit: parent };
  }

  const tree = [];
  for (const file of changed) {
    const blob = await api(config, repoPath(config, '/git/blobs'), {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(file.markdown), encoding: 'base64' }),
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  for (const [path, text, changedFlag] of [
    [INDEX_PATH, indexText, indexChanged],
    [OVERRIDES_PATH, overridesText, overridesChanged],
  ]) {
    if (!changedFlag) continue;
    const blob = await api(config, repoPath(config, '/git/blobs'), {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(text), encoding: 'base64' }),
    });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // Safe because push always runs after pull, so anything another device added
  // is already local and therefore in seenPaths.
  for (const path of gone) tree.push({ path, mode: '100644', type: 'blob', sha: null });
  const deleted = gone.size;

  const baseTree = await baseTreeSha(config, parent);
  const newTree = await api(config, repoPath(config, '/git/trees'), {
    method: 'POST',
    body: JSON.stringify({ ...(baseTree ? { base_tree: baseTree } : {}), tree }),
  });

  const commit = await api(config, repoPath(config, '/git/commits'), {
    method: 'POST',
    body: JSON.stringify({
      message: `Sync ${changed.length} ${changed.length === 1 ? 'note' : 'notes'} from JJ-app`,
      tree: newTree.sha,
      parents: parent ? [parent] : [],
    }),
  });

  if (parent) {
    await api(config, repoPath(config, `/git/refs/heads/${config.branch}`), {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await api(config, repoPath(config, '/git/refs'), {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: commit.sha }),
    });
  }

  // Remember what we sent, so the next push only uploads real changes.
  for (const file of changed) {
    await putEntryRaw({ ...file.entry, syncPath: file.path, syncHash: hash(file.markdown) });
  }
  await setState({
    commit: commit.sha,
    indexHash: hash(indexText),
    overridesHash: hash(overridesText),
    paths: Object.fromEntries([...seenPaths].map(p => [p, true])),
  });
  // The deletions are in the repo now, so the tombstones have done their job.
  await setSetting('tombstones', {});

  return { pushed: changed.length, deleted, commit: commit.sha };
}

/** Pull, then push. Local wins ties; newer always wins. */
export async function sync() {
  const config = await getConfig();
  if (!isConfigured(config)) throw new Error('Sync is not set up yet');

  const pulled = await pull(config);
  const pushed = await push(config);
  await setSetting('lastSyncAt', new Date().toISOString());
  return { ...pulled, ...pushed };
}
