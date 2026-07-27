# CLAUDE.md — JJ-app

## What this is

A personal knowledge system for Brazilian jiu-jitsu. Journal every class,
connect everything into a knowledge graph, and surface patterns in the user's
game over years.

**Call it `JJ-app`.** "BJJ Brain" appears as the title of `docs/VISION.md` but
is a working title only — it came from ChatGPT and the user has explicitly
declined to rename the repo to match it. Don't reintroduce it as the project
name.

Part of the Project Hub → `github.com/kezbolino/project-hub`.

## Shape

A **static offline PWA**, same model as `kezbolino/social-media-app` (Wingman) —
*not* a localhost Node tool like Distill. Phone-first. The user builds remotely
via browser and phone, so **don't assume a local dev setup**: anything requiring
`npm run` on their machine is the wrong choice. Zero build step, or one that
runs in CI.

## State of the repo

**Nothing is built.** No stack chosen, no dependencies, no build, no tests. The
repo currently contains documentation only:

- `docs/VISION.md` — full product vision (v1, 2026-07-27)
- `docs/MVP.md` — **the first slice; start here.** Supersedes VISION's "10 MVP
  features" list
- `docs/OPEN-QUESTIONS.md` — the decisions that block or reshape the build

## Rules

- **Read `docs/OPEN-QUESTIONS.md` before writing code.** §13 (where data lives)
  blocks the first schema and must not be guessed at.
- This repo is **private**. Free GitHub Pages does not serve private repos, so
  there is no deployment path yet (§8) — either flip it public or host on
  Cloudflare/Netlify/Vercel. Note that public *code* does not mean public
  *notes*: journals live in browser storage, not in the repo.
- Don't let decisions live in chat windows — write them into
  `docs/OPEN-QUESTIONS.md` or `docs/VISION.md`, and update `HUB.md` in
  `project-hub` when status changes meaningfully.

## Known traps

- **Auto-tagging accuracy gates everything.** The knowledge graph, insights and
  radar charts all sit on top of tags. BJJ vocabulary is regional and
  synonym-heavy (knee slice / knee cut / knee slide). A canonical ontology
  probably needs to exist before the tagger does.
- **Cold start.** Most of the compelling features need months of data before
  they show anything. Anything shipped early has to be worth using while the
  graph is empty.
- **Capture friction is the whole product.** Logging happens after training,
  exhausted, often driving. If capture isn't near-zero effort, no data
  accumulates and nothing downstream exists.
- **Reuse from Distill:** `kezbolino/distill` already has a single
  `LLMProvider` interface with a keyless `mock` provider. Don't reinvent it.

## The one design decision that must not be got wrong

Coverage asymmetry ("you've written a lot about half guard sweeps — how's your
half guard passing?") needs **position × role** in the data model, not a flat
tag list. Roles are intents: play it / pass it / escape it / submit from it /
retain it / take it down. A gap is an empty cell next to a full one.

Retrofitting this later means re-tagging every entry ever written. Build it in
from the first schema. It powers the pentagon, knowledge gaps and
recommendations — all three are one computation over this matrix.

## Session log

- 2026-07-27 — Repo created (private, `main`). Captured product vision and open
  questions as docs. No code, no stack decision.
- 2026-07-27 — Scope sharpened with the user. Dashboard is the front door;
  annual wrapped demoted to nice-to-have; "Evidence" radar reframed from
  competence to coverage asymmetry (user's idea, and a better one). Wrote
  `docs/MVP.md`. Still no code or stack decision.
- 2026-07-27 — Shape settled: static offline PWA like Wingman, built remotely,
  not local. Gym publishes no curriculum, so the third dashboard panel became
  "recent class themes" derived from journal entries. No repo rename. Drafted
  `docs/ONTOLOGY.md` (position × role tags) — **needs the user's review as a
  practitioner**. Raised §13 (data persistence) as the blocking risk.
