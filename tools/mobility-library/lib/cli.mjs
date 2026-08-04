#!/usr/bin/env node
// The thinking half of the tool. `mobility` (the shell script next door) does
// the parts that need yt-dlp and ffmpeg; everything that needs a decision
// happens here, where it can be unit-tested without a network.
//
//   node lib/cli.mjs list      [--routine ID]        what the library will hold
//   node lib/cli.mjs queries   [--routine ID]        id + query, TSV, for the search loop
//   node lib/cli.mjs pick      --movement ID         yt-dlp JSON on stdin -> ranked TSV
//   node lib/cli.mjs clips     --candidates F --clips F [--routine ID]
//   node lib/cli.mjs check     --clips F             validate the recipe
//   node lib/cli.mjs plan      --clips F --out DIR --review DIR
//
// Everything speaks TSV because the shell reads it with `IFS=$'\t' read -r`
// and never has to parse a time or a title.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { movements, findMovement, routineIds, DEFAULT_ROUTINE } from './movements.mjs';
import { rank } from './score.mjs';
import { parseClips, toClock, UNREVIEWED } from './clips.mjs';

const argv = process.argv.slice(2);
const command = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
function has(name) {
  return argv.includes(`--${name}`);
}
function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
/** Tabs and newlines are the field and record separators; nothing else may be. */
function cell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}
function tsv(...values) {
  return values.map(cell).join('\t');
}

function routineArg() {
  const id = flag('routine', DEFAULT_ROUTINE);
  if (!routineIds().includes(id)) die(`unknown routine "${id}" -- have: ${routineIds().join(', ')}`);
  return id;
}

/** yt-dlp and the Data API describe a video differently; the scorer sees one shape. */
function normalize(raw) {
  const id = raw.id ?? raw.videoId ?? null;
  if (!id) return null;
  return {
    id,
    url: raw.webpage_url || raw.url || `https://youtu.be/${id}`,
    title: raw.title ?? raw.fulltitle ?? '',
    channel: raw.channel ?? raw.uploader ?? raw.channelTitle ?? '',
    duration: Number(raw.duration) || 0,
    views: Number(raw.view_count ?? raw.views) || 0,
    isLive: Boolean(raw.is_live || raw.live_status === 'is_live'),
    ageLimit: Number(raw.age_limit) || 0,
  };
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------

const CANDIDATE_HEADER = tsv(
  'routine', 'n', 'movement', 'file', 'rank', 'score',
  'video_id', 'url', 'duration', 'channel', 'title', 'why', 'rejected',
);

const commands = {
  list() {
    const id = routineArg();
    const rows = movements(id);
    process.stdout.write(`${rows.length} movements in "${id}"\n\n`);
    for (const m of rows) {
      process.stdout.write(`  ${m.file}.mp4\n`);
      process.stdout.write(`      ${m.targets}\n`);
      process.stdout.write(`      search: ${m.query ?? '(none -- add one to lib/queries.mjs)'}\n`);
    }
  },

  queries() {
    const id = routineArg();
    for (const m of movements(id)) {
      if (!m.query) {
        process.stderr.write(`! ${m.id} has no query in lib/queries.mjs -- skipping\n`);
        continue;
      }
      process.stdout.write(`${tsv(m.id, m.query)}\n`);
    }
  },

  header() {
    process.stdout.write(`${CANDIDATE_HEADER}\n`);
  },

  pick() {
    const id = flag('movement');
    const top = Number(flag('top', '5'));
    const movement = id ? findMovement(id) : null;
    if (!movement) die(`unknown movement "${id}"`);

    const candidates = readStdin()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .map(raw => (raw ? normalize(raw) : null))
      .filter(Boolean);

    const ranked = rank(candidates, movement);
    const shown = has('all') ? ranked : ranked.filter(c => !c.rejected).slice(0, top);

    if (shown.length === 0) {
      process.stderr.write(`! nothing matched "${movement.name}" -- widen the query in lib/queries.mjs\n`);
    }
    shown.forEach((c, i) => {
      process.stdout.write(`${tsv(
        movement.routine, movement.n, movement.id, movement.file,
        i + 1, c.score, c.id, c.url,
        c.duration ? toClock(c.duration) : '?',
        c.channel, c.title, c.reasons.join('; '), c.rejected ?? '',
      )}\n`);
    });
  },

  /**
   * Turn the shortlist into clips.txt, keeping every trim window already
   * chosen. Re-running the search must never cost you the times you filled in
   * by hand -- that is the only part of this whole pipeline a human did.
   */
  clips() {
    const candidatesPath = flag('candidates') ?? die('--candidates required');
    const clipsPath = flag('clips') ?? die('--clips required');
    const id = routineArg();

    const lines = readFileSync(candidatesPath, 'utf8').split('\n').filter(Boolean);
    const best = new Map();
    for (const line of lines) {
      const f = line.split('\t');
      if (f[0] === 'routine' || f.length < 12) continue;
      const [routine, n, movement, file, rankNo, score, vid, url, duration, channel, title] = f;
      if (routine !== id) continue;
      if (Number(rankNo) !== 1) continue;
      best.set(movement, { n: Number(n), file, url, vid, duration, channel, title, score });
    }

    const existing = existsSync(clipsPath)
      ? parseClips(readFileSync(clipsPath, 'utf8')).rows
      : [];
    const kept = new Map(existing.map(r => [r.name, r]));

    const out = [
      '# The library recipe: filename|URL|start|end.',
      '# Times are mm:ss. An end of ? means "not chosen yet" -- `mobility build`',
      '# downloads those untrimmed into review/ so you can scrub and fill them in.',
      '# Lines starting with # are ignored. Re-running `mobility search` keeps',
      '# every window you have already filled in.',
      '',
    ];

    let carried = 0;
    let added = 0;
    for (const m of movements(id)) {
      const pickRow = best.get(m.id);
      const prior = kept.get(m.file);

      if (prior && !prior.unreviewed) {
        out.push(`# ${m.name} -- window already chosen, left alone`);
        out.push(`${prior.name}|${prior.url}|${prior.start}|${prior.end}`);
        out.push('');
        carried++;
        continue;
      }
      if (!pickRow) {
        out.push(`# ${m.name} -- no candidate found. Run: mobility search ${m.id}`);
        out.push('');
        continue;
      }
      out.push(`# ${m.name} -- ${pickRow.channel}: ${pickRow.title} (${pickRow.duration}, score ${pickRow.score})`);
      out.push(`${m.file}|${pickRow.url}|00:00|${UNREVIEWED}`);
      out.push('');
      added++;
    }

    writeFileSync(clipsPath, `${out.join('\n')}\n`, 'utf8');
    process.stderr.write(`clips.txt: ${added} to review, ${carried} already trimmed\n`);
  },

  /**
   * exercise_urls.csv -- the flat two-column list the original plan produced.
   * Superseded by clips.txt (which also carries the trim window) but kept
   * because it is the shape you paste into a spreadsheet or a message.
   */
  urls() {
    const candidatesPath = flag('candidates') ?? die('--candidates required');
    const id = routineArg();
    const byId = new Map(movements(id).map(m => [m.id, m]));
    const lines = readFileSync(candidatesPath, 'utf8').split('\n').filter(Boolean);
    const csv = ['Exercise,URL'];
    const seen = new Set();
    for (const line of lines) {
      const f = line.split('\t');
      if (f.length < 8 || f[0] !== id || Number(f[4]) !== 1) continue;
      const m = byId.get(f[2]);
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      csv.push(`"${m.name.replace(/"/g, '""')}","${f[7]}"`);
    }
    process.stdout.write(`${csv.join('\n')}\n`);
  },

  check() {
    const clipsPath = flag('clips') ?? die('--clips required');
    if (!existsSync(clipsPath)) die(`${clipsPath} does not exist -- run: mobility search`);
    const { rows, errors } = parseClips(readFileSync(clipsPath, 'utf8'));
    for (const e of errors) process.stderr.write(`! ${e}\n`);
    const ready = rows.filter(r => !r.unreviewed);
    process.stdout.write(`${rows.length} rows, ${ready.length} with a trim window, ${errors.length} problems\n`);
    if (errors.length) process.exit(1);
  },

  /**
   * The work list for the shell: one record per thing to do, times already
   * turned into seconds so bash never does arithmetic on a clock.
   */
  plan() {
    const clipsPath = flag('clips') ?? die('--clips required');
    const outDir = flag('out') ?? die('--out required');
    const reviewDir = flag('review') ?? die('--review required');
    if (!existsSync(clipsPath)) die(`${clipsPath} does not exist -- run: mobility search`);

    const { rows, errors } = parseClips(readFileSync(clipsPath, 'utf8'));
    if (errors.length) {
      for (const e of errors) process.stderr.write(`! ${e}\n`);
      die('clips.txt has problems; fix them or nothing downstream can be trusted');
    }
    for (const r of rows) {
      const action = r.unreviewed ? 'review' : 'trim';
      const dest = r.unreviewed ? join(reviewDir, `${r.name}.mp4`) : join(outDir, `${r.name}.mp4`);
      process.stdout.write(`${tsv(
        action, r.videoId, r.url,
        r.unreviewed ? 0 : r.startSec,
        r.unreviewed ? 0 : r.duration,
        dest, r.name,
      )}\n`);
    }
  },
};

if (!command || command === 'help' || !commands[command]) {
  process.stderr.write(`unknown command "${command ?? ''}"\n`);
  process.stderr.write(`have: ${Object.keys(commands).join(', ')}\n`);
  process.exit(command && command !== 'help' ? 1 : 0);
}
commands[command]();
