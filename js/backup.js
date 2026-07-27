// Manual export / import.
//
// A stopgap. The agreed answer is syncing to a private GitHub data repo
// (docs/OPEN-QUESTIONS.md §13) — until that exists, this is the only thing
// standing between the user and losing everything to a cleared cache.

import * as db from './db.js';
import { allEntries } from './store.js';

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
 * Merge a backup in. Never destructive: an incoming entry only overwrites an
 * existing one when it is genuinely newer.
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
  for (const setting of data.settings ?? []) await db.put('settings', setting);

  return { added, updated, skipped };
}
