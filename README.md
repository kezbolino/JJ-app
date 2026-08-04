# JJ-app

*Part of the Project Hub → [github.com/kezbolino/project-hub](https://github.com/kezbolino/project-hub)*

A personal knowledge system for jiu-jitsu. Log every class, let it tag itself,
and watch the map of your game fill in — including the parts you keep skipping.

**Status:** ✅ v0.2 — live at **https://kezbolino.github.io/JJ-app/**

Add it to your phone's home screen and it runs offline like a native app.

## What works today

- **Dashboard** — classes this week / 30 days / all time, your current focuses,
  recent class themes read back off your own entries, and a coverage prompt
- **Log a class** — date, gi/no-gi, techniques, rolling notes, thoughts
- **Tagging** — suggestions appear as you type, matched against the ontology and
  its synonyms; tap to accept, or add tags by hand. Nothing is tagged silently
- **Correct it as you go** — tap ⊘ on a wrong suggestion and it's never suggested
  again; **Teach a word** maps your gym's name for something onto the real
  technique. Corrections sync and can be undone in Settings
- **Coverage map** — every position broken down by role, gaps marked
- **Technique pages** — entries and videos assembled automatically from tags
- **Library** — save YouTube links, quick-capture notes / questions / coach
  principles, export and import your data
- **Search** — across everything
- **Sync & backup** — notes mirror to a private GitHub repo as markdown files,
  one per entry, readable on github.com and openable in Obsidian
- **Offline** — service worker caches the app shell; installable as a PWA

## The idea it's built around

Tags are **(position, role)** pairs, not words. That's what lets it say:

> "You've written about half guard pass 4 times — and nothing on retain."

A claim about your notes, never about your skill. See
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

## Setting up sync

1. Create a **private** repo for your notes (e.g. `jj-app-data`). Empty is fine.
2. Make a **fine-grained personal access token** scoped to that repo alone, with
   **Contents: read and write**.
3. In the app: Library → Set up sync → fill in owner, repo and token → Test
   connection → Sync now.

The token is stored in your browser and never written to either repo. Your notes
land as markdown:

```
class/2026-07-27-3f2a1b9c.md
question/2026-07-29-aaaa1111.md
README.md                       ← generated index
```

## Running it

No build, no dependencies. Any static file server:

```sh
python3 -m http.server 8099
# → http://localhost:8099
```

Tests (Playwright needed for the two browser ones):

```sh
node tests/markdown.test.mjs   # backup format round-trips
node tests/tagger.test.mjs     # tagging, including your corrections
node tests/smoke.mjs           # the whole app loop
node tests/sync.test.mjs       # sync, against a fake GitHub
node tests/mobility.test.mjs   # the clip-library tool in tools/
```

## Tools

[`tools/mobility-library/`](tools/mobility-library/) builds a folder of short
reference clips for the movements in the stretch and rest-day routines —
search YouTube, score the results, download, trim, rename. It's **desktop
tooling, not part of the app**: nothing there is loaded by `index.html` or
cached by the service worker, and it needs `yt-dlp` and `ffmpeg` on a machine.

## Docs

- [`docs/MVP.md`](docs/MVP.md) — what's in the first slice and what isn't
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — the schema and why it's shaped that way
- [`docs/ONTOLOGY.md`](docs/ONTOLOGY.md) — the technique tag structure **(needs review by someone who trains)**
- [`docs/VISION.md`](docs/VISION.md) — the long-term vision
- [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) — what's still undecided

## Next up

1. Voice capture — parked; design notes in [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) §14
2. Gi/no-gi per *technique*, not just per entry
3. Sync on save, instead of tapping "Sync now"
4. Structural ontology gaps (missing positions, gi/no-gi as an axis) — the
   in-app corrections handle vocabulary, not structure

## A note on privacy

This repo is public; **your notes are not in it.** They live in your browser and
in the separate private `jj-app-data` repo. The sync token is stored on your
device and never committed anywhere.
