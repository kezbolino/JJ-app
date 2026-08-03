# CLAUDE.md — JJ-app

## What this is

A personal knowledge system for Brazilian jiu-jitsu. Journal every class,
connect everything into a knowledge graph, and surface patterns in the user's
game over years.

**Call it `JJ-app`.** "BJJ Brain" appears as the title of `docs/VISION.md` but
is a working title only — it came from ChatGPT and the user has explicitly
declined to rename the repo to match it. Don't reintroduce it as the project
name.

**On-screen product name is `Ju Ji`, as of 2026-08-03** — the brand mark, page
title, manifest name and footer all read "Ju Ji" now; see the session log
entry for that date. This is separate from the repo/codebase name above: the
GitHub repo, file paths and internal identifiers stay `JJ-app`/`jj-app-*`.
Don't conflate the two or "fix" one to match the other.

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
js/stretches.js       the post-class cool-down: stretches, timing, segments
js/stretch-art.js     ~47 KB of figure paths — data only, don't hand-edit
js/views/*.js         home, log, map, position, library, search, settings, stretch
sw.js                 offline cache — bump CACHE when files change
tests/                markdown round-trip, app smoke test, sync test
```

## Running and testing

```sh
node tests/markdown.test.mjs    # pure node, fast
node tests/tagger.test.mjs      # pure node, fast
node tests/moves.test.mjs       # pure node, fast
node tests/stretches.test.mjs   # pure node, fast — routine data + timing maths
node tests/schedule.test.mjs    # pure node, fast — dates, SRS, attendance
python3 -m http.server 8099 &   # the three browser tests need this
node tests/smoke.mjs            # Playwright; the whole app loop
node tests/sync.test.mjs        # Playwright + fake GitHub (tests/fake-github.mjs)
node tests/features.test.mjs    # Playwright; calendar, deck, trash, links, stretch
```

**Run all eight after touching anything in `js/`.** Between them they cover the
core loop (log → tag → technique page → dashboard → coverage prompt), tagging
including user corrections, backup format fidelity, multi-device sync including
deletions, the move-suggestion engine, the stretch routine, and everything
added in v17.

`tests/schedule.test.mjs` is worth running under a couple of timezones —
`TZ=America/Los_Angeles` and `TZ=Australia/Sydney` — because the date bugs it
guards against are invisible on a UTC box.

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
- 2026-07-29 — **Version footer + sync button + daily autosaver.** Three small
  home/chrome tweaks. (1) A visible version number: new single-source module
  `js/version.js` (`VERSION`), rendered as a `JJ-app v10` footer via `#appfoot`
  in `index.html` + `.appfoot` CSS, set from `js/app.js`. **`VERSION` and `CACHE`
  in `sw.js` now move together on every deploy** — the footer only means "latest"
  if they match. (2) The Home top-right button (was the profile/⚙ avatar →
  Settings) is now a **sync control** using `icon('cloud')`: unconfigured → links
  to Settings to set up sync; configured → taps to `sync.sync()` now, spins while
  busy (`.busy`), shows a `--warm` dot when `store.pendingSync` > 0 (`.pending`).
  Settings is still reachable — Library links to it twice. (3) **Daily
  autosaver**: `home()` fires a quiet background `sync.sync()` if configured and
  `lastSyncAt` is older than today (calendar-day gate), then re-renders. sw CACHE
  → v10, `js/version.js` added to SHELL. All five suites green; screenshot-checked
  the footer + cloud button. NB: reported "front page elements all over the place"
  could **not** be reproduced on clean `main` (home renders correctly, empty and
  with data) — most likely a stale/partial service-worker cache on the installed
  PWA; the v10 bump forces a fresh consistent shell. Awaiting a phone screenshot
  if v10 doesn't clear it.
- 2026-07-29 — **Found and fixed the "front page all over the place" bug.** A v10
  phone screenshot showed it was *not* a stale cache — the footer read v10 and
  only the Home **"Last session" card** was broken (white background collapsed to
  corner slivers, content spilling out). Root cause: `.card` sets no `display`,
  and that card is an anchor (`h('a.card.session', …)`), so it rendered as an
  **inline** element — the background painted only around the inline line-boxes
  while the block children overflowed. Latent since the Figma redesign; only
  visible once a class is logged, which is why the empty-state screenshots looked
  clean and it never reproduced (the earlier data-seed via dynamic import silently
  failed, so I never saw a populated card — lesson: seed through the real Log form,
  as the smoke test does). One-line fix: `a.card { display: block; }`. Verified by
  logging a class through the form and screenshotting a proper contained card. sw
  CACHE → v11, VERSION → v11. All five suites green.
- 2026-07-29 — **Style-guide adopted into the real CSS (Duolingo/Brilliant
  language).** User supplied a design system and asked to adopt it in
  `css/app.css` (not just document it). Applied the *language* onto JJ-app's
  existing class taxonomy — no class renames — so all smoke selectors and the
  sacred position×role coverage map are untouched. **Colours stayed the app's
  own blue** (the Figma orange was declined earlier; the guide names no colours).
  Landed: (1) **Typography** — brand face **Nunito**, self-hosted at
  `fonts/nunito.woff2` (39 KB variable woff2, weight 400–900, pulled from the
  `@fontsource-variable/nunito` npm tarball since CDNs are proxy-blocked; OFL,
  redistributable). One `--font-family` var on `:root`, body weight 500,
  buttons/labels/headings 700–800. (2) **Chunky pill buttons** — `.btn` is now a
  full pill (`--btn-radius: 999px`) with a solid colour *edge* via
  `box-shadow: 0 4px 0 <edge>`; `:active` does `translateY(4px)` and the shadow
  collapses to 0 (fast down, springy back). `.primary` uses an accent edge,
  `.cta` a chunkier 6px edge + a slow `breathe`. (3) **Nav** — a soft tinted pill
  springs in behind the active tab's icon (`.tabbar a::before`, CSS overrides the
  inline SVG `stroke-width` on the active tab). (4) Inputs → 12px radius, focus
  swaps border to primary + a soft ring (no hard outline). (5) Coverage/exposure
  bars → recessed inset groove + 0.8s sweep (map *structure* unchanged). (6)
  **Motion** — one master `--spring` var everywhere; `.view > *` rises in a
  staggered cascade on every route (router rebuilds the nodes, so it re-fires =
  the incoming-screen entrance, no JS); chips pop; a full `prefers-reduced-motion`
  disable list at the bottom. Entrance animations fill **backwards** only — a
  forwards fill would freeze the 3D button press mid-air (learned trap, per the
  guide). (7) **Alt styles wired as the guide describes** — new `js/appearance.js`
  persists an App-font pick (Nunito/System/Serif/Mono; only Nunito bundled, rest
  are system faces) and a Button-style pick (Chunky / iOS-flat) to localStorage
  (device-local, unsynced, like focuses), applied as `<html data-font>` /
  `<html data-btn>`; `app.js` calls `appearance.apply()` on boot; Settings gained
  an **Appearance** card (segmented pickers that apply live). `data-btn="ios"`
  flattens the plunge to a dim+shrink. sw CACHE → v12, VERSION → v12;
  `fonts/nunito.woff2` and `js/appearance.js` added to SHELL. All five suites
  green; screenshot-verified home/map/log/settings + the iOS-flat/serif variant
  (seeded through the real Log form). No suite covers the CSS/appearance toggles.
- 2026-07-31 — **v13 redesign: the "Stripe × Tatami" language** (from a Claude
  design handoff). Shape language went **999px pills → 22px rounded rectangles**;
  the chunky pressable edge stayed and got deeper (7px CTA · 5px card/primary ·
  4px paired · 3px inline/segmented). **Light is now the default**, dark follows
  the OS, and Settings → Appearance gained a **Theme** picker (Auto/Light/Dark)
  that pins either — `js/appearance.js` now writes `data-theme` alongside
  `data-font`/`data-btn`. The dark palette is deliberately **written out twice**
  in `css/app.css` (`@media prefers-color-scheme: dark` +
  `:root[data-theme="dark"]`): there is no build step to factor it out, and doing
  it in JS would flash the wrong theme on boot. New rule the tokens enforce:
  **blue = UI/action, ink = data, amber = gap/attention only** (amber's four
  jobs: gap panel, zero cells/rails, pending sync, the belt mark's third
  segment). Landed: brand mark (JJ + three-segment belt) replacing the blue
  wordmark; sync button now a 42px squircle (behaviour untouched); hero gained a
  gi-share rail and `--surface-2` stat tiles; **tally squares** (20 discrete
  cells, `tally()` in `ui.js`) replaced the exposure bar; a **position × role
  heatmap** replaced the decorative radar; the position page's coverage bars
  became **rails**, where a zero role is a full-width dashed amber rail (length
  must never imply a small amount where there is none); Working-on got a deck
  progress rail and a NOW badge in the list. **Class names were not renamed**
  (`.cov-*`, `.exp-*`, `.btn.primary/.cta/.small` carry the handoff's
  `.rrow`/`.btn--accent` visuals) — same call as the v12 style-guide pass, and it
  is what keeps the sacred position×role chart and the smoke selectors intact.
  Two judgement calls worth knowing: (1) the handoff's fixed 4-column heatmap
  axis was **tried and dropped** — roles vary by position, so one shared axis
  left Side Control and Mount as rows of "not applicable" dots; the axis is now
  every role the shown positions actually use, scrolling sideways inside its own
  box with the row labels pinned. (2) The tab bar stayed `position: fixed` with
  matching body padding rather than becoming a flex sibling — the handoff's "it
  scrolls away on tall screens" bug does not exist here, and a fixed bar cannot
  have it. Map order is now heatmap → tally → your game → gaps → positions →
  untouched; the per-position rails moved off Map (the heatmap *is* that data)
  and live on the position page. Neutral `.btn` gained a `--btn-line` outline —
  without it a white button on a white card was invisible. sw CACHE → v13,
  VERSION → v13, no new files. All five suites green; screenshot-verified every
  screen in light and dark, plus pinned-light-on-dark-OS, pinned-dark-on-light-OS,
  iOS-flat and reduced motion (0 running animations). **Trap found:** an
  infinitely breathing CTA is never "stable" for Playwright and the click times
  out — `breathe` now holds at rest for 45% of its cycle, which both fixes the
  click and is what a breath actually does.
- 2026-07-31 — **Attendance backfill + a sync-format bug it exposed.** User supplied
  a markdown attendance log for Apr–Jul 2026 (39 classes, 13 gi / 26 no-gi, Dark
  Star Jiu Jitsu). Delivered as a **JSON backup file for Library → Import**, not
  as code and not by writing to the notes repo: IndexedDB on their phone is the
  source of truth and Import is the app's own designed route in. Two deliberate
  calls: **no tags** on any of the 39 (the log records that a class happened, not
  what was in it — inventing tags would put fiction in the coverage map), and
  **no `settings` key** in the file (importing settings would clobber the
  flashcard deck, starred moves and sync config already on the device). Ids are
  **deterministic and date-seeded** (`20260403-a771-4e05-9c3a-20260403a771`) so
  re-importing the same file is a no-op — verified: second import is 0 added /
  39 skipped. Note this cannot dedupe against a class they logged *by hand* on
  the same date; those ids differ. The three rows the log flagged (May 20 and
  Apr 1 unconfirmed, Apr 3 "Jiu Jitsu & Wrestling") carry that text in
  `sections.thoughts`, so they're findable by searching "unconfirmed".
  **Bug found while checking the entries would survive sync:** `fromMarkdown`
  composed `body` from `[title, ...sections]` and only *afterwards* recognised a
  generated `# Class — <date>` heading as noise and cleared the title — so the
  heading stayed baked into the body. Class entries written in the app never have
  a title (the Log form has no such field), so **every class note picked up a junk
  first line on every device that pulled it**. One-line reorder: strip the
  generated title before composing the body. It survived this long because
  `tests/markdown.test.mjs` asserted on sections and tags but never on `body`;
  that assertion is now there, plus a dedicated regression test and one guarding
  that a *real* title (e.g. a video's) still survives. Suite is 13 markdown tests.
  sw CACHE → v14, VERSION → v14.
- 2026-07-31 — **Headings dropped to weight 600.** User found the page titles too
  heavy. Nunito is a **variable** face (`font-weight: 400 900` from the one 39 KB
  file), confirmed by measuring rendered widths per weight in a browser — 400
  through 900 all interpolate — so a lighter heading costs no extra download.
  `h1/h2/h3`, `.page-title` and `.section-head h3` went 800/900 → **600** (tried
  700 first; user asked for one step lighter), and `.page-title`'s tracking
  loosened -.035em → -.015em (tight negative tracking is what makes a heavy face
  read as dense; 600 needs much less of it). Note `.page-sub` is also 600 — the
  title/subtitle hierarchy is carried by size and colour, not weight. A follow-up
  pass took the **numbers and the brand mark** down too, after the user said they
  still read fat: `.hero-num` 900 → **600** (large type carries a light weight
  well), `.hero-stat .n` / `.stat .n` 900 → **700** so the small tiles don't sit
  heavier than the big number they support, and `.brand-jj` 900 → **700** with
  tracking -1.6px → -1px. Tracking was loosened at every step — it is half of what
  made the heavy weights read as dense. The rule the scale now follows: **weight
  goes UP as type gets smaller** — 600 for headings and the hero number, 700 for
  the brand mark and stat tiles, 800–900 only for small uppercase labels and
  button text, where the size needs the weight. Left at 900 on purpose: `.btn`
  labels, `.card-title` eyebrows, `.now-badge`, `.fc-text`. sw CACHE → v15,
  VERSION → v15.
- 2026-07-31 — **Brand mark now uses the real belt ranks.** User asked for jiu
  jitsu belt colours instead of the app's own. The three-segment mark
  (ink/blue/amber, decreasing widths) became **five equal segments: white, blue,
  purple, brown, black** — the adult ranks in order, which also reads as the
  progression the app is about. Side effect worth keeping: **amber is down to
  three jobs** (gap panel, zero cells/rails, pending sync) and no longer appears
  in the brand at all, so it is now purely "gap / waiting on you". `BELT_RANKS`
  and `brandMark()` live in `js/ui.js`; the mark is one `role="img"` with a label,
  not five decorative divs. Two traps handled: **white disappears on a light
  background and black on a dark one**, so every segment carries a
  `--belt-line` hairline, and `--belt-white` / `--belt-black` are per-theme
  tokens. On dark, black is **#2a2e37**, not near-black — a true black bar reads
  as an empty outlined slot, which is the wrong look for the most meaningful
  rank. Blue is #2352a8, deliberately darker than `--accent` (#3a63f0) so a rank
  colour is never mistaken for the UI's action colour. sw CACHE / VERSION stay at
  v15 (not yet deployed).
- 2026-07-31 — **Belt mark is now a timeline.** User asked to size the segments by
  how long each belt takes on average, turning the brand device into a small
  progression chart. Widths come from `BELT_RANKS` in `js/ui.js`, which now
  carries `{rank, years}` — white 2, blue 2.5, purple 2, brown 1.5, black 3 — at
  `PX_PER_YEAR = 4.4`, giving 9/11/9/7/13px and a ~61px mark. The numbers live in
  the JS, not the CSS, precisely because they are **claims about the sport, not
  styling**; anyone changing them should see the comment saying they are rough
  community averages that vary hugely by gym and training frequency. Black uses
  the IBJJF's 3 years to first degree so it stays a real number instead of "the
  rest of your life", which would either dominate the mark or need special-casing.
  Each segment carries a `title` and the group an `aria-label` listing the years,
  so the meaning is not carried by width alone. sw CACHE / VERSION stay at v15.
- 2026-07-31 — **Settings gear on Home (discoverability fix).** User could not
  find Settings. Root cause is a trap I built in v10: the Home cloud button links
  to Settings **only while sync is unconfigured** — once you finish setting sync
  up it silently becomes a sync-now button, so the entry point you learned stops
  working exactly when you finish onboarding. That left one reliable route, the
  "Sync settings" button at the bottom of the Library tab, for a screen holding
  sync config, the appearance pickers and taught/muted words. Fix: a second 42px
  squircle in the Home brand row — `gear` added to `SHAPES` in `js/ui.js` (one
  path, not primitives; eight separate teeth leave stroke gaps at 21px), wrapped
  with the sync control in a new `.brand-actions` flex row. **Sync stays
  rightmost** — it is the one you reach for often. Offered a long-press and a
  fifth tab as alternatives; user picked the gear. Added a smoke step ("the gear
  on Home opens Settings") because this is a discoverability regression that no
  other test would catch — every other Settings assertion navigates by URL. Tab
  highlight for `#/settings` still maps to Library, unchanged: mapping it to Home
  would just move the oddity to the Library → Settings path. sw CACHE → v16,
  VERSION → v16.
- 2026-07-31 — **Audit of v16** → `docs/AUDIT.md`. Read the whole codebase, ran
  all five suites (53 tests, green), and reproduced three defects in a browser.
  The headline: **a stale re-render destroys the screen you're on**. Home's daily
  auto-sync (and the sync button) do `clear(root); home(root)` from a promise,
  and `root` is the one `#view` node the router reuses — so a sync that settles
  after you've tapped Log wipes the half-typed class, URL still reading `#/log`.
  Repro'd with a 1.2s-per-call fake GitHub. Fix proposed is a render generation
  token in `app.js` that every async continuation checks. Also confirmed:
  **`todayISO()` is UTC**, so 7:30pm in Los Angeles files a class on *tomorrow*
  and 8am in Sydney on *yesterday* — it flows into the markdown filename and every
  date query; and **`backup.importData` writes `settings` unconditionally**, so
  importing your own export from another device replaces `sync` (token), and
  worse `syncState`, which makes push believe notes are already backed up when
  they aren't. (That last one is why the July backfill file was hand-built with
  no `settings` key — the guard belongs in the code.) Seven more solutions cover
  tombstones that delete already-absent paths, silent sync failure, the absence
  of any time dimension (the largest gap against the vision), duplicate-day
  logging, Library's unbounded render, search not knowing technique labels, and
  a manifest still dark-only three versions after light became the default.
  **Nothing was changed in `js/` — this commit is the audit document only**, so
  `CACHE`/`VERSION` stay at v16.
- 2026-07-31 — **Enhancement survey** → `docs/ENHANCEMENTS.md`. Companion to the
  audit: not what's broken, what's absent, drawn from BJJ training logs, habit/
  fitness trackers and PKM tools, filtered against this repo's constraints. Ten,
  in value order: round timer (the one feature people open a second app for);
  training calendar + streak (the cheapest answer to the §2 cold-start problem —
  all derivable from `entry.date`); **spaced repetition on the existing flashcard
  deck** (the deck is built, there is simply no scheduler, so a nailed card
  recurs as often as a forgotten one); session types beyond gi/no-gi
  (`comp`/`open-mat`/`private`/`seminar` as one front-matter scalar); belt and
  promotion history (`BELT_RANKS` is currently decoration — the app doesn't know
  *your* belt); **launcher shortcuts** in the manifest (best value-per-line here:
  pure JSON, no JS, removes a tap from the one path CLAUDE.md says to guard);
  a nudge to log; entry↔entry links and backlinks (tags connect entries to
  positions, never to each other — this is what the vision's "knowledge graph"
  actually needs); a trash with undo (delete is currently irreversible outside
  the data repo's git history); and optional rounds-rolled + how-it-went on a
  session. Three constraints did real work in the filtering: **push
  notifications may not work on CalyxOS** (Chrome web push goes via FCM; Calyx
  ships microG so it *might* — needs ten minutes on the actual phone before any
  code, same as §14), so the reliable version is an in-app nudge or a `.ics` the
  user imports; **photos were costed and rejected** (binaries break the markdown-
  in-git backup); and **partner tracking was held back** as the user's call, not
  a default — it is the same shape of data as the `coach` field they had removed.
  Recurring tension to watch: belt progress, comp results and any self-report can
  each slide from "what you wrote" into "how good you are" — each entry in the
  doc says where its line is. Runner-ups and an "if only three get built" pick
  (shortcuts, calendar, spaced repetition) are at the end. **Docs only — no code
  changed**, `CACHE`/`VERSION` stay at v16.
- 2026-07-31 — **v17: the ten enhancements, built.** Implemented all of
  `docs/ENHANCEMENTS.md`, plus the four "ship first" fixes from `docs/AUDIT.md`
  that they sit on top of (§4–§9 of the audit are still open). New modules:
  `js/dates.js` (local-timezone date maths), `js/srs.js` (SM-2), `js/render.js`
  (the render token), `js/views/timer.js`.

  **The audit fixes.** `todayISO()` is now local, not UTC — it lives in
  `js/dates.js` with every other date helper, and *nothing in this app may use
  `toISOString()` for a date again*: 7:30pm in Los Angeles filed classes on
  tomorrow. The **render token** (`renderToken()` / `isCurrent()`) is the fix
  for the stale-re-render bug; any async continuation that touches the DOM must
  take a token before it awaits and check it after — `js/render.js` is its own
  module precisely so views can import it without a cycle back through the
  router. `backup.importData` now skips `DEVICE_LOCAL_SETTINGS` (`sync`,
  `syncState`, `tombstones`, `lastSyncAt`); the manifest is light-default.

  **What the ten added.** Round timer at `#/timer` (deadline-based, never tick
  accumulation, `AudioContext` beep so there is no asset, wake lock, and a
  MutationObserver teardown because the router just clears `#view` under it);
  training calendar + **week** streak (weeks trained, not consecutive days — a
  day streak breaks every week in this sport and punishes rest); spaced
  repetition on the existing deck; `session` / `rounds` / `feel` on class
  entries; belt promotions in Settings feeding the brand mark; three launcher
  shortcuts; the log nudge; entry↔entry `related` links with backlinks; a
  30-day trash; Library paging + type filter.

  **Model + format.** Entries gained `session`, `rounds`, `feel`, `related`,
  `deletedAt`. The front-matter grammar took its first additions since it was
  written — four scalars and one more inline list, no YAML. `toMarkdown`'s
  `field()` no longer uses a truthiness test: `rounds: 0` ("we drilled, I didn't
  roll") is a value, not an absence, and was being silently dropped.

  **Soft delete and sync.** `deleteEntry` sets `deletedAt` instead of removing
  the row; `allEntries()` filters it, so push still deletes the file from the
  repo exactly as before — the trash is a **local** undo buffer and does not
  sync, because a deleted note lingering in the mirror is the opposite of what
  deleting is for. `pull()` therefore reads `allEntriesRaw()` and skips trashed
  ids, or the next sync would resurrect them. `restoreEntry` **clears
  `syncPath`/`syncHash`** — keep them and push sees an unchanged hash and never
  re-uploads the restored note.

  **Two traps found by looking, not by testing.** (1) Only `.btn.cta svg` was
  ever sized, so the moment a non-CTA button carried an icon the SVG rendered at
  its natural size and swallowed the button — `.btn svg` is now sized globally.
  (2) **`[hidden]` did not hide.** The UA rule is specificity 0,1,0 and any
  later class rule setting `display` beats it, so `.fc-grade { display: grid }`
  left the flashcard grade buttons on screen before the card was flipped — and
  the test passed, because it asserted the `hidden` *attribute* rather than
  visibility. There is now a global `[hidden] { display: none !important }` and
  the tests use `isVisible()`. Assert what the user sees, not what the DOM says.

  **Tests: seven suites, 111 assertions, all green.** Added
  `tests/schedule.test.mjs` (30, pure node — run it under a non-UTC `TZ`) and
  `tests/features.test.mjs` (22, Playwright), the latter opening with a
  regression test for the render-clobber bug driven through a deliberately slow
  fake GitHub. Screenshot-checked every screen in light and dark, and confirmed
  0 running animations under `prefers-reduced-motion`. sw `CACHE` → v17,
  `VERSION` → v17; `js/dates.js`, `js/srs.js`, `js/render.js`,
  `js/views/timer.js` and the three icons added to `SHELL`. index.html gained a
  favicon link (the browser was 404ing on `/favicon.ico` every load).
- 2026-08-01 — **v18: round timer removed.** User: *"Remove the timer, no phones
  on the mat."* Taken out whole rather than hidden — `js/views/timer.js` deleted,
  the `#/timer` route and its tab mapping gone from `app.js`, both Home entry
  points (the squircle in the brand row and the button under the CTA) gone, the
  `play`/`pause`/`timer` icons dropped from `SHAPES`, the `.t-*` CSS block
  deleted, and the launcher shortcut removed from the manifest (**two shortcuts
  now: Log a class, Drill flashcards**). Also removed the `link` icon, which I
  had added in v17 and never used. `tests/features.test.mjs` lost its three
  timer tests and gained one that **pins the removal** — `#/timer` must resolve
  to "Page not found", Home must carry no `href="#/timer"`, and the manifest
  must offer no timer shortcut. That test exists because a half-removed feature
  is worse than either state: a dead link on Home or a launcher shortcut into a
  missing route would both stay silent until someone tapped them. sw `CACHE` →
  v18, `VERSION` → v18. Six suites, 108 assertions, green.

  **The lesson worth keeping** (written up in `docs/ENHANCEMENTS.md` §1, which
  is struck through rather than deleted): *"every comparable app has one"* is a
  fact about the market, not a reason. Every other enhancement in that document
  improves the app **between** sessions, which is where this app lives — the
  timer was the only one that assumed a phone in hand during training, and that
  assumption was never checked. Don't rebuild it without asking.
- 2026-08-01 — **v19: the calendar moved onto the back of the hero.** User:
  *"remove the calendar view too, it doesn't add too much, maybe add it as a
  card that opens if I click on the total classes log. It flips like the flash
  cards and I can swipe to see previous months."* Built exactly that. The
  always-open "Training calendar" card is gone from Home; the hero is now a
  `.flipcard` using the **same 3D `rotateY` language as the flashcard deck** —
  fixed height, both faces `position: absolute` with `backface-visibility:
  hidden`, because a flip whose two sides are different heights jumps as it
  turns. Front is the unchanged stats hero; back is one month, with ‹ › arrows
  **and** swipe (touchstart/touchend, ignored unless the drag is mostly
  horizontal, or every attempt to scroll the page would change the month).
  Home is ~200px shorter than it was.

  **Three things worth knowing.** (1) The flip trigger is the *total*, not the
  whole card — the card also carries the streak badge, and one big tap target
  would swallow it. A small `calendar` glyph sits beside the label as the
  affordance; without a visible cue nobody discovers a flip, which is the same
  trap the Edit pencil fixed in v7. (2) **`Done` on the back is the only way
  back**, because the front face is `inert` while turned away — there is a test
  asserting it, since losing it would make the card a trap. `inert` is set on
  whichever face is face-down: `backface-visibility` hides a face from the eye
  but not from the keyboard or a screen reader. (3) The calendar opens on the
  month of your **most recent class**, not the current month. Caught by a test
  failing on the 1st of August: `daysAgo(1)` is July, so "this month" was a
  blank grid while everything recently trained sat in the month before.

  Month range is clamped from your first logged class to this month, so paging
  can't wander into empty years. `monthCalendar` gained `showMonth: false` (the
  month name lives in the header between the arrows now), and `dates.js` gained
  `shiftMonth` and `monthOf`. `.cal-row` / `.cal-legend` deleted with the card
  that used them. sw `CACHE` → v19, `VERSION` → v19, no new files. Seven
  suites, 113 assertions, green; screenshot-checked the flip in light and dark
  and confirmed 0 running animations under `prefers-reduced-motion` (the flip
  snaps instead of turning).
- 2026-08-01 — **v20: Home re-weighted around "Working on"; spaced repetition
  removed.** User: *"the big tile of the total classes logged is too big and not
  that important. The what I'm working on should be big, and tiled. And I should
  be able to swipe through them and tap on them for more detail. Remove the bit
  that asks if it was good/easy."*

  **The deck is now the front door.** "Working on" moved to the top of Home as a
  row of big tiles — one card each, tap to open the deck at that card
  (`#/focus?card=N`). The swipe is a **scroll-snapping overflow row**, not a
  touch handler: native scrolling gets momentum, trackpads, scrollbars and
  keyboards right for free, and hand-rolled gesture code gets all four wrong.
  Dots below track the rail's own `scrollLeft`, so they stay honest however you
  moved it.

  **The hero became a strip.** Total / week / 30 days / gi on one line at
  1.2rem, with the streak. It still flips to the calendar — and because the
  strip is 92px while the calendar needs 284px, `.flipcard` now **transitions
  its height** alongside the rotation instead of reserving the taller face's
  height permanently. Both faces are absolutely positioned, so that costs
  nothing. The old `.hero-*` rules are deleted, not orphaned; `tests/smoke.mjs`
  moved to `.sbit-total` / `.sbit-week`, and the stat cells carry explicit
  classes so tests never key off position in the row.

  **Spaced repetition is gone.** Removing the Again/Good/Easy rating left SM-2
  with no input, so `js/srs.js`, `dueFocuses`, `reviewFocus` and the schedule
  fields on a card went too — same rule as the v18 timer: a half-removed
  feature is worse than either state. `normalizeFocus` now returns exactly
  `{front, back}` and **drops the old `due`/`ease`/`interval` keys on read**, so
  decks written by v17–v19 clean themselves up; there is a test pinning that a
  card carries nothing else. Home no longer says "N cards due".

  sw `CACHE` → v20, `VERSION` → v20, `js/srs.js` out of `SHELL`. Seven suites,
  109 assertions, green. Screenshot-checked Home, the flip and the deck in light
  and dark. The Drill launcher shortcut said "Review the cards that are due" —
  fixed in the same version, since "due" stopped meaning anything.

  **Open at the end of this session:** `docs/AUDIT.md` §4–§9 (tombstone
  hardening, silent sync failure, no time dimension, duplicate-day cue is built
  but search/Library items are not, Library search labels). And the standing
  gap: **focuses and `likedMoves` are device-local and still do not sync** —
  the deck you now see tiled on Home lives on one phone only. Extending the
  notes-repo format to carry them is the obvious next job.
- 2026-08-02 — **v21: rounds and "how it went" removed; Rolling notes → Key
  details.** User: *"remove the rounds and how it went part"* and *"I want a bit
  for key details instead of the rolling notes"* (confirmed as a relabel of the
  existing field, not a new one).

  **Rounds and the self-report are gone whole**, v18-style rather than hidden:
  the `sessionMeta` block off the Log form, `entry.rounds` / `entry.feel` out of
  `newEntry` and the model doc, `store.rollStats` deleted, the two `.stat` tiles
  and the gi-vs-no-gi sentence off the Map's Mat time card, the `N rounds` flag
  off Home's last-session card, `.meta-row` / `.meta-field` / `.feel` /
  `.feel-dot` out of the CSS (including the reduced-motion list), and
  `rounds:` / `feel:` out of the front-matter grammar. Notes already in the
  backup repo carry those keys; `fromMarkdown` no longer reads them, so they
  drop out of each file the next time it is pushed. Three tests pin the removal
  (form, front matter, `rollStats`), because an input still writing to a field
  nothing reads is silent.

  **What stayed on purpose:** `toMarkdown`'s `field()` keeps its explicit
  null/undefined/''/false check rather than reverting to a truthiness test. That
  check was bought by the `rounds: 0` bug in v17 and the next number added to
  the grammar would walk into the same trap; there is a test on it that no
  longer mentions rounds.

  **The middle log field is now "Key details"** — same textarea, same place, new
  label and placeholder, and the markdown heading follows it (`## Key details`).
  **The storage key is still `sections.rolling`** and that is deliberate:
  renaming it means migrating every row already in IndexedDB on the user's phone
  for the sake of a word, and a migration that goes wrong loses notes. The
  mismatch is documented at the model in `store.js`. `js/markdown.js` gained
  `LEGACY_HEADINGS` — a rename **adds** to that list rather than replacing what
  a heading used to be called, or every note in the backup repo written before
  today would come back with that section blank, on every device, with nothing
  logged anywhere. Tested both directions.

  **Note for later:** the form now reads WHAT WE DRILLED / KEY DETAILS / KEY
  THOUGHTS & ADJUSTMENTS. The last two both start with "Key" — asked for, but
  if it reads muddy on the phone the third one is the one to rename.

  **No word or character limit was added.** The three log textareas have never
  had a `maxlength` and still don't — see the answer in this session: the only
  capped inputs in the app are the flashcard front (60), the flashcard back
  (400) and teach-a-word (40), and every other number in the code is display
  truncation, not a limit on what is stored.

  sw `CACHE` → v21, `VERSION` → v21, no files added or removed. Seven suites,
  111 assertions, green (`schedule` run under UTC, `America/Los_Angeles` and
  `Australia/Sydney`); screenshot-checked the Log form.
- 2026-08-02 — **v22: the session-type picker removed.** User: *"Remove the type
  of lesson, seminar, private... Etc"*. Open mat / Competition / Private /
  Seminar are gone whole, the same call as the v18 timer and the v21 rounds
  block: `sessionSelector` off the Log form, `SESSION_TYPES` / `SESSION_LABEL` /
  `sessionCounts` out of `store.js`, `entry.session` off `newEntry` and the model
  doc, `session:` out of the front-matter grammar, the neutral `.s-type` chip off
  Home's last-session card and off every Library row, `day.sessions` out of
  `trainingIndex`, and the competition ring (`.cal__day.is-comp`) off the
  calendar. **Gi / no-gi is now the only thing the model says about what kind of
  session it was.**

  **The Map's "Mat time" card went with it.** It existed to split classes across
  the session types, and with them gone it rendered a single row reading
  "Regular class · 100%" — a chart of nothing. Verified against a before/after
  screenshot rather than assumed. `.slist*` deleted with it.

  **Two bits of CSS the removal exposed**, both dead before this change and both
  now gone: `.stat` / `.stat-row` (orphaned in v21 when the Map's stat tiles
  went — nothing had rendered `div.stat` since), and a **second `.stats-row`
  rule** in the mat-time block that was also landing on *Home's* stats strip and
  overriding the real rule 160 lines above it, giving the strip a stray
  `margin-top: 14px` and a 10px gap instead of 6px. Deleting it left Home's strip
  correctly centred in its card — screenshot-compared before and after to be sure
  the fix was a fix. Worth remembering: **duplicate selectors 160 lines apart in
  a single 1200-line stylesheet are invisible**; grep the whole file for a
  selector before deleting the block it sits in.

  **Tests.** The two session-type tests were replaced by removal pins, in the
  same spirit as v18's timer test: the log form must offer no picker and none of
  the four labels, the Map must render no mat-time card, `store` must export no
  `SESSION_TYPES`/`SESSION_LABEL`/`sessionCounts`/`rollStats`, a new entry must
  carry no `session`/`rounds`/`feel`, `trainingIndex` must not track sessions,
  and `toMarkdown` must neither write `session:` nor read a legacy one back.
  A new positive test covers the survivor — gi/no-gi still records and still
  clears when tapped again — because the removal took a sibling of that control
  and nothing else asserted it.

  `tests/markdown.test.mjs`'s falsy-scalar guard now uses `gi` instead of
  `session` as its subject. The guard itself stays for the third version running:
  it is about `field()`, not about whichever field happens to exist this week.

  sw `CACHE` → v22, `VERSION` → v22, no files added or removed. Seven suites,
  110 assertions, green (`schedule` under UTC, `America/Los_Angeles` and
  `Australia/Sydney`); screenshot-compared Home, Map and the Log form.
- 2026-08-03 — **v21 + v22 deployed.** Both shipped together: `main` fast-
  forwarded to `ebeaec2` and pushed, so GitHub Pages is serving v22 at
  `https://kezbolino.github.io/JJ-app/`. `CACHE` and `VERSION` both read v22 and
  match — the footer number only means "latest" when they do.

  **Expect one noisy sync.** Notes already in `jj-app-data` still carry
  `rounds:`, `feel:` and `session:` in their front matter and `## Rolling notes`
  as a heading. Nothing reads those keys now, so each note sheds them and picks
  up `## Key details` the next time it is pushed — one commit touching a lot of
  files, which is the removal working, not a bug. The old heading is still parsed
  (`LEGACY_HEADINGS`), so nothing in that field is lost in between.

  Also worth remembering next session: the installed PWA on the phone serves the
  old shell until the service worker takes the new `CACHE`. Close it fully and
  reopen, and check the footer before judging anything on screen — this is the
  same thing that sent v10 chasing a "front page all over the place" bug that
  turned out to be real (see 2026-07-29), so verify the version *first*.
- 2026-08-03 — **v23: renamed on-screen to "Ju Ji"; favicon/app icons now
  carry the belt colours too.** User: *"i want the app to be renamed 'Ju Ji'
  ... change the logo on the top left corner. I also want to change the
  favicon to use the coloured belts bit too."* Scoped as a display rebrand,
  not a repo rename (see the note added to "What this is" above) — the GitHub
  repo, `sw.js` cache-key prefix (`jj-app-vNN`) and internal module/error-text
  references to "JJ-app" (`js/markdown.js`, `js/sync.js` commit messages) were
  deliberately left alone as out of scope.

  **Top-left logo.** `brandMark()` in `js/ui.js` now renders the wordmark
  `Ju Ji` instead of `JJ`, same element (`h1.brand-jj`), same belt-timeline row
  underneath — no CSS changes needed, and by what looks like a coincidence of
  the existing type scale the rendered wordmark width already matches the belt
  row's width (both ~61px at the in-app size), so nothing looked lopsided.
  Screenshot-checked at 420px and a narrow 360px Android width in both themes;
  no overflow.

  **Favicon / app icons.** The three files in `icons/` were flat "JJ" glyphs
  with no colour. Regenerated all three (`icon-192.png`, `icon-512.png`,
  `icon-maskable.png`) as one design: dark-navy rounded square (matches the
  old icon's background so it isn't a jarring swap), the `Ju Ji` wordmark in
  Nunito 700, and the same five belt-rank pills from the in-app mark
  underneath — so the favicon is now literally a bigger render of the top-left
  logo, which is what "use the coloured belts bit too" asked for. Built with a
  disposable SVG generator script (Playwright + local `fonts/nunito.woff2`,
  not checked into the repo — this was a one-off render, not a build step the
  project needs) rather than freehand pixels, so the wordmark and belt
  proportions are exact, not eyeballed. The maskable variant needed its own
  pass: Android crops maskable icons to a centred safe-zone circle (radius 40%
  of the icon), and the first attempt at safe padding put the wordmark's
  corners at a measured 362px from centre against a 205px safe radius — it
  would have been clipped on a circular launcher mask. Fixed by scaling the
  maskable content to 90% with the background filling edge-to-edge (flat, no
  rounded corner — the OS applies its own mask shape), leaving content at
  ~177px from centre, comfortably inside the safe zone.

  **Other display strings.** `<title>` in `index.html`, `name`/`short_name` in
  `manifest.webmanifest` (both now `Ju Ji` — short enough that `short_name`
  didn't need to be abbreviated), and the footer template literal in
  `js/app.js` (`` `Ju Ji ${VERSION}` ``) all updated to match.

  sw `CACHE` → v23, `VERSION` → v23 (icon bytes changed, so the cached shell
  must invalidate). No files added or removed, so `SHELL` in `sw.js` is
  unchanged. All seven suites green (110 assertions); the existing manifest
  test ("the manifest offers launcher shortcuts and matches the light
  default") doesn't assert on `name`/`short_name` so it wasn't touched.
- 2026-08-03 — **v24: app icons only — uppercase `JUJI`, equal-width pills,
  slimmer U.** Follow-up to v23, worked out interactively over several
  disposable preview renders (uppercase vs mixed case, 5 pill-style options,
  then a same-size-pills-aligned-to-the-letters pass) before the user picked
  a direction: chip-style pills (square-ish corners), no space (`JUJI` not
  `Ju Ji`), and the pill row's first/last edge exactly under the wordmark's
  first/last letter rather than just matching its total width.

  **Real bug caught during that alignment pass, not a design opinion.** The
  belt-pill width was being computed from `text.getBBox()` measured *before*
  Nunito had actually loaded — `document.fonts.ready` resolves trivially if
  nothing has requested the font yet, so the very first measurement silently
  used fallback-font metrics, ~25% wider than Nunito's. Fixed in the
  generator by explicitly `document.fonts.load('700 150px Nunito')`-ing
  before any measurement. Not a shipped-code bug (this only affects the
  disposable icon-generator script), but worth remembering if `js/ui.js`
  or anywhere else ever measures text width off a webfont: request the font
  explicitly, `.ready` alone isn't a guarantee.

  **The "why is the U so fat" question was also a real, measurable thing**,
  not just a feel: at this weight Nunito's uppercase U has a 102px advance
  width against 48px for J and 37px for I — more than double, not the ~20%
  a heavier stroke alone would explain. Fixed by laying the wordmark out
  glyph-by-glyph (`text.getExtentOfChar(i)` on a hidden measurement copy)
  instead of one flowed `<text>`, then rendering the U on its own with
  `textLength`/`lengthAdjust="spacingAndGlyphs"` set to 85% of its natural
  width — compressing just that glyph — and shifting J and I after it left
  by the same amount so the word stays tight with no gap. Tried 75% and 65%
  too; 85% was picked as the one that reads as "less heavy" without reading
  as visibly squeezed.

  **Deliberately not touched: the in-app top-left brand mark
  (`brandMark()` in `js/ui.js`).** This whole exploration was scoped to the
  favicon/app icons — every preview was explicitly labelled and shown at
  favicon size. The in-app mark's belt row is not decorative: it is sized by
  `BELT_RANKS` years-per-belt (`js/ui.js`, "Belt mark is now a timeline",
  2026-07-31) and is meant to read as a rough timeline, not five equal
  chips. Equalising those pill widths in the real app would silently undo
  that decision without being asked to, so the top-left logo still reads
  mixed-case `Ju Ji` over the real proportional belt bar — only the
  icon/favicon files changed this version. If the uppercase/equal-pill look
  is wanted there too, that needs its own explicit ask, since it trades away
  data the timeline was built to carry.

  Maskable icon's safe-zone content scale re-tuned for the new (tighter,
  U-compressed) glyph layout: 100% content scale now measures 178px from
  centre against the 205px safe radius (previously needed 90% for the old
  wordmark). Same disposable Playwright + local `fonts/nunito.woff2`
  generator approach as v23, still not checked into the repo.

  sw `CACHE` → v24, `VERSION` → v24 (icon bytes changed again). No files
  added, removed or renamed, so `SHELL` is unchanged. All seven suites green
  (110 assertions).
- 2026-08-03 — **v25: the in-app top-left brand mark now matches the v24
  icon — and the belt-years timeline is gone.** User: *"ok i want it the
  same on the app, the years can go."* Direct instruction to drop the
  years-weighted belt sizing (`BELT_RANKS` used to carry `{rank, years}` and
  a `PX_PER_YEAR` constant — see "Belt mark is now a timeline", 2026-07-31)
  in favour of the same JUJI / equal-pill / compressed-U design shipped to
  the icons in v24.

  **`BELT_RANKS` is now just `['white','blue','purple','brown','black']`** —
  `settings.js`'s rank dropdown updated from `b.rank` to the plain string.
  Nothing else in the codebase read `.years`, so nothing else needed to
  change.

  **The wordmark is SVG now, not a text node.** `js/ui.js` gained
  `WORDMARK_GLYPHS` — the same per-glyph x/width layout computed for the
  v24 icons (Nunito bold, -0.035em tracking, U compressed to 85%), but
  expressed as fractions of font-size and hard-coded rather than measured at
  render time. This was a deliberate choice, not laziness: the layout is
  static (same word, same weights, always), so measuring it live on every
  render would mean carrying the app into the same `document.fonts.ready`
  trap documented in the v24 entry above, for no benefit — precomputing once
  and shipping the numbers is simpler and cannot race. `wordmarkSvg()`
  builds it; `h1.brand-jj` carries `aria-label="Ju Ji"` so screen readers get
  the name even though the SVG itself is `aria-hidden`. **Fixed to Nunito
  regardless of the App-font picker** (Settings → Appearance can still swap
  body text to System/Serif/Mono) — this is brand identity, not body copy,
  same reasoning as the icon files themselves not changing with it.

  **The belt pills stayed HTML `<i>` elements, not SVG** — deliberately,
  because `tests/features.test.mjs` asserts on them directly
  (`.belt.is-ranked i.belt-white:not(.is-future)` etc.) and rewriting them as
  SVG `<rect>`s would have broken that selector for no visual gain. Width,
  height, radius and gap are now all computed from `WORDMARK_FONT_SIZE` and
  set inline (equal width per pill, chip corners rather than full pill
  rounding), replacing the old years-proportional inline widths; the
  `is-ranked`/`is-future` dimming behaviour for a recorded promotion is
  unchanged. `css/app.css` lost the now-dead hard-coded `.belt`/`.belt i`
  sizing (gap, margin-top, height, border-radius all moved inline) and
  gained `.wordmark-svg text { fill: var(--text) }`.

  Screenshot-checked in light and dark at 420px and a narrow 360px width (no
  overflow), zoomed in 4x to confirm the U reads balanced and the pills are
  legible rather than vanishing at this much smaller (~46px vs the icon's
  512px) scale. All seven suites green (110 assertions), including the
  promotion/rank-highlight test. sw `CACHE` → v25, `VERSION` → v25, no files
  added or removed.
- 2026-08-03 — **v26: a post-class stretch routine at `#/stretch`.** User asked
  for a stretching timer: a 10-second get-ready beep, a 30-second hold, repeat,
  with a researched list of stretches covering the major BJJ muscle groups,
  each with a still illustration and a name, running 10–15 minutes.

  **This is not the v18 round timer coming back, and the removal test still
  passes untouched.** The lesson written up when the timer was removed was that
  *"every comparable app has one"* is not a reason, and that the timer was the
  only feature assuming a phone in hand **during** training. A cool-down is the
  opposite case — you are off the mat, changed, winding down — so it does not
  reopen that decision. It deliberately lives at `#/stretch`, which leaves
  `#/timer` resolving to "Page not found" and the v18 pin ("no route, no
  shortcut, no entry point") green with no edits. Anyone tempted to merge the
  two routes should read this paragraph first.

  **The routine.** Eleven stretches, 18 holds, 12:00 exactly — 7 two-sided
  (two holds each) and 4 single. Ordered as a flow so you change position as
  little as possible and finish lying down: kneeling upper body → all fours →
  lunges → hips → seated → supine. Drawn from the common recommendations across
  BJJ mobility sources; between them they hit hip flexors, glutes/piriformis,
  adductors, hip internal+external rotation, hamstrings, quads, thoracic
  rotation, lats/shoulders, neck and the wrists that gripping wrecks. There is
  a test asserting each of those areas is still named by something in the list,
  so trimming the routine can't silently drop a muscle group.

  **Timing is derived from the clock, never counted.** Every segment is the
  same 40s (10 ready + 30 hold), so the entire routine is one expression over
  elapsed milliseconds: `segIdx = floor(elapsed / SEGMENT_MS)`. A phone that
  throttles background timers or sleeps mid-routine resumes on the correct
  stretch instead of drifting further behind the longer it runs. Pause banks
  the elapsed time and drops the anchor; skip/back rewrite the bank. This is
  the same discipline the v17 round timer used and the reason it never drifted.

  **Teardown is the render token, and it has its own test.** The router just
  empties `#view`; nothing tells a view it has been replaced. The interval
  checks `isCurrent(token)` and shuts itself, the wake lock and the
  AudioContext down when it stops being the visible screen. Left unfixed, an
  abandoned routine ticks against detached nodes and holds the screen awake for
  the rest of the session — same class of bug as the v16 render-clobber, so it
  is pinned the same way: the test wraps `setInterval`/`clearInterval`, starts
  the routine, navigates to `#/log`, and asserts the live-interval count
  returns to baseline.

  **Beeps are synthesised, not files** — an `AudioContext` oscillator costs no
  bytes in the shell and nothing to cache, which is the whole shape of this
  app. Low tone entering "get ready", higher one entering "hold", ticks at
  3-2-1 in both phases, three-note chime at the end. The context can only be
  built from a user gesture, so it is created inside the Start tap. There is a
  mute toggle, which needed a new `sound`/`soundOff` icon pair: the first
  attempt reused `mic`, which means *record* — the opposite end of the audio
  chain from "the app is beeping at you".

  **The illustrations are inline SVG line figures**, same family as `icon()` —
  stroke-based, round caps, `currentColor` so they theme. Not images: binaries
  would need cache entries and would break the "small files, no deps" shape.
  **They were drawn, rendered to a contact sheet and looked at, three rounds.**
  That was not optional — the first pass produced four unreadable blobs
  (child's pose, thread-the-needle, the seated fold and the supine twist all
  read as abstract shapes or, worse, as a standing person). Two things fixed
  them: separating limbs that anatomically overlap (the fold's head and its
  reaching arm land in the same place, so the arm was shortened to the shin
  until they cleared each other), and picking the view that shows the *point* —
  frog is drawn front-on because splayed knees **are** the stretch. The supine
  twist needed a mat outline and no ground line: a bird's-eye figure over a
  horizon line reads as someone standing and leaning over, which is the exact
  opposite of "lie on your back". **If you add a stretch, render the sheet and
  look at it — these cannot be judged from the path data.** *(Superseded the
  same day — those stick figures were replaced with proper contour drawings;
  see the next entry. The "render it and look at it" rule still stands.)*

  **Honest about what it is:** the intro says "General guidance, not physio",
  the finish screen says "Nothing was logged — this is just the cool-down", and
  the routine writes nothing to the journal. Same rule as coverage-is-attention
  -not-skill: the app doesn't get to imply it knows more than it does. Amber
  stayed out of it entirely — a cool-down is never "waiting on you", which is
  the only thing amber means here.

  Entry point is a neutral button under the Log CTA on Home (same moment: you
  just finished, you're about to write it up), with the minutes computed from
  `routineMs()` so the label can't drift from what actually runs. **No launcher
  shortcut** — not asked for, and adding one would have meant editing the
  manifest test's exact-shortcut assertion.

  New files `js/stretches.js` and `js/views/stretch.js` (both added to
  `SHELL`), new suite `tests/stretches.test.mjs` — **the suite count is now
  eight, not seven**. 42 new assertions; all eight green, `schedule` re-run
  under `America/Los_Angeles` and `Australia/Sydney`. Screenshot-checked the
  intro, a running hold and the finish screen in light and dark, confirmed 0
  running animations under `prefers-reduced-motion` and no horizontal overflow
  at a 360px Android width. sw `CACHE` → v26, `VERSION` → v26.
- 2026-08-03 — **Still v26: the stick figures replaced with real artwork.** The
  user generated proper contour line drawings from the prompt written earlier in
  the session and handed back 11 SVGs. **`CACHE`/`VERSION` stay at v26** — main
  is still serving v22, so v23–v26 have never reached a device and there is
  nothing cached to invalidate. Bumping again would only invent a version
  nobody ever ran.

  **What arrived and what was wrong with it.** Each file was a 1024×1024 SVG
  built as a flat two-colour illustration: a full-canvas `#fff` rectangle,
  then one unclassed (default black) path holding the line work, then several
  more `#fff` paths painting the body interior. Rendered on a white page that
  looks right; dropped into a themed app it is a white sticker that disappears
  in light mode and glares in dark. The fix turned out to be subtraction, not
  tracing: **keep only the unclassed path and throw every white one away.**
  The black path alone is the complete drawing — verified by rendering it on a
  mid-grey sheet before touching anything else. "White" is not a colour this
  app is allowed to assume, so nothing that painted white survived.

  **The trap, which cost a full rebuild.** Precision was trimmed first —
  rounding every decimal to 1dp for ~8 KB. It destroyed them: pigeon collapsed
  to a 51px-tall sliver, the lunge became a wedge, and several figures flooded
  into solid silhouettes. Cause: these paths are full of **relative** commands,
  so rounding each delta accumulates error along the chain until interior
  contours no longer close and nonzero winding fills them in. The bbox numbers
  gave it away before the render did — a 763×560 figure reporting 467×51.
  **Never round coordinates in this artwork.** Framing is normalised by moving
  the `viewBox` instead: a square centred on each pose's measured bounding box
  with a 5% margin, which crops and equalises scale while leaving every
  coordinate byte-exact.

  **Where it lives.** New module `js/stretch-art.js` (added to `SHELL`) holding
  `ART = { id: { viewBox, d } }`, ~47 KB. Split from `js/stretches.js`
  deliberately: this repo gets edited from a phone, and 47 KB of path data in
  the same file as the routine would bury the part that is meant to be read.
  `STRETCHES` entries no longer carry a `figure` — the `id` is the key into
  `ART` — and `stretchFigure(stretch, label)` now emits one `<path>` under
  `fill="currentColor"`. A missing id draws an empty frame rather than throwing,
  because a routine that is mid-hold should not die over a picture; the test
  suite is what catches it, and it also fails on artwork no stretch uses and on
  any colour baked into the path data. `.fig-ground` and the ground/mat logic
  are gone — the new figures carry their own implied floor.

  Ten stretch assertions green, all eight suites green, screenshot-checked the
  intro list and a running hold in both themes (the figures invert correctly on
  dark), 0 animations under reduced motion, no overflow at 360px.
