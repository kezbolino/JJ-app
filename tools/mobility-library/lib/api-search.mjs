#!/usr/bin/env node
// Option A: search via the YouTube Data API instead of yt-dlp.
//
//   node lib/api-search.mjs "cossack squat how to" [--results 15]
//
// Prints the same one-JSON-object-per-line stream yt-dlp's --dump-json emits,
// so `mobility search --api` swaps one command for the other and every other
// part of the pipeline -- scoring, shortlisting, clips.txt -- is unchanged.
//
// You do not need this. yt-dlp's own search needs no key, no quota and no
// Google project, which is why it is the default. This exists because the plan
// asked for both, and because the API returns view counts and exact durations
// in one round trip where yt-dlp's flat search sometimes omits them.
//
// THE KEY NEVER GOES IN THIS REPO. It is read from $YT_API_KEY, or from
// ~/.config/mobility/youtube-api-key, and nowhere else. JJ-app is a public
// repository served by GitHub Pages -- a key committed here is a key published.
// There is no code path in this file that writes a key to disk.
//
// No dependencies: node's built-in fetch, no googleapis, no pandas.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://www.googleapis.com/youtube/v3';

function apiKey() {
  if (process.env.YT_API_KEY) return process.env.YT_API_KEY.trim();
  const path = join(homedir(), '.config', 'mobility', 'youtube-api-key');
  try {
    const key = readFileSync(path, 'utf8').trim();
    if (key) return key;
  } catch { /* not there; fall through to the message below */ }
  process.stderr.write(
    'No API key. Either export YT_API_KEY=... or put it in\n'
    + `  ${path}\n`
    + 'Or drop --api and use yt-dlp search, which needs no key at all.\n',
  );
  process.exit(1);
}

/** "PT1M30S" -> 90. The API returns durations in ISO 8601, alone among formats. */
export function isoDuration(text) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(text ?? ''));
  if (!m) return 0;
  const [, d, h, min, s] = m.map(v => Number(v) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function get(path, params, key) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const res = await fetch(url);
  if (!res.ok) {
    // Never echo the URL back: it carries the key.
    throw new Error(`YouTube API ${path} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const query = args.find(a => !a.startsWith('--'));
  if (!query) {
    process.stderr.write('usage: node lib/api-search.mjs "<query>" [--results N]\n');
    process.exit(1);
  }
  const i = args.indexOf('--results');
  const results = Math.min(50, Number(i >= 0 ? args[i + 1] : 15) || 15);
  const key = apiKey();

  const search = await get('search', {
    q: query, part: 'snippet', type: 'video', maxResults: String(results),
  }, key);
  const ids = (search.items ?? []).map(it => it.id?.videoId).filter(Boolean);
  if (ids.length === 0) return;

  // The search endpoint knows nothing about duration or view count, and both
  // are things the scorer weighs -- so a second call, on the ids we just got.
  const details = await get('videos', {
    id: ids.join(','), part: 'snippet,contentDetails,statistics',
  }, key);

  for (const v of details.items ?? []) {
    process.stdout.write(`${JSON.stringify({
      id: v.id,
      title: v.snippet?.title ?? '',
      channel: v.snippet?.channelTitle ?? '',
      duration: isoDuration(v.contentDetails?.duration),
      view_count: Number(v.statistics?.viewCount) || 0,
      webpage_url: `https://youtu.be/${v.id}`,
      live_status: v.snippet?.liveBroadcastContent === 'live' ? 'is_live' : 'not_live',
    })}\n`);
  }
}

// Only search when run as a command. Importing this file -- which the test
// suite does, for isoDuration -- must not fire a network request or demand a
// key that is not there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
