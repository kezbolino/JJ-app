// The mobility-library tool -- pure node, no network, no yt-dlp.
//
//   node tests/mobility.test.mjs
//
// The last few tests run the real `mobility build` against fake yt-dlp and
// ffmpeg binaries on PATH. That is how the two bugs in the original sketch --
// yt-dlp eating clips.txt off stdin, and ffmpeg seeking after -i with a stream
// copy -- stay fixed without downloading a byte.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTINES } from '../js/stretches.js';
import { QUERIES } from '../tools/mobility-library/lib/queries.mjs';
import { movements, allMovements, safeName, findMovement } from '../tools/mobility-library/lib/movements.mjs';
import {
  scoreCandidate, rank, channelTier, termCoverage, normalizeChannel, CHANNEL_TIERS,
} from '../tools/mobility-library/lib/score.mjs';
import { parseClips, toSeconds, toClock, videoId, UNREVIEWED } from '../tools/mobility-library/lib/clips.mjs';
import { isoDuration } from '../tools/mobility-library/lib/api-search.mjs';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('✓', name); }
  catch (e) { console.log('✗', name, '\n  ', e.message); process.exitCode = 1; }
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(ROOT, 'tools', 'mobility-library', 'mobility');

// A candidate with sane defaults; each test overrides only what it is about.
const video = (over = {}) => ({
  id: over.id ?? 'vid00000001',
  title: 'Cossack Squat Tutorial',
  channel: 'Some Channel',
  duration: 60,
  views: 1000,
  ...over,
});
const cossack = () => findMovement('cossack-squat');

// ---------------------------------------------------------------------------
// The library comes from the app, and cannot drift from it
// ---------------------------------------------------------------------------

test('every movement in every routine has a search query', () => {
  // The guard that makes lib/queries.mjs safe to forget about: add a stretch
  // to js/stretches.js and this fails until it can be searched for.
  const missing = allMovements().filter(m => !m.query).map(m => m.id);
  assert.deepEqual(missing, [], `no query in lib/queries.mjs for: ${missing.join(', ')}`);
});

test('no query names a movement that no routine uses', () => {
  // The other half of the guard. A typo'd id would otherwise sit here forever,
  // searching for nothing, and nothing would ever say so.
  const real = new Set(ROUTINES.flatMap(r => r.items).map(i => i.id));
  const orphans = Object.keys(QUERIES).filter(id => !real.has(id));
  assert.deepEqual(orphans, [], `queries.mjs mentions unknown ids: ${orphans.join(', ')}`);
});

test('every query has a search string and terms to check the result against', () => {
  for (const [id, q] of Object.entries(QUERIES)) {
    assert.ok(q.search && q.search.length > 3, `${id} has no search string`);
    assert.ok(Array.isArray(q.terms) && q.terms.length > 0, `${id} has no terms`);
    for (const group of q.terms) {
      assert.ok(Array.isArray(group) && group.length > 0, `${id} has an empty term group`);
    }
    // Channel names belong in score.mjs as a ranking signal, never in the
    // query -- searching "E3 Rehab x" and taking result 1 is what this
    // replaced.
    for (const tier of CHANNEL_TIERS) {
      for (const channel of tier) {
        assert.ok(
          !q.search.toLowerCase().includes(channel.toLowerCase()),
          `${id}'s query has a channel name in it`,
        );
      }
    }
  }
});

test('the rest-day library is the 13 files the plan asked for, in order', () => {
  const rows = movements('rest-day');
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map(m => m.n), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.equal(rows[0].file, '01 Deep squat hold');
  assert.equal(rows[1].file, '02 Cossack squat');
  assert.equal(rows[9].file, '10 Dead hang');
  assert.equal(rows[12].file, '13 Side plank');
});

test('the cool-down is available as a second library', () => {
  const rows = movements('post-class');
  assert.equal(rows.length, 13);
  assert.ok(rows.every(m => m.query), 'every stretch is searchable too');
});

// ---------------------------------------------------------------------------
// Filenames
// ---------------------------------------------------------------------------

test('a slash in a name becomes a hyphen rather than a directory', () => {
  // "90/90 lift-off" is the one name in either routine that would otherwise
  // create a folder called "90" containing a file called "90 lift-off.mp4".
  assert.equal(safeName('90/90 lift-off'), '90-90 lift-off');
  assert.equal(movements('rest-day')[2].file, '03 90-90 lift-off');
  assert.equal(safeName('a\\b'), 'a-b');
});

test('names keep their spaces, hyphens and case', () => {
  // A slug would be safer and worse: these are scrolled past by a human.
  assert.equal(safeName('Single-leg glute bridge'), 'Single-leg glute bridge');
  assert.equal(safeName('Prone thoracic press-up'), 'Prone thoracic press-up');
});

test('curly quotes and reserved characters are cleaned out', () => {
  assert.equal(safeName('Child’s pose'), "Child's pose");
  assert.equal(safeName('a<b>c:d"e|f?g*h'), 'abcdefgh');
  assert.equal(safeName('  spaced   out  '), 'spaced out');
  assert.equal(safeName('trailing dot.'), 'trailing dot');
});

test('no two files in a routine can collide', () => {
  for (const r of ROUTINES) {
    const files = movements(r.id).map(m => m.file);
    assert.equal(new Set(files).size, files.length, `${r.id} has a duplicate filename`);
    for (const f of files) {
      assert.ok(!/[<>:"/\\|?*]/.test(f), `${f} has a character a filesystem will refuse`);
    }
  }
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

test('a channel matches whatever it is written as', () => {
  assert.equal(normalizeChannel('The Prehab Guys'), 'prehabguys');
  assert.equal(channelTier('E3 Rehab'), 0);
  assert.equal(channelTier('e3rehab'), 0);
  assert.equal(channelTier('Strength Side'), 1);
  assert.equal(channelTier('Prehab Guys'), 1, '"The" is optional');
  assert.equal(channelTier('Some Guy'), -1);
});

test('term coverage counts groups, and any alternative satisfies its group', () => {
  const terms = [['90/90', '90 90'], ['lift', 'lift-off']];
  assert.equal(termCoverage('90/90 Lift Off Drill', terms), 1);
  assert.equal(termCoverage('90 90 hip lift-off', terms), 1);
  assert.equal(termCoverage('90/90 hip stretch', terms), 0.5);
  assert.equal(termCoverage('Hip mobility routine', terms), 0);
});

test('the preferred channel wins when everything else is equal', () => {
  const mine = cossack();
  const first = scoreCandidate(video({ channel: 'E3 Rehab' }), mine);
  const fallback = scoreCandidate(video({ channel: 'Squat University' }), mine);
  const unknown = scoreCandidate(video({ channel: 'Random Gym' }), mine);
  assert.ok(first.score > fallback.score, 'first choice beats a fallback');
  assert.ok(fallback.score > unknown.score, 'a fallback beats a channel we have no view on');
  assert.ok(first.reasons.some(r => r.includes('first choice')));
});

test('a short demonstration beats a long lesson from the same channel', () => {
  const mine = cossack();
  const short = scoreCandidate(video({ duration: 45 }), mine);
  const lesson = scoreCandidate(video({ duration: 780 }), mine);
  assert.ok(short.score > lesson.score);
});

test('an hour of anything is thrown out, whoever made it', () => {
  const mine = cossack();
  const out = scoreCandidate(video({ channel: 'E3 Rehab', duration: 4200 }), mine);
  assert.equal(out.rejected, 'over an hour');
});

test('a title that is not this movement is rejected, not merely ranked low', () => {
  const mine = cossack();
  const wrong = scoreCandidate(video({ title: 'Full Lower Body Mobility Routine' }), mine);
  assert.ok(wrong.rejected, 'nothing in the title says cossack squat');
});

test('compilations, top-10s and podcasts are pushed down', () => {
  const mine = cossack();
  const plain = scoreCandidate(video(), mine);
  for (const bad of ['Cossack Squat Compilation', 'Top 10 Cossack Squat Mistakes', 'Cossack Squat Podcast']) {
    const hit = scoreCandidate(video({ title: bad }), mine);
    assert.ok(hit.score < plain.score, `"${bad}" should score below a plain demo`);
  }
});

test('views are a tiebreak and can never outweigh being the right video', () => {
  // The whole point of the library is one person's hips, not what is popular.
  const mine = cossack();
  const viral = scoreCandidate(video({ channel: 'Random Gym', views: 50_000_000 }), mine);
  const right = scoreCandidate(video({ channel: 'E3 Rehab', views: 400 }), mine);
  assert.ok(right.score > viral.score);
});

test('rank dedupes by video id and sinks the rejects to the bottom', () => {
  const mine = cossack();
  const ranked = rank([
    video({ id: 'aaa', channel: 'Random Gym' }),
    video({ id: 'aaa', channel: 'E3 Rehab' }),   // same video, seen twice
    video({ id: 'bbb', channel: 'E3 Rehab' }),
    video({ id: 'ccc', title: 'Unrelated Warm Up' }),
  ], mine);
  assert.equal(ranked.length, 3, 'the duplicate id is dropped');
  assert.equal(ranked[0].id, 'bbb');
  assert.ok(ranked.at(-1).rejected, 'the reject is last, not missing');
});

test('a rejected candidate still says why it was rejected', () => {
  // A shortlist that silently drops the thing you were looking for is worse
  // than no shortlist.
  const out = scoreCandidate(video({ title: 'Yoga For Beginners' }), cossack());
  assert.ok(out.rejected.length > 0);
  assert.ok(out.reasons.length >= 0);
});

// ---------------------------------------------------------------------------
// clips.txt
// ---------------------------------------------------------------------------

test('times parse in every shape and round-trip', () => {
  assert.equal(toSeconds('00:10'), 10);
  assert.equal(toSeconds('1:30'), 90);
  assert.equal(toSeconds('00:01:30'), 90);
  assert.equal(toSeconds('45'), 45);
  assert.equal(toSeconds('  2:05 '), 125);
  assert.equal(toSeconds('banana'), null);
  assert.equal(toSeconds(''), null);
  assert.equal(toClock(90), '01:30');
  assert.equal(toClock(3661), '1:01:01');
  assert.equal(toSeconds(toClock(137)), 137);
});

test('a zero start is a time, not an absence', () => {
  // The same trap toMarkdown's field() hit with `rounds: 0` in v17: a falsy
  // value that means something. A clip starting at 00:00 is completely normal.
  assert.equal(toSeconds('00:00'), 0);
  const { rows, errors } = parseClips('01 X|https://youtu.be/aaaaaaaaaaa|00:00|00:12\n');
  assert.deepEqual(errors, []);
  assert.equal(rows[0].startSec, 0);
  assert.equal(rows[0].duration, 12);
});

test('comments and blank lines are skipped, four fields are required', () => {
  const { rows, errors } = parseClips([
    '# a comment',
    '',
    '01 Deep squat hold|https://youtu.be/aaaaaaaaaaa|00:10|00:22',
    '02 Broken|https://youtu.be/bbbbbbbbbbb|00:10',
  ].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '01 Deep squat hold');
  assert.equal(rows[0].duration, 12);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /line 4/);
});

test('an end before its start is an error, with the line number', () => {
  const { rows, errors } = parseClips('01 X|https://youtu.be/aaaaaaaaaaa|00:30|00:12\n');
  assert.equal(rows.length, 0);
  assert.match(errors[0], /line 1: end 00:12 is not after start 00:30/);
});

test('the same filename twice is an error rather than a silent overwrite', () => {
  const { errors } = parseClips([
    '01 X|https://youtu.be/aaaaaaaaaaa|00:00|00:10',
    '01 X|https://youtu.be/bbbbbbbbbbb|00:00|00:10',
  ].join('\n'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /already defined on line 1/);
});

test('? marks a row that has been found but not yet watched', () => {
  const { rows, errors } = parseClips(`01 X|https://youtu.be/aaaaaaaaaaa|00:00|${UNREVIEWED}\n`);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].unreviewed, true);
  assert.equal(rows[0].duration, null);
});

test('video ids come out of every URL shape youtube hands out', () => {
  assert.equal(videoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
  assert.equal(videoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  // Two videos never share a cache key, whatever the URL looks like.
  assert.notEqual(videoId('https://example.com/a'), videoId('https://example.com/b'));
  assert.equal(videoId('https://example.com/a'), videoId('https://example.com/a'));
});

test('the API backend understands ISO 8601 durations', () => {
  // The Data API is the only thing in the pipeline that reports a length this
  // way, and the scorer weighs length heavily.
  assert.equal(isoDuration('PT45S'), 45);
  assert.equal(isoDuration('PT1M30S'), 90);
  assert.equal(isoDuration('PT1H2M3S'), 3723);
  assert.equal(isoDuration('PT12M'), 720);
  assert.equal(isoDuration('nonsense'), 0);
  assert.equal(isoDuration(undefined), 0);
});

test('importing the API backend neither asks for a key nor makes a request', () => {
  // It is a module and a command; importing it must only be the former.
  assert.equal(typeof isoDuration, 'function');
});

// ---------------------------------------------------------------------------
// The shell, driven against fake binaries
// ---------------------------------------------------------------------------

/** A scratch working directory plus a PATH with fake yt-dlp and ffmpeg on it. */
function harness() {
  const home = mkdtempSync(join(tmpdir(), 'mobility-'));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  const log = join(home, 'calls.log');

  // yt-dlp: two jobs, same binary. With --dump-json it is a search and prints
  // one JSON object per line; otherwise it honours -o and writes a file.
  // Search results are built from the query so they match the movement's terms
  // the way real ones would.
  writeFileSync(join(bin, 'yt-dlp'), `#!/usr/bin/env bash
printf 'yt-dlp %s\\n' "$*" >> "${log}"

if [[ "$*" == *--dump-json* ]]; then
  q=""
  for a in "$@"; do
    case "$a" in ytsearch*:*) q="\${a#*:}" ;; esac
  done
  slug="\${q// /_}"
  emit() {
    printf '{"id":"%s","title":"%s","channel":"%s","duration":%s,"view_count":%s,"webpage_url":"https://youtu.be/%s"}\\n' \\
      "$1" "$2" "$3" "$4" "$5" "$1"
  }
  emit "good_\${slug}"  "$q tutorial"   "E3 Rehab"   60   9000
  emit "long_\${slug}"  "$q podcast"    "Random Gym" 5400 900000
  emit "other_\${slug}" "Unrelated warm up routine" "Random Gym" 60 500
  exit 0
fi

out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; fi
  shift
done
out="\${out/%(ext)s/mp4}"
[ -n "$out" ] && printf 'fake video\\n' > "$out"
exit 0
`);

  // ffmpeg: log the call, write the last argument.
  writeFileSync(join(bin, 'ffmpeg'), `#!/usr/bin/env bash
printf 'ffmpeg %s\\n' "$*" >> "${log}"
for last; do :; done
printf 'fake clip\\n' > "$last"
exit 0
`);

  chmodSync(join(bin, 'yt-dlp'), 0o755);
  chmodSync(join(bin, 'ffmpeg'), 0o755);

  const run = (args, extraEnv = {}) => execFileSync(TOOL, args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOBILITY_HOME: home, ...extraEnv },
  });

  return {
    home,
    run,
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    library: () => {
      const dir = join(home, 'BJJ Mobility Library');
      return existsSync(dir) ? readdirSync(dir).sort() : [];
    },
    review: () => {
      const dir = join(home, 'review');
      return existsSync(dir) ? readdirSync(dir).sort() : [];
    },
    writeClips: text => writeFileSync(join(home, 'clips.txt'), text),
    readClips: () => readFileSync(join(home, 'clips.txt'), 'utf8'),
    readCandidates: () => readFileSync(join(home, 'candidates.tsv'), 'utf8'),
  };
}

const URLS = [
  'https://youtu.be/aaaaaaaaaaa',
  'https://youtu.be/bbbbbbbbbbb',
  'https://youtu.be/ccccccccccc',
];

test('search shortlists every movement and writes a recipe for all 13', () => {
  const h = harness();
  h.run(['search']);

  const rows = h.readCandidates().trim().split('\n');
  assert.equal(rows[0].split('\t')[0], 'routine', 'the shortlist keeps its header');

  const top = rows.slice(1).map(r => r.split('\t')).filter(f => f[4] === '1');
  assert.equal(top.length, 13, 'one pick per movement');
  assert.ok(top.every(f => f[9] === 'E3 Rehab'), 'the preferred channel won every time');

  // The 90-minute podcast and the unrelated video are both in the results the
  // fake returned, and neither was picked.
  assert.ok(!h.readCandidates().includes('Unrelated warm up'));

  const { rows: clips, errors } = parseClips(h.readClips());
  assert.deepEqual(errors, []);
  assert.equal(clips.length, 13);
  assert.ok(clips.every(c => c.unreviewed), 'nothing has a window until someone watches it');
  assert.equal(clips[0].name, '01 Deep squat hold');
});

test('searching again never costs you a window you filled in by hand', () => {
  // The trim times are the only part of this pipeline a human did. Re-running
  // the search must not throw them away.
  const h = harness();
  h.run(['search']);

  const chosen = h.readClips().replace(
    /^(01 Deep squat hold\|[^|]+\|)00:00\|\?$/m,
    '$100:14|00:31',
  );
  assert.ok(chosen.includes('00:14|00:31'), 'the test edited the row it meant to');
  h.writeClips(chosen);

  h.run(['search']);
  const { rows } = parseClips(h.readClips());
  const kept = rows.find(r => r.name === '01 Deep squat hold');
  assert.equal(kept.start, '00:14');
  assert.equal(kept.end, '00:31');
  assert.equal(rows.filter(r => r.unreviewed).length, 12);
});

test('search narrowed to one movement leaves the rest of the recipe alone', () => {
  const h = harness();
  h.run(['search']);
  h.run(['search', 'cossack-squat']);

  const { rows } = parseClips(h.readClips());
  assert.equal(rows.length, 1, 'only the movement that was searched has a candidate');
  assert.equal(rows[0].name, '02 Cossack squat');
  assert.match(h.readClips(), /no candidate found\. Run: mobility search deep-squat-hold/);
});

test('build processes every row -- yt-dlp does not eat the work list', () => {
  // The bug in the original script: the loop read clips.txt on stdin, yt-dlp
  // read the rest of it, and you got one clip out of thirteen. The loop reads
  // fd 3 now, and this is the test that says so.
  const h = harness();
  h.writeClips([
    `01 Deep squat hold|${URLS[0]}|00:10|00:22`,
    `02 Cossack squat|${URLS[1]}|00:05|00:18`,
    `03 90-90 lift-off|${URLS[2]}|00:00|00:15`,
  ].join('\n'));

  h.run(['build']);

  assert.deepEqual(h.library(), [
    '01 Deep squat hold.mp4', '02 Cossack squat.mp4', '03 90-90 lift-off.mp4',
  ]);
  assert.equal(h.calls().filter(c => c.startsWith('ffmpeg')).length, 3);
});

test('ffmpeg seeks before -i and cuts with a duration', () => {
  // -i then -ss with -c copy (the obvious way, and what the sketch did) cuts at
  // the nearest keyframe: frozen frames, or a missing first second.
  const h = harness();
  h.writeClips(`01 Deep squat hold|${URLS[0]}|00:10|00:22\n`);
  h.run(['build']);

  const call = h.calls().find(c => c.startsWith('ffmpeg'));
  const args = call.split(' ');
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'), '-ss must come before -i');
  assert.equal(args[args.indexOf('-ss') + 1], '10');
  assert.equal(args[args.indexOf('-t') + 1], '12', 'end minus start, in seconds');
  assert.ok(!call.includes('-c copy'), 'a stream copy cannot cut where it was asked to');
  assert.ok(!call.includes('-to '), '-t is unambiguous after an input seek; -to is not');
});

test('a row with no trim window goes to review/, never to the library', () => {
  // Guessing a window would put a clip of the wrong thing in the library and
  // look like it had worked.
  const h = harness();
  h.writeClips([
    `01 Deep squat hold|${URLS[0]}|00:10|00:22`,
    `02 Cossack squat|${URLS[1]}|00:00|${UNREVIEWED}`,
  ].join('\n'));

  const out = h.run(['build']);

  assert.deepEqual(h.library(), ['01 Deep squat hold.mp4']);
  assert.deepEqual(h.review(), ['02 Cossack squat.mp4']);
  assert.match(out, /1 trimmed, 1 waiting on a window/);
});

test('one video used twice downloads once', () => {
  const h = harness();
  h.writeClips([
    `01 Deep squat hold|${URLS[0]}|00:00|00:10`,
    `02 Cossack squat|${URLS[0]}|00:20|00:30`,
  ].join('\n'));
  h.run(['build']);

  assert.equal(h.calls().filter(c => c.startsWith('yt-dlp')).length, 1, 'cached by video id');
  assert.equal(h.library().length, 2);
});

test('an already-downloaded review file counts as waiting, not as done', () => {
  // Found by running it: the skip counter did not look at what it was
  // skipping, so a second build reported "12 already done" for twelve clips
  // that did not exist yet. You would stop, believing you had a library.
  const h = harness();
  h.writeClips([
    `01 Deep squat hold|${URLS[0]}|00:10|00:22`,
    `02 Cossack squat|${URLS[1]}|00:00|${UNREVIEWED}`,
  ].join('\n'));

  h.run(['build']);
  const second = h.run(['build']);

  assert.match(second, /0 trimmed, 1 waiting on a window, 1 already done/);
  assert.match(second, /Watch the files in review\//);
});

test('a second build skips what is already there, and --force redoes it', () => {
  const h = harness();
  h.writeClips(`01 Deep squat hold|${URLS[0]}|00:10|00:22\n`);
  h.run(['build']);
  const first = h.calls().length;

  const again = h.run(['build']);
  assert.equal(h.calls().length, first, 'nothing ran the second time');
  assert.match(again, /1 already done/);

  h.run(['build', '--force']);
  assert.ok(h.calls().length > first, '--force cuts it again');
  assert.equal(h.calls().filter(c => c.startsWith('yt-dlp')).length, 1, 'but does not re-download');
});

test('a broken clips.txt stops the build instead of half-building', () => {
  const h = harness();
  h.writeClips([
    `01 Deep squat hold|${URLS[0]}|00:10|00:22`,
    '02 Cossack squat|not-a-url|00:05|00:18',
  ].join('\n'));

  assert.throws(() => h.run(['build']), /Command failed/);
  assert.deepEqual(h.library(), [], 'nothing was written');
});

test('build refuses to run before there is a recipe', () => {
  const h = harness();
  assert.throws(() => h.run(['build']), /Command failed/);
});

test('list and check work without any binaries at all', () => {
  const h = harness();
  const listed = h.run(['list']);
  assert.match(listed, /13 movements in "rest-day"/);
  assert.match(listed, /01 Deep squat hold\.mp4/);

  h.writeClips(`01 Deep squat hold|${URLS[0]}|00:10|00:22\n`);
  assert.match(h.run(['check']), /1 rows, 1 with a trim window, 0 problems/);
});

test('the tool writes nothing outside its working directory', () => {
  // MOBILITY_HOME is what keeps a test run from touching a real library --
  // and what lets the library live on an external drive.
  const h = harness();
  h.writeClips(`01 Deep squat hold|${URLS[0]}|00:10|00:22\n`);
  h.run(['build']);
  assert.ok(existsSync(join(h.home, 'BJJ Mobility Library', '01 Deep squat hold.mp4')));
  assert.ok(!existsSync(join(ROOT, 'tools', 'mobility-library', 'BJJ Mobility Library')));
});

console.log(`\n${passed} passed`);
