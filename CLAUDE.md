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

## Session log

- 2026-07-27 — Repo created (private, `main`). Captured product vision and open
  questions as docs. No code, no stack decision.
