// clips.txt -- the recipe for the library.
//
//   01 Deep squat hold|https://youtu.be/xxxx|00:10|00:22
//
// Four pipe-separated fields: filename, URL, start, end. Lines starting with
// `#` and blank lines are ignored, which is what lets `mobility search` leave
// the title, channel and score above each row as a comment.
//
// This file is the only artifact of the whole pipeline worth keeping in git.
// It is small, it is text, it contains no secrets, and it fully describes the
// library -- delete every mp4 and one `mobility build` puts them back. The
// video files themselves are gitignored; see .gitignore next door.
//
// An end time of `?` means "downloaded but you have not picked the window yet".
// The tool cannot watch the video for you, so it does not pretend to: it puts
// the untrimmed download in review/ and waits.

export const UNREVIEWED = '?';

/** "90", "1:30" and "00:01:30" all mean the same thing. */
export function toSeconds(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  if (!/^\d{1,2}(:\d{1,2}){0,2}(\.\d+)?$/.test(raw)) return null;
  const parts = raw.split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}

/** Seconds back to the shortest form that reads unambiguously. */
export function toClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Parse clips.txt. Returns every row it understood and every complaint it has,
 * with line numbers -- a half-parsed recipe that silently drops the row you
 * typoed is how you end up with twelve files and no idea which is missing.
 */
export function parseClips(text) {
  const rows = [];
  const errors = [];
  const seen = new Map();

  String(text ?? '').split('\n').forEach((line, i) => {
    const lineNo = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length !== 4) {
      errors.push(`line ${lineNo}: expected 4 fields separated by |, got ${parts.length}`);
      return;
    }
    const [name, url, start, end] = parts;
    if (!name) { errors.push(`line ${lineNo}: no filename`); return; }
    if (!/^https?:\/\//.test(url)) { errors.push(`line ${lineNo}: "${url}" is not a URL`); return; }

    const startSec = toSeconds(start);
    if (startSec === null) { errors.push(`line ${lineNo}: "${start}" is not a time`); return; }

    const unreviewed = end === UNREVIEWED;
    const endSec = unreviewed ? null : toSeconds(end);
    if (!unreviewed && endSec === null) {
      errors.push(`line ${lineNo}: "${end}" is not a time (use ${UNREVIEWED} if you have not picked one yet)`);
      return;
    }
    if (!unreviewed && endSec <= startSec) {
      errors.push(`line ${lineNo}: end ${end} is not after start ${start}`);
      return;
    }

    if (seen.has(name)) {
      errors.push(`line ${lineNo}: "${name}" already defined on line ${seen.get(name)}`);
      return;
    }
    seen.set(name, lineNo);

    rows.push({
      lineNo,
      name,
      url,
      start,
      end,
      startSec,
      endSec,
      unreviewed,
      duration: unreviewed ? null : endSec - startSec,
      videoId: videoId(url),
    });
  });

  return { rows, errors };
}

/**
 * The video id out of any of the URL shapes YouTube hands out. Used as the
 * download cache key, so two movements that pick the same source video share
 * one download.
 */
export function videoId(url) {
  const text = String(url ?? '');
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /\/shorts\/([A-Za-z0-9_-]{6,})/,
    /\/embed\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  // Not YouTube, or a shape we do not know: hash the URL so the cache still
  // works and two different URLs can never collide.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `url${(h >>> 0).toString(36)}`;
}

/** One row back to its line. */
export function formatRow(row) {
  return `${row.name}|${row.url}|${row.start}|${row.end}`;
}
