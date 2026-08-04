# BJJ Mobility Library

A folder of short reference clips for the movements in the app's routines.

```
Search YouTube -> score the results -> download -> trim -> rename -> a folder
```

This is **desktop tooling, not part of the app.** Nothing here is loaded by
`index.html`, nothing is listed in `sw.js`, and `CACHE`/`VERSION` do not move
when you change it. The rest of JJ-app is a static PWA you can edit from a
phone; this needs a machine with `yt-dlp` and `ffmpeg` on it, which is why it
lives off to one side in `tools/`.

## Install

```sh
brew install yt-dlp ffmpeg          # macOS
# or: sudo apt install ffmpeg && pipx install yt-dlp

cd tools/mobility-library
./mobility doctor
```

No pip, no npm, no API key. Node is already needed to run the test suite, and
everything else is `yt-dlp` and `ffmpeg`.

## Use

```sh
./mobility search       # find candidates, shortlist them, write clips.txt
./mobility build        # download the shortlist into review/
#                         watch them, pick a start and end for each,
#                         put the times in clips.txt
./mobility build        # trim into "BJJ Mobility Library/"
```

`./mobility all` runs search then build in one go.

The second `build` costs no bandwidth: downloads are cached by video id, so
re-cutting a clip re-reads the file you already have. Files that already exist
are skipped unless you pass `--force`.

### Other commands

| Command | What it does |
| --- | --- |
| `./mobility list` | the movements, their targets and their search queries |
| `./mobility search cossack-squat` | re-search one movement (any number of ids) |
| `./mobility clips` | rebuild `clips.txt` from the last search |
| `./mobility check` | validate `clips.txt` and say how many have a window |
| `./mobility urls` | `exercise_urls.csv`, the flat two-column list |
| `--routine post-class` | the cool-down's 13 stretches instead of the rest day's 13 |
| `--api` | search with the YouTube Data API instead of yt-dlp (see below) |

## What comes out

```
BJJ Mobility Library/
├── 01 Deep squat hold.mp4
├── 02 Cossack squat.mp4
├── 03 90-90 lift-off.mp4
...
└── 13 Side plank.mp4
```

The names, the numbering and the order come from the **rest-day routine in
`js/stretches.js`** — there is no second list of exercises to keep in step.
Add a movement to the routine and it appears here; the only thing it needs is
a search query in `lib/queries.mjs`, and `tests/mobility.test.mjs` fails until
it has one.

Sentence case (`03 90-90 lift-off`, not `03 90-90 Lift Off`) is on purpose: the
file is named exactly what the screen in your pocket calls it. `/` becomes `-`
because a slash cannot be in a filename.

## clips.txt is the library

```
# Cossack squat -- Strength Side: How To Cossack Squat (0:58, score 91)
02 Cossack squat|https://youtu.be/xxxxxxxxxxx|00:05|00:18
```

Four fields: filename, URL, start, end. `#` lines are ignored. An end of `?`
means *you have not picked a window yet* — those get downloaded whole into
`review/` so you can scrub them, and nothing lands in the library until you
have chosen. The tool cannot watch a video for you and does not pretend to.

**`clips.txt` is the one file here that belongs in git.** A few hundred bytes
of text that fully describes the library: delete every `.mp4` and one
`./mobility build` puts them all back. The media is gitignored.

Re-running `./mobility search` never overwrites a window you filled in by hand.

## How a video gets picked

`lib/score.mjs`, and it shows its working — `candidates.tsv` keeps the top five
per movement with the reasons each one scored what it did.

- **Does the title name the movement** (up to 30). Below half the terms it is
  rejected outright as a different exercise.
- **Channel** (up to 50): E3 Rehab first, then Squat University / Strength Side
  / The Prehab Guys, then a third tier you can edit.
- **Length** (up to 25): a 40-second demonstration beats a 20-minute lesson, and
  an hour-long anything is thrown out.
- **Title words**: "how to", "tutorial", "demo" up; "compilation", "top 10
  mistakes", "podcast", "vlog" down hard.
- **Views**: capped at 10, deliberately. Popularity is a tiebreak, not a
  quality signal.

The original plan searched `"E3 Rehab cossack squat"` and took result #1. That
fails silently twice over: if E3 Rehab has never covered the movement you get
whatever ranked first for a query with their name in it, and if someone else
made a better video you never see it. So the channel preference is a *ranking*
signal applied to a plain search, not a filter baked into the query.

## Option A: the YouTube Data API

`--api` swaps yt-dlp's search for the Data API. Both print the same JSON
stream, so nothing else in the pipeline changes.

```sh
export YT_API_KEY=...
./mobility search --api
```

You do not need it. yt-dlp's search needs no key, no quota and no Google
project. It is here because the plan asked for both, and because the API
returns exact durations and view counts in one round trip.

**The key never goes in this repo.** It is read from `$YT_API_KEY` or
`~/.config/mobility/youtube-api-key` and nowhere else; nothing here writes a
key to disk. JJ-app is public and served by GitHub Pages — a key committed
here is a key published.

## Three things in here that look wrong and are not

1. **The loops read their work list on file descriptor 3.** `yt-dlp` reads
   stdin, so the obvious `while read ... done < clips.txt` hands it the rest of
   the file: you process row one and the loop ends. This is the bug that makes
   a 13-line clips.txt produce one clip.
2. **ffmpeg gets `-ss` before `-i`, cuts with `-t`, and re-encodes.** The
   obvious `-i file -ss 10 -to 22 -c copy` cuts at the nearest keyframe instead
   of where you asked — on a short clip that means frozen frames at the start or
   a missing first second. Re-encoding a 15-second clip is instant.
3. **`?` as an end time.** See above; a placeholder window would produce a
   library of clips of the wrong thing that looked like it had worked.

## Tests

```sh
node tests/mobility.test.mjs     # from the repo root, pure node, no network
```

It covers the scorer, the `clips.txt` grammar, the filename rules, and the
drift guard between the routines and `lib/queries.mjs`. The last few tests run
`./mobility build` end to end against **fake `yt-dlp` and `ffmpeg` binaries** on
`PATH`, which is how the stdin bug and the ffmpeg argument order stay fixed
without downloading anything.

## A note on what this is for

Personal reference. It saves videos other people made, to a folder on one
laptop, so a movement can be checked without four minutes of scrolling. It
doesn't republish anything, and the app never links to a local file — the
routines in the app are self-contained.
