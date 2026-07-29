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
*not* a localhost Node tool like Distill. Phone-first, and the phone is
**Android/Chrome** — don't assume iOS or Safari when reasoning about storage
limits, PWA install behaviour, mic access or OS automation. The user builds remotely
via browser and phone, so **don't assume a local dev setup**: anything requiring
`npm run` on their machine is the wrong choice.

**No build step, no dependencies, no framework.** Plain ES modules loaded
straight from disk. Keep it that way — it's what makes the app deployable to
any static host and editable from a phone.

## Layout

```
index.html            shell + tab bar
css/app.css           all styling; light and dark via prefers-color-scheme
js/app.js             hash router and boot
js/ontology.js        shipped positions, roles, techniques, synonyms  ← machine copy of docs/ONTOLOGY.md
js/overrides.js       the user's corrections: taught words, muted words
js/tagger.js          text → suggested tags (literal matching, no AI)
js/db.js              IndexedDB wrapper + migrations
js/store.js           entry CRUD and every derived query (coverage, gaps, themes)
js/backup.js          JSON export/import
js/markdown.js        entry ↔ markdown file (the backup format)
js/sync.js            GitHub backup repo sync, via the Git Data API
js/youtube.js         link parsing and title lookup
js/ui.js              h() element builder and shared bits
js/views/*.js         home, log, map, position, library, search, settings
sw.js                 offline cache — bump CACHE when files change
tests/                markdown round-trip, app smoke test, sync test
```

## Running and testing

```sh
node tests/markdown.test.mjs    # pure node, fast
node tests/tagger.test.mjs      # pure node, fast
python3 -m http.server 8099 &   # the two browser tests need this
node tests/smoke.mjs            # Playwright; the whole app loop
node tests/sync.test.mjs        # Playwright + fake GitHub (tests/fake-github.mjs)
```

**Run all four after touching anything in `js/`.** Between them they cover the
core loop (log → tag → technique page → dashboard → coverage prompt), tagging
including user corrections, backup format fidelity, and multi-device sync
including deletions.

## Rules

- **Read `docs/OPEN-QUESTIONS.md` before adding features.** §13 (where data
  lives) is still open and outranks new functionality.
- **`js/ontology.js` and `docs/ONTOLOGY.md` must stay in step.** The markdown is
  the human copy that the user reviews; the JS is what runs.
- **Don't edit `js/ontology.js` to record the user's personal preference.** That
  is what `js/overrides.js` is for — corrections they make in-app, which sync and
  can be undone. Only change the shipped ontology for things true of BJJ
  generally, and update the markdown copy in the same commit.
- **Bump `CACHE` in `sw.js`** whenever you add, remove or rename a file under
  `js/` or `css/`, and add new files to `SHELL`. Otherwise returning users get
  a stale app.
- Never render user content as HTML. `h()` in `js/ui.js` makes text nodes;
  don't reach for `innerHTML`.
- This repo is **public** and served by GitHub Pages at
  `https://kezbolino.github.io/JJ-app/`. **No secrets, ever** — no tokens, no
  keys. The user's sync token is entered in the app and lives in their browser's
  IndexedDB; it must never reach this repo or the notes repo.
- The journal itself lives in `kezbolino/jj-app-data` (**private**), not here.
  That separation is the whole reason this repo can be public.

## The one design decision that must not be got wrong

Coverage asymmetry ("you've written a lot about half guard sweeps — how's your
half guard passing?") needs **position × role** in the data model, not a flat
tag list. A gap is an empty cell next to a full one. This is already built —
see `docs/DATA-MODEL.md` — and it must survive any refactor.

Related discipline: the app reports what has been **written about**, never what
the user is **good at**. Note volume is attention, not skill. Don't let a
feature quietly start claiming competence.

## Sync — the rules that are easy to break

Local IndexedDB is the source of truth; a private GitHub repo holds a markdown
mirror. Full detail in `docs/DATA-MODEL.md`. Three things will silently corrupt
data if forgotten:

- **Never use `saveEntry` for sync bookkeeping — use `putEntryRaw`.**
  `saveEntry` restamps `updatedAt`, which is the merge key. Restamp it during a
  sync and every entry looks permanently newer than its remote copy, so two
  devices push at each other forever.
- **Deletions need tombstones.** Delete locally, and a pull sees an id it
  doesn't recognise in the repo and puts it straight back. `store.deleteEntry`
  writes a tombstone; push converts it to a file deletion; push clears it.
- **Front matter is a fixed tiny grammar, not YAML.** We write it and we parse
  it. Don't add a YAML library or free-form fields — `tests/markdown.test.mjs`
  is what stops the backup rotting.

## Known traps

- **Notes are only as safe as the user's sync setup.** Until they add a data
  repo and token, IndexedDB on one device is all there is; Library → Export is
  the fallback.
- **Cold start.** Most features need months of data. The dashboard was designed
  to be useful from day one; keep it that way.
- **Capture friction is the whole product.** If logging a class gets slower,
  nothing downstream gets data. Guard this over everything else.
- **Gap prompts need a threshold.** Below 3 entries in a sibling role, an empty
  role means nothing — flagging it just makes noise.
- **Reuse from Distill:** `kezbolino/distill` has a single `LLMProvider`
  interface with a keyless `mock` provider. Use it when tagging goes AI.
- **Voice capture is an offline voice keyboard, not in-app transcription.**
  `docs/OPEN-QUESTIONS.md` §14 (now RESOLVED). The primary path: the user
  dictates straight into a log field with a FOSS on-device voice keyboard
  (**Sayboard**, Vosk, from F-Droid — chosen because the phone is **CalyxOS**,
  which is de-Googled, so Gboard's offline voice needs Google Speech Services
  that simply aren't present). Zero code: the keyboard types into the textarea
  and the existing tagger tags it. JJ-app also registers as an Android **Web
  Share Target** (secondary path, for a standalone transcriber). No
  Whisper/WASM/model in the app — deliberately rejected to keep the "small
  files, no deps" shape. Don't add in-browser transcription without re-reading
  §14.

## Session log

- 2026-07-27 — Repo created (private, `main`). Captured product vision and open
  questions as docs. No code, no stack decision.
- 2026-07-27 — Scope sharpened with the user. Dashboard is the front door;
  annual wrapped demoted to nice-to-have; "Evidence" radar reframed from
  competence to coverage asymmetry (user's idea, and a better one). Wrote
  `docs/MVP.md`.
- 2026-07-27 — Shape settled: static offline PWA like Wingman, built remotely,
  not local. Gym publishes no curriculum, so the third dashboard panel became
  "recent class themes" derived from journal entries. No repo rename. Drafted
  `docs/ONTOLOGY.md` — **still needs the user's review as a practitioner**.
- 2026-07-27 — Built v0.1: the whole loop works end to end, smoke test green.
  Data still device-local; sync to a private data repo is the agreed next step
  and is not built.
- 2026-07-27 — Built markdown sync (§13 closed). Notes mirror to a private repo
  as one .md per entry, foldered by type, with a generated index; one commit per
  sync via the Git Data API; tombstoned deletions propagate between devices.
  Added `tests/markdown.test.mjs` and `tests/sync.test.mjs` (fake GitHub). Fixed
  two bugs found by those tests: the last `## section` was dropped on parse (JS
  has no `\Z`), and pull resurrected deleted notes.
- 2026-07-28 — **Shipped.** Repo made public, GitHub Pages enabled → live at
  `https://kezbolino.github.io/JJ-app/`. Private notes repo `jj-app-data`
  created and sync configured by the user. Remember to bump `CACHE` in `sw.js`
  on every deploy now that real users (one) have the old shell cached.
- 2026-07-28 — Ontology is now correctable in-app (`js/overrides.js`): ⊘ mutes a
  wrong suggestion, "Teach a word" maps the user's vocabulary onto a technique.
  Corrections sync to the notes repo as `ontology-overrides.md` and are listed
  with undo in Settings. `suggestTags` now returns `{tag, term}` so a bad
  suggestion can be muted at source; `suggestTagsOnly` is the old shape. Added
  `tests/tagger.test.mjs`. Suite is 43 tests. sw CACHE → v3.
- 2026-07-28 — Removed the `coach` field at the user's request ("remove the
  teacher's name, it's not necessary"). Gone from the form, from display, from
  search and from the markdown front matter. `fromMarkdown` ignores the key, so
  notes already in the backup repo still parse, and their old versions remain in
  that repo's git history. **Don't reintroduce it unasked.** sw CACHE → v4.
- 2026-07-28 — User is on **Android**, not iOS; corrected the docs that assumed
  otherwise. Worked out the voice-capture design and **parked it** at their
  request — see `docs/OPEN-QUESTIONS.md` §14. No code written for it.
- 2026-07-28 — **Figma redesign** implemented (layout only — colour scheme left
  as-is at the user's request; the app keeps its blue accent, not the Figma
  orange). Global sticky topbar removed; each view now owns its header. Tab bar
  gained SVG icons (`js/ui.js` `icon()` / `SHAPES`, drawn in the SVG namespace
  since `h()` can't make SVG). Home: hero card (total classes + week / 30-day /
  gi-nogi% trio), focus as a pin banner with inline EDIT, single "Last session"
  card, big CTA. The **"recent class themes" panel was dropped from Home** to
  match the redesign — not deleted from the model, just no longer surfaced there;
  restore if wanted. Map: added "Your map" header, a decorative radar backdrop
  and an all-time "Exposure breakdown" above the untouched position×role
  coverage (the sacred bit, kept). Log: date+gi on one row, flat uppercase field
  labels, manual-add + teach-a-word tucked behind "Show options". Library:
  in-page search field (topbar search button is gone), "N not backed up yet"
  banner when sync is configured and dirty, typed sections (Saved videos / Notes
  / Everything). Two honest calls: no fabricated "mat hours" badge, and the map
  % is labelled attention-not-skill. Watch for `root.append(null|undefined)` —
  Node stringifies them to visible "null"/"undefined"; conditional children in
  a `root.append` must go through `[...].filter(Boolean)`. Added `giRatio` and
  `pendingSync` to `store.js`; updated `tests/smoke.mjs` selectors to the new
  DOM. sw CACHE → v5.
- 2026-07-28 — **"Working on" is now flashcards.** The focus list (the "things
  you're working on") became a flippable deck. Each focus is now `{front, back}`
  instead of a plain string — front is the thing, back is your cues/notes to
  drill; `store.getFocuses`/`setFocuses` normalise on read so old string data
  still loads (see `normalizeFocus`). New view `js/views/focus.js` at `#/focus`:
  one card at a time, tap to flip (CSS 3D `rotateY`), prev/next with a counter,
  and an "Edit deck" panel to add (front required, back optional) / remove.
  Editing moved off Home — the Home focus banner is now a link into the deck
  ("Working on: … · Drill"), no longer an inline editor. Router gained the
  `focus` case and maps its tab to Home. Focuses are still device-local settings
  (they don't sync). sw CACHE → v6, `js/views/focus.js` added to SHELL. All four
  test suites green; drove the new deck in a browser (add/flip/next/remove +
  Home banner) since no suite covers it.
- 2026-07-29 — **Made editing an existing log discoverable.** User reported that
  editing a log "logged a new entry/new day." Edit-by-id has worked since v0.1
  (`log.js`: `id ? getEntry(id) : newEntry()`, `saveEntry` keys on `entry.id`) and
  reproduces fine across home/library/past-date/note-type/legacy-no-sections —
  the store never mints a new id on save. Root cause was **discoverability**: the
  only labelled action is "Log a class" (no id → new entry dated today), while the
  real edit path — tapping the Home "Last session" card or a Library row — carried
  no visible cue, so it's easy to re-log instead. Fix: added an explicit "✎ Edit"
  affordance to the Home last-session card (`s-edit`, new `edit` pencil in
  `ui.js` `SHAPES`, CSS pushes it right in `.s-head`). No logic change to the save
  path. sw CACHE → v7. Smoke green; verified in a browser that the Edit cue opens
  the entry and saves in place (still one entry).
- 2026-07-29 — **"Your game" — liked moves + adjacency suggestions.** New block
  at the top of the Map: star moves you like, and the app suggests similar or
  adjacent ones to drill. A move is `{position, technique}` (same shape as a
  technique tag). Suggestion engine is a new pure module `js/moves.js`
  (`suggestMoves(entries, liked)`), ontology-only so it unit-tests in node —
  **no AI, literal like the tagger**. Adjacency: +3 same position & role
  (siblings), +3 the same move in another position (e.g. Kimura closed-guard →
  Kimura side-control), +2/class it's journaled alongside a liked move (capped);
  scores add, strongest reason shown, liked moves never suggested back. Liked
  moves are a `likedMoves` **setting** via `store.getLikedMoves` /
  `toggleLikedMove` — so, like focuses, they're **device-local and don't sync
  yet** (would need extending the notes-repo format; deferred). Star affordance:
  `.starbtn` + `icon('star')` (gold `--warm` when on) on each technique on the
  position page (`Techniques — ★ the ones you like`) and on each suggestion; the
  Map block also has a Position→Move picker to star without hunting. Placement +
  algorithm chosen with the user (Map section; ontology + own notes). Added
  `tests/moves.test.mjs` (7 tests) and a smoke step (star → Map → adjacent moves).
  sw CACHE → v7, `js/moves.js` added to SHELL.
- 2026-07-29 — **Voice notes via a share target (§14 resolved).** User wanted
  local, private, offline transcription and found a standalone on-device
  transcriber (Scrib) on F-Droid. Chose *not* to run Whisper in the PWA — a
  model + WASM/WebGPU runtime is tens of MB and breaks the "small files, no
  deps" identity. Instead JJ-app is now an Android **Web Share Target**: record
  and transcribe in the dedicated app → Share → JJ-app opens a fresh log entry
  with the transcript in "Rolling notes", and the existing tagger tags it. No
  audio/model/key touches this app. `share_target` added to
  `manifest.webmanifest` (GET → `./?share_text=…`); `consumeShare()` in
  `js/app.js` stashes the text in sessionStorage, `replaceState`s the query away
  and routes to `#/log` (single render, reload can't re-import); `js/views/log.js`
  reads the stash once for new entries only and toasts; `sw.js` gained an
  `ignoreSearch` fallback so the shared URL serves the shell offline. sw CACHE →
  v8. All four suites green; drove the real share flow in a browser (share URL →
  prefilled new entry → tags surfaced → reload doesn't double up), no suite
  covers it. Note this needs testing in the *installed* PWA on the actual phone
  (§14: mic/PWA quirks are cheap to check, expensive to find late) — the share
  target only appears in Android's share sheet once JJ-app is installed.
- 2026-07-29 — **Voice capture landed as a voice keyboard; added an in-app
  hint.** Followed the share-target work by trialling capture on the real phone.
  Scrib turned out to transcribe existing audio files only (no recorder), so
  recorder→Scrib→JJ was three apps — too clunky. Pivoted to dictating straight
  into a log field with an offline voice keyboard. Gboard's offline voice was a
  dead end: the phone runs **CalyxOS** (de-Googled), and Gboard's on-device
  speech depends on Google Speech Services, which isn't installed and can't be
  added — "On-device speech recognition" is simply empty there. Landed on
  **Sayboard** (FOSS, Vosk, F-Droid, self-contained model, no Google, fully
  offline) — works. So the real capture path needs *no app code*: keyboard types
  into the textarea, tagger tags it; the Web Share Target stays as a secondary
  path. To make the path discoverable (no visible in-app cue otherwise), added a
  `mic` icon to `js/ui.js` `SHAPES` and a one-line hint under the log fields
  ("tap a field and switch to your voice keyboard") — `.mic-hint` in
  `css/app.css`, accent-coloured 16px icon. sw CACHE → v9. All four suites green;
  verified the hint renders at the right size in a browser.
