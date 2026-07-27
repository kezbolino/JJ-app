# CLAUDE.md — BJJ Brain (repo `JJ-app`)

## What this is

**BJJ Brain** — a personal knowledge system for Brazilian jiu-jitsu. Journal
every class, connect everything into a knowledge graph, and surface patterns in
the user's game over years.

Repo name is `JJ-app`; product name is **BJJ Brain**. A rename to `bjj-brain`
is recommended and unresolved — see `docs/OPEN-QUESTIONS.md` §11.

Part of the Project Hub → `github.com/kezbolino/project-hub`.

## State of the repo

**Nothing is built.** No stack chosen, no dependencies, no build, no tests. The
repo currently contains documentation only:

- `docs/VISION.md` — full product vision (v1, 2026-07-27)
- `docs/MVP.md` — **the first slice; start here.** Supersedes VISION's "10 MVP
  features" list
- `docs/OPEN-QUESTIONS.md` — the decisions that block or reshape the build

## Rules

- **Read `docs/OPEN-QUESTIONS.md` before writing code.** Several unanswered
  questions (MVP boundary, data model, standalone vs Obsidian, competence
  signal) would cause rework if guessed at.
- This repo is **private**. Free GitHub Pages does not serve private repos, so
  the mobile-first design principle has no deployment path yet (§8).
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
