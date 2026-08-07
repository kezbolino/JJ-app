// Manual export / import.
//
// A stopgap. The agreed answer is syncing to a private GitHub data repo
// (docs/OPEN-QUESTIONS.md §13) — until that exists, this is the only thing
// standing between the user and losing everything to a cleared cache.

import * as db from './db.js';
import { allEntries } from './store.js';
import { SYNCED_SETTINGS } from './appstate.js';

const FORMAT = 1;

export async function exportData() {
  return {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    entries: await allEntries(),
    settings: await db.getAll('settings'),
  };
}

export async function downloadBackup() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jj-app-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data.entries.length;
}

/**
 * Settings that describe *this device*, not the user's data.
 *
 * These must never be written by an import. `sync` holds the repo and the
 * access token; overwriting it points this phone at whatever repo the exporting
 * device used. `syncState` is worse and quieter: push trusts it to know what
 * the repo already contains, so importing another device's copy makes this one
 * believe notes are backed up that were never sent — and nothing reports it.
 * `tombstones` are that device's pending deletions, and `lastSyncAt` is its
 * clock.
 *
 * The July 2026 attendance backfill was hand-built with no `settings` key at
 * all to dodge exactly this. That guard belongs here, not in each file.
 */
const DEVICE_LOCAL_SETTINGS = new Set([
  'sync', 'syncState', 'tombstones', 'lastSyncAt', 'lastSyncError',
  // Each device's own record of when it last changed a synced setting. Taking
  // another device's stamps would describe changes this one never made, and the
  // sync merges on exactly those timestamps. Import restamps instead, below.
  'settingsStamps',
]);

/**
 * Merge a backup in. Never destructive: an incoming entry only overwrites an
 * existing one when it is genuinely newer, and device-local settings are left
 * alone. Your deck, your starred moves and your taught words do come across —
 * that is what you want back after losing a phone.
 */
export async function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.format !== FORMAT) throw new Error(`Unsupported backup format: ${data.format}`);

  let added = 0, updated = 0, skipped = 0;
  for (const entry of data.entries ?? []) {
    const existing = await db.get('entries', entry.id);
    if (!existing) { await db.put('entries', entry); added++; }
    else if ((entry.updatedAt ?? '') > (existing.updatedAt ?? '')) { await db.put('entries', entry); updated++; }
    else skipped++;
  }

  let settingsSkipped = 0;
  const restamp = [];
  for (const setting of data.settings ?? []) {
    if (DEVICE_LOCAL_SETTINGS.has(setting.key)) { settingsSkipped++; continue; }
    await db.put('settings', setting);
    if (SYNCED_SETTINGS[setting.key]) restamp.push(setting.key);
  }

  // Restoring a phone from a file is a change this device just made, so it has
  // to look like one. Without a stamp the merge would read the restored deck as
  // older than the empty one on the other device and quietly undo the restore.
  if (restamp.length) {
    const now = new Date().toISOString();
    const row = await db.get('settings', 'settingsStamps');
    const stamps = { ...(row?.value ?? {}) };
    for (const key of restamp) stamps[key] = now;
    await db.put('settings', { key: 'settingsStamps', value: stamps });
  }

  return { added, updated, skipped, settingsSkipped };
}
