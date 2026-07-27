# JJ-app

*Part of the Project Hub → [github.com/kezbolino/project-hub](https://github.com/kezbolino/project-hub)*

A personal knowledge system for jiu-jitsu. Log every class, let it tag itself,
and watch the map of your game fill in — including the parts you keep skipping.

**Status:** 🚧 v0.1 — the core loop works end to end. Not deployed yet.

## What works today

- **Dashboard** — classes this week / 30 days / all time, your current focuses,
  recent class themes read back off your own entries, and a coverage prompt
- **Log a class** — date, coach, gi/no-gi, techniques, rolling notes, thoughts
- **Tagging** — suggestions appear as you type, matched against the ontology and
  its synonyms; tap to accept, or add tags by hand. Nothing is tagged silently
- **Coverage map** — every position broken down by role, gaps marked
- **Technique pages** — entries and videos assembled automatically from tags
- **Library** — save YouTube links, quick-capture notes / questions / coach
  principles, export and import your data
- **Search** — across everything
- **Offline** — service worker caches the app shell; installable as a PWA

## The idea it's built around

Tags are **(position, role)** pairs, not words. That's what lets it say:

> "You've written about half guard pass 4 times — and nothing on retain."

A claim about your notes, never about your skill. See
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

## Running it

No build, no dependencies. Any static file server:

```sh
python3 -m http.server 8099
# → http://localhost:8099
```

Smoke test (needs Playwright installed):

```sh
node tests/smoke.mjs
```

## Docs

- [`docs/MVP.md`](docs/MVP.md) — what's in the first slice and what isn't
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — the schema and why it's shaped that way
- [`docs/ONTOLOGY.md`](docs/ONTOLOGY.md) — the technique tag structure **(needs review by someone who trains)**
- [`docs/VISION.md`](docs/VISION.md) — the long-term vision
- [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) — what's still undecided

## Next up

1. **Sync/backup to a private GitHub data repo** — right now your notes live in
   one browser and Export is the only safety net (`OPEN-QUESTIONS.md` §13)
2. **Deploy** — free GitHub Pages needs a public repo; this one is private
3. **Review the ontology** — wrong names and missing positions are expected
4. Voice capture, once the data model has proven itself
