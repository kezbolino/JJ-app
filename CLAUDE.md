# CLAUDE.md — JJ-app

## What this is

A personal knowledge system for Brazilian jiu-jitsu. Journal every class,
connect everything into a knowledge graph, and surface patterns in the user's
game over years.

**Call it `JJ-app`.** "BJJ Brain" appears as the title of `docs/VISION.md` but
is a working title only — it came from ChatGPT and the user has explicitly
declined to rename the repo to match it. Don't reintroduce it as the project
name.

**On-screen product name is `JUJI`, all caps, no space, as of 2026-08-04** —
the brand mark, page title, manifest name and footer all read "JUJI" now.
It was briefly "Ju Ji" (2026-08-03, v23) before the user asked for the
all-caps no-space form to match the wordmark/icon design from v24-25. This is
separate from the repo/codebase name above: the GitHub repo, file paths and
internal identifiers stay `JJ-app`/`jj-app-*`. Don't conflate the two or "fix"
one to match the other.

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
js/stretches.js       two routines (cool-down, rest day): items, phases, segments
js/stretch-art.js     ~47 KB of figure paths — data only, don't hand-edit
js/strength.js        the once-a-week lift: programme + progression engine (pure)
js/beeps.js           synthesised tones, shared by the routines and the rest timer
js/wakelock.js        best-effort screen wake lock, same two callers
js/views/*.js         home, log, map, position, library, search, settings,
                      stretch, strength
sw.js                 offline cache — bump CACHE when files change
tests/                markdown round-trip, app smoke test, sync test
```

**The Stretch tab is called `Off mat` as of v35** and holds three things: the
after-class cool-down, the rest-day mobility routine and the strength session.
Two routes live under it (`#/stretch`, `#/strength`) and the one tab lights up
for both. Don't split them into two tabs — they are one section, which is the
work you do when you are *not* on the mat.

## Running and testing

```sh
node tests/markdown.test.mjs    # pure node, fast
node tests/tagger.test.mjs      # pure node, fast
node tests/moves.test.mjs       # pure node, fast
node tests/stretches.test.mjs   # pure node, fast — routine data + timing maths
node tests/schedule.test.mjs    # pure node, fast — dates, SRS, attendance
node tests/strength.test.mjs   # pure node, fast — the progression engine
python3 -m http.server 8099 &   # the three browser tests need this
node tests/smoke.mjs            # Playwright; the whole app loop
node tests/sync.test.mjs        # Playwright + fake GitHub (tests/fake-github.mjs)
node tests/features.test.mjs    # Playwright; calendar, deck, trash, links,
                                # stretch, strength
```

**Run all nine after touching anything in `js/`.** Between them they cover the
core loop (log → tag → technique page → dashboard → coverage prompt), tagging
including user corrections, backup format fidelity, multi-device sync including
deletions, the move-suggestion engine, the stretch routines, the strength
progression ladder, and everything added in v17.

**One known flake, unrelated to anything:** `the strip shows a week streak…` in
`tests/features.test.mjs` is date-dependent and fails identically on unmodified
code. It has been failing since v28. Don't chase it as a regression.

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
- 2026-08-03 — **v23–v26 deployed.** `main` fast-forwarded from v22 to the head
  of `claude/ju-ji-branding-6nr7si` and pushed, so GitHub Pages is serving v26
  at `https://kezbolino.github.io/JJ-app/`. Four versions shipped in one go —
  the "Ju Ji" rename, the JUJI app icons, the matching in-app brand mark, and
  the stretch routine. `CACHE` and `VERSION` both read v26 and match, which is
  the only thing that makes the footer number mean anything.

  Ship gate before pushing: all eight suites green (`schedule` under UTC,
  `America/Los_Angeles` and `Australia/Sydney`), `CACHE` == `VERSION`, clean
  tree, fast-forward confirmed rather than a merge.

  **No noisy sync this time.** v21/v22 shed front-matter keys and so rewrote
  every note in `jj-app-data` on the next push; nothing in v23–v26 touches
  `js/markdown.js` or the entry model, so the backup repo should see no churn
  from this deploy.

  **The phone will serve the old shell until the service worker takes v26** —
  close the installed PWA fully and reopen, then check the footer reads
  `Ju Ji v26` *before* judging anything on screen. This is the same trap that
  sent v10 chasing a layout bug (2026-07-29), and the jump is four versions
  wide here, so the icon and brand changes are the visible tell that it landed.
- 2026-08-03 — **v27: a second routine, and two gaps closed in the first.** User
  asked whether the cool-down should rotate its stretches, whether it is
  optimal, and what to do on rest days. Researched it rather than guessing, and
  three findings drove the whole version:

  **1. Don't rotate the list.** Flexibility adaptation is specific to the joint
  angle you keep loading, so swapping stretches each session to keep it
  interesting resets the stimulus. The boring sameness is the feature — this is
  now written at the top of `js/stretches.js` so nobody "improves" it later.

  **2. The cool-down was missing two things.** Ankle dorsiflexion (ankle is
  among the more commonly injured segments in BJJ, and nothing touched it) and
  thoracic *extension* (thread-the-needle covers rotation; hours folded under
  side control is all flexion). Added `ankle-rock` and `sphinx` → 13 stretches,
  21 holds, **14:00**.

  **3. Static stretching is the wrong tool for building range.** Post-exercise
  stretching has no meaningful effect on next-day soreness, and resistance work
  through a full range produces flexibility gains comparable to static
  stretching *plus* strength — which is what actually holds when a joint gets
  cranked. So the rest-day routine is **bodyweight end-range strength**, not
  more stretching: 13 movements, 18 sets, **19:30**, floor + chair + pull-up
  bar (the user's kit). Cossack squats, 90/90 lift-offs, Copenhagen planks,
  Jefferson curls, dead hangs, neck isometrics.

  **The engine barely changed, and that was the design win.** Segments stay
  **uniform within a routine**, so `segIdx = floor(elapsed / SEGMENT_MS)`
  survives intact — the cool-down is 40s (10 ready + 30 hold + 0 rest), the
  rest day 65s (10 + 35 + 20). The rest phase is not special-cased: the
  cool-down simply has one of length zero, so it never fires and both routines
  share one code path. Resist any refactor that gives movements individual
  durations — that is what would turn a division into a running total, and a
  running total is what drifts.

  **`PENDING_ART` is the mechanism worth keeping.** All 15 new movements ship
  with no drawing. `stretchFigure()` returns `null` rather than an empty frame,
  the view hides the slot, and `js/stretch-art.js` carries an explicit
  `PENDING_ART` set. The test asserts every item is in `ART` **or**
  `PENDING_ART`, never both, and that neither set carries an id no routine
  uses — so a typo'd id fails the suite instead of silently rendering nothing
  forever. Delete an id from the set when its figure lands; nothing else needs
  touching.

  Picker is a segmented control on the intro; choosing rewrites the hash with
  `replaceState` so a reload keeps your choice without the router rebuilding
  the view underneath. Home still links to the cool-down only — the rest-day
  session is one tap further in, and the button's minutes come from
  `routineMs()` so the label can't drift. Rest is coloured `--good`, green:
  amber keeps its three jobs and a rest phase is not "waiting on you".

  **A lesson about shipping mid-refactor.** The user said "ship it" while
  `js/stretches.js` had already been rewritten to drop the `STRETCHES` export
  but the view and Home still imported it. That would have taken out *Home*,
  not just the stretch screen. Verified the breakage with a node import before
  saying so, then finished the work rather than shipping or reverting. Worth
  remembering: this repo has no build step and no type checker, so a renamed
  export fails at runtime, on the device, on the front door.

  sw `CACHE` → v27, `VERSION` → v27, no files added or removed. All eight
  suites green (36 browser assertions; `schedule` under UTC,
  `America/Los_Angeles` and `Australia/Sydney`), screenshot-checked both
  routines, 0 animations under reduced motion, no overflow at 360px.

  **Open at the end of this session — read this first next time.**

  1. **15 movements have no artwork.** They are listed in `PENDING_ART` in
     `js/stretch-art.js`: `ankle-rock` and `sphinx` in the cool-down, and all
     13 rest-day movements. They render fine without figures (no frame, not an
     empty box), so this is cosmetic, not broken. The user was offered image
     prompts for them and the session ended before they were written — that is
     the next job.
  2. **How to process artwork when it arrives** is written up in the v26
     follow-up entry above ("the stick figures replaced with real artwork").
     The short version, because it is easy to get wrong: keep only the
     unclassed (black) path and delete every white one; **never round the
     coordinates** (relative commands accumulate error until the figures flood
     into silhouettes); normalise framing by moving the `viewBox` to a square
     centred on the measured bbox with a 5% margin. The conversion script was
     deliberately disposable and is not in the repo — Pillow, numpy and
     potracer are pip-installable here, and Playwright is what measures the
     bounding boxes.
  3. **Drawing the rest-day movements is harder than the stretches**, because
     several are movements rather than positions. A still has to pick the
     moment that reads: the bottom of the Cossack squat, hips-low mid-step for
     the bear crawl, the hang at the bottom of the Jefferson curl. Say so in
     the prompt rather than leaving it to the generator.

  Still open from earlier sessions, unchanged: `docs/AUDIT.md` §4–§9
  (tombstone hardening, silent sync failure, no time dimension, Library search
  labels), and the standing gap that **focuses and `likedMoves` are
  device-local and do not sync**.
- 2026-08-04 — **v28: stretch intro screen wording tweak.** User noticed the
  cycle chips read "10S READY" / "30S HOLD" (CSS was uppercasing the whole
  string, including the `s` unit) and that the big total, e.g. "14:00", could
  be misread as a clock time (2pm) rather than a duration. Fixed both in
  `js/views/stretch.js`: the cycle-chip strings are now built with the phase
  words explicitly upper-cased in JS (`READY`, `HOLD`/`WORK`, `REST`) while the
  `10s`/`30s` unit stays as typed, and `text-transform: uppercase` came off
  `.st-intro-cycle` in `css/app.css` so JS controls the casing exactly — a
  single CSS transform can't produce mixed case in one string. The total-time
  display (`.st-intro-n` on the intro, and the finish screen's summary line)
  now appends `mins`, e.g. "14:00 mins". Updated the one test that asserted
  the old bare `mm:ss` shape (`tests/features.test.mjs`); no other suite
  touched this text. All eight suites green except one pre-existing,
  unrelated flake (`the strip shows a week streak...`, a date-dependent
  streak assertion that fails identically on unmodified `main` — not caused
  by this change, not fixed by it). sw `CACHE` → v28, `VERSION` → v28, no
  files added or removed.
- 2026-08-04 — **v29: spoken move names on the stretch routines.** User
  provided two AI-voiced ("Snoop Dogg voice") MP3s recorded as their own
  content and asked to have them cut per-move and wired into the app. This
  session has no way to listen to audio, so the whole thing had to be done by
  measurement rather than by ear — worth reading before touching this again.

  **The two files were swapped from what the user described.** They said
  "stretch file, then rest-day file" in that order, but ffmpeg's `silencedetect`
  plus a locally-run `pocketsphinx` transcription (rough, but good enough to
  catch distinctive words phonetically) turned up "Copenhagen," "Jefferson
  curls," and "shift your weight" in the file named first, and "thread the
  needle," "child's pose," "sink into it" in the one named second. Anchored on
  those unmistakable words rather than the stated order. Confirmed against
  clip duration too: the rest-day script is the longer one line-for-line, and
  the longer audio file (35.55s vs 32.57s) is the one with the rest-day words
  in it. `openai-whisper` would have given real transcripts but its model
  download is blocked by this session's egress policy (`openaipublic.
  azureedge.net`, reported rather than routed around, per `/root/.ccr/README.md`)
  — `pocketsphinx` was the fallback because its acoustic model ships inside the
  pip wheel itself, no extra download needed.

  **Cutting 13 lines out of one continuous take, without being able to hear
  them, used two signals together because neither alone was reliable.** Raw
  silence-gap detection couldn't tell a pause between two lines from a pause
  after a mid-line period — both produced gaps of similar length, and picking
  the 12 longest per file grabbed some of the wrong ones. What worked: treat
  each line's known word count (from the script text already in this
  conversation, not guessed) as a proportion of the file's total duration to
  get an approximate cut point, then snap that point to the nearest real
  silence gap (with a minimum-segment-length floor so two snap targets can't
  collapse onto the same gap). Verified after cutting, not just assumed: the
  app itself was driven in a real headless browser and the network requests it
  fired were checked — starting the cool-down requested exactly
  `neck-side.webm`, starting rest-day requested exactly `deep-squat-hold.webm`
  — which confirms the file-swap fix and the first cut of each set landed
  right, though it can't confirm cuts 2 through 13 individually. **A human
  listen-through of the 26 clips in `audio/cues/` is still worth doing** —
  flagged to the user rather than assumed away.

  **What shipped.** 26 short opus clips (mono, ~32kbps, `audio/cues/<id>.webm`,
  132KB total) named after the `id`s already in `js/stretches.js` — no new
  naming scheme, same key both routines' items already use for `ART` in
  `js/stretch-art.js`. `js/views/stretch.js` gained `createVoice()`: one
  reused `Audio` element, `.play()` failures swallowed (a future move added
  without a recorded clip stays silent instead of breaking the routine, same
  contract as `PENDING_ART`). Wired into the existing `ready`-phase branch in
  `tick()` alongside `beep.ready()` — a lift on top of the tone, not a
  replacement. The mute button (`.st-sound`) now stops both; its label changed
  from "Mute the beeps" to "Mute the sound" since it no longer only covers the
  synthesised tones. Voice playback is stopped on every teardown path
  (routine-switch, leaving the screen, muting mid-cue) for the same reason the
  wake lock and `AudioContext` already were — an abandoned routine must not
  keep making noise.

  All 26 clips are precached: added to `SHELL` in `sw.js` so a routine run on
  gym wifi or offline still gets the voice, not just the beeps. `CACHE`/
  `VERSION` → v29.

  Two new Playwright tests pin the wiring rather than just the cut content:
  the cool-down's first requested clip is `neck-side.webm` and muting
  suppresses the next one, and rest-day's first requested clip is
  `deep-squat-hold.webm` — the second test is what would have caught the
  file-swap if it had been missed. All eight suites still green end to end
  (the pre-existing week-streak date flake noted in the v28 entry is
  unrelated and unchanged).
- 2026-08-04 — **v28 + v29 deployed.** `main` was still serving v27; fast-
  forwarded to `ae74638` (the head of `claude/whats-next-h1muoo`) and pushed,
  so GitHub Pages now serves v29 at `https://kezbolino.github.io/JJ-app/`.
  Ship gate before pushing: `CACHE` == `VERSION` (v29), clean tree, fast-
  forward confirmed rather than a merge, all eight suites green except the
  known pre-existing week-streak date flake (fails identically on unmodified
  code, unrelated to anything in v28/v29).

  Two versions in one push: v28's stretch-intro wording fix (lowercase
  seconds, "mins" on the total so it can't be misread as a clock time), and
  v29's spoken move names on both stretch routines. As with v23–v26, no
  churn expected in `jj-app-data` — neither version touches `js/markdown.js`
  or the entry model.

  **Check the footer reads `Ju Ji v29` before judging anything on screen** —
  same trap as every previous jump, and this one also needs the 26 new audio
  clips under `audio/cues/` to actually download into the service worker's
  cache, so the first open after updating may want a moment on wifi before
  trusting an offline stretch session to have the voice cues.
- 2026-08-04 — **v30: fixed silent voice cues after the first move.** User
  tested v29 on the phone: "I can hear the first move for stretch and then
  first move for the rest day, and that's it." Wrong on my part in the v29
  write-up: `createVoice()` played clips through a bare `Audio()` element,
  not through Web Audio like the beeps. A plain `Audio().play()` called from
  a `setInterval` tick — every segment after the very first, which alone
  happens to fall inside the synchronous "Start" tap — is not running inside
  a user gesture, and Chrome is free to silently reject it. The rejection was
  being swallowed (`.catch(() => {})`, there to protect a not-yet-recorded
  clip from breaking the routine), so it looked exactly like what was
  reported: first move audible, everything after it silent, symmetrically in
  both routines. This is precisely the class of problem `js/views/stretch.js`
  already has a comment about for the beeps — "the context can only be
  created from a user gesture, so it is built when you tap Start" — voice
  cues just weren't built the same way.

  Fixed by routing voice cues through their own `AudioContext`, unlocked
  alongside the beep's in `begin()`, with each clip fetched once, decoded to
  an `AudioBuffer`, cached by id, and played via `AudioBufferSourceNode` —
  once a context is resumed from a gesture it stays usable from anywhere
  afterward, ticks included, which is the whole reason the beeps never hit
  this. A useful side effect: a bilateral move's second side (same id, e.g.
  neck side stretch left then right) now replays the already-decoded buffer
  instead of re-fetching the clip.

  I could not reproduce the rejection in this session's headless Playwright —
  Chromium's bundled test browser relaxes autoplay policy by default, so a
  bare `Audio().play()` outside a gesture "worked" there while failing on the
  user's real Android Chrome. Said so rather than claiming a repro I didn't
  have; the fix is the one the file's own existing pattern for the beeps
  already implied was necessary, not a guess.

  Updated the one test that asserted on fetch count per segment
  (`tests/features.test.mjs`) — it was written before the caching side effect
  existed, and the bilateral second side legitimately fires zero new
  requests now. All eight suites green (the known week-streak date flake
  aside). sw `CACHE` → v30, `VERSION` → v30, no files added or removed.
- 2026-08-04 — **v31: rename to `JUJI`, Stretch gets its own tab, louder
  beeps, a volume reminder.** Five separate asks in one go.

  **`Ju Ji` → `JUJI`, everywhere it's still shown as text.** The brand-mark
  *wordmark* has actually read "JUJI" since v25 (`WORDMARK_GLYPHS` in
  `js/ui.js`) — what hadn't caught up were the surrounding text strings:
  `<title>` in `index.html`, `name`/`short_name` in `manifest.webmanifest`,
  the footer template literal in `js/app.js`, and the wordmark's own
  `aria-label` (screen readers were hearing "Ju Ji" for a logo that visibly
  read "JUJI"). All four now say `JUJI`. Updated the "on-screen product name"
  note at the top of this file to match — it still said `Ju Ji` from v23,
  which was itself already one step behind the actual rendered wordmark.

  **Stretch is now a real tab**, not a screen borrowed under Home's
  highlight. Added a fifth `<a>` to the `.tabbar` in `index.html` between Log
  and Map — literally the middle position of five — with a small stick-figure
  icon (arms out, legs apart; abstract, matching the other tab icons' level
  of detail). `js/app.js`'s tab-mapping comment and logic dropped `stretch`
  from the "borrows Home's tab" list; `head === 'stretch'` now falls through
  to the default `'/' + head` branch, which already produces `/stretch` and
  matches the new tab's `data-tab`. The Home shortcut button into the
  cool-down was left in place — multiple entry points to the same screen is
  already how Settings and the focus deck work here, so this isn't a new
  pattern. `.tabbar a` is `flex: 1`, so a fifth item resized everything
  automatically; no CSS changes needed, confirmed by screenshot.

  **Beeps are square waves now, not sine, and louder.** User: they're timed
  right but too soft to hear over a TV. A square wave's extra harmonic
  content reads as sharper than a pure tone at the same gain, so the fix is
  both the waveform (`sine` → `square` in `createBeeper()`'s `tone()`) and
  raised gain (peaks roughly doubled) and raised pitch (each tone moved up
  400-700Hz) together — pitch and harmonic content are what make something
  sound "piercing," turning up gain alone would have just made the same soft
  tone loud. All four cues and the finish chime were rebalanced the same way.

  **A "turn your volume up" line on the stretch intro** — with an honest
  limit stated up front rather than glossed over: there is no web API that
  can read whether a phone is on silent or its media volume level. Nothing
  in a browser tab can detect that and act on it; a real "your phone is
  muted" notification is not buildable here. What's shipped instead is a
  static reminder (`.st-volume-hint`, same icon+small-text pattern as the
  existing `.mic-hint`) sitting right above the Start button, since that's
  the last thing on screen before the routine actually needs sound.

  **The voice-cue bug from v30 is still open.** User reports it's still only
  the first move per routine after updating. I re-verified: all 26 clips
  decode successfully in a real `AudioContext` (tested here in headless
  Chromium), so the files themselves aren't corrupt, and the v30 code read
  correctly on a second pass — I could not find a further bug in
  `createVoice()`. The leading theory is still that the phone hadn't
  actually picked up v30 before it was tested (the beeps — unrelated to that
  fix — reportedly still worked throughout, exactly what you'd expect if the
  *old*, pre-fix build was still what was running). Asked the user to confirm
  the footer reads the new version before concluding the Web Audio fix
  itself failed. User also offered to cut the 26 clips by hand — noted for
  them that this addresses accuracy of the cut, not the silence-after-move-1
  symptom, which is a playback bug independent of how the clips were cut.

  All eight suites green (known week-streak flake aside), screenshot-checked
  the new tab and the volume hint in light and dark. sw `CACHE` → v31,
  `VERSION` → v31, no files added or removed.
- 2026-08-04 — **v32: found the real cause of the silent voice cues — it was
  never a playback bug.** User: looked at the files on GitHub themselves and
  noticed the "silent" ones were 1-2KB, "which tells me there's no audio in
  them." Right, and it should have been checked this way from the start —
  v30's `decodeAudioData` test only proved the container decodes to a buffer
  of the correct *duration*, never that the buffer held actual sound. Ran
  ffmpeg's `volumedetect` on the shipped files: 24 of the 26 clips measured
  **-91dB, true digital silence**; only the two first-in-file segments
  (`deep-squat-hold`, `neck-side` — the two that happened to start at 0:00)
  had real signal. That is exactly the reported symptom, and it had nothing
  to do with Web Audio, autoplay policy, or anything in `js/views/stretch.js`
  — the v30 AudioContext rewrite was a real improvement (worth keeping,
  beeps and voice should share that pattern) but it was never the fix for
  this, because the *source files themselves* were silent.

  **Root cause, isolated by bisecting the ffmpeg command:** the original cut
  script did `-i src -ss $start -t $dur -af "afade=t=in:...,afade=t=out:st=$X:..."`
  in one pass. Split apart, `-ss`/`-t` alone cut real audio correctly (checked
  with `volumedetect`: -22dB, not silent) — the `afade=t=out:st=...` filter is
  what zeroed the clip, and it did so at *every* tested `st` value including
  0, so it is not a rounding-error-sized miscalculation, it is `afade`'s
  `st=` (stream-relative start time) breaking against a segment whose PTS
  hasn't been reset to zero by an output-side `-ss`. `deep-squat-hold` and
  `neck-side` both start at `-ss 0.0`, which is the one case where "stream
  time" and "segment time" already coincide — the two survivors were not
  luck, they were the only inputs where the bug's precondition doesn't hold.
  **Fix: cut in two passes.** Trim to an uncompressed intermediate WAV first
  (`-ss/-t`, no filter) so the second pass's input genuinely starts at PTS 0,
  *then* apply `afade` and encode to opus in a separate invocation. Verified
  by re-running `volumedetect` on all 26 re-cut clips before touching the
  repo: all 26 now read -20 to -23dB, none silent. Total clip footprint went
  132KB → 344KB, which is itself consistent with "most of these used to be
  empty."

  **The lesson, worth keeping somewhere I'll see it again:** decoding
  successfully and having correct duration are necessary, not sufficient,
  checks for "this audio file has content." If you generate or cut audio
  programmatically again, run `ffmpeg -af volumedetect` (or equivalent) on
  the *output*, not just on decodability — a container can be perfectly
  valid and completely silent at the same time, and nothing about a normal
  decode call will tell you that.

  Same 26 filenames, same ids, only the bytes changed. No code touched in
  `js/`; sw `CACHE` → v32, `VERSION` → v32 so the new clips actually
  invalidate the old cached (silent) ones on the phone.
- 2026-08-04 — **v33: the stretch routine now survives leaving the screen.**
  User: "Are you able to retain the timer if I click to another menu? And
  have it running in the background?" — "keeps beeping is enough for now,"
  no on-screen indicator needed elsewhere.

  **This inverts a deliberate, tested design decision**, not a small tweak.
  Since v26 the routine's whole state lived inside the Stretch screen itself,
  and a render-token check inside `tick()` deliberately tore the timer, the
  wake lock and both audio contexts down the instant the router cleared
  `#view` — there was a test pinning exactly that ("leaving the routine stops
  its timer instead of leaving it running"), because an earlier version of
  this pattern (the v16 render-clobber bug) left a stale interval running
  against a screen the user had already left. Making the routine survive
  navigation meant solving that same problem from the other direction:
  keep the *engine* alive across screens, while still guaranteeing a screen
  you've left can never paint over the one you're on now.

  **The fix is a split between engine and renderer.** `session` is now a
  module-level object (survives the router clearing `#view`, since ES module
  state isn't tied to any one screen) holding the routine, elapsed-time
  bookkeeping, and the beep/voice/wake instances; its own `setInterval`
  advances time and fires audio purely as a function of elapsed
  milliseconds, same as before, and never touches the DOM. Each *screen*
  that mounts `#/stretch` calls `attachRunning()`, which builds the running
  screen's DOM fresh and registers a paint callback in `session.renderers` —
  the callback checks its own render token on every tick (`js/render.js`,
  the same mechanism that already guarded async continuations elsewhere) and
  unregisters itself the moment a newer screen has taken over, but that only
  stops *painting*; the session keeps running underneath regardless. Visiting
  `#/stretch` while a session exists skips the intro and reattaches straight
  to the running screen, mid-clock, instead of restarting it. `startSession`/
  `endSession` are now the only things that actually stop the engine — the
  End routine button, or the routine finishing (which gives the finish chime
  900ms to ring out before closing the audio contexts).

  **Pause, skip and back now operate on the session, not a screen-local
  closure** (`setPaused`/`jumpTo` take the session as an argument), so muting
  the sound, pausing, or where you are in the routine all persist correctly
  across a screen leaving and reattaching — re-opening the screen rebuilds
  the mute button's icon from `session.beep.isMuted()` rather than assuming
  unmuted.

  **The old test was rewritten, not deleted**, since its actual point (a
  stale screen must never corrupt the one you've navigated to) still holds —
  only the specific assertion about the interval flipped. It now also
  confirms the engine keeps running while `#/log` is on screen and that
  returning to `#/stretch` resumes mid-clock rather than at the intro, and
  drove this for real in a browser: started a routine, skipped to a second
  move, left for `#/log`, waited a full 40-second segment there, and
  confirmed the *next* move's voice cue fired as a network request while
  `#/log` was the visible screen — then confirmed returning to `#/stretch`
  landed on "HOLD 3 OF 21," not segment 1.

  All eight suites green (known week-streak flake aside). sw `CACHE` → v33,
  `VERSION` → v33, no files added or removed.
- 2026-08-04 — **v34: a warm-up section on the rest-day routine.** User asked
  whether the rest-day movements need a warm-up first, was told yes (they
  load you at end-range cold, unlike the after-class cool-down where a class
  already warmed you up), and asked to add one rather than have to remember
  it separately.

  **Four items, prepended to `REST_DAY_ITEMS`** in `js/stretches.js`, marked
  with a new `warmup: true` flag rather than being a separate list the engine
  has to know about: march in place (general blood flow), bodyweight squat
  pulses (hips/knees/ankles), arm circles (shoulders), leg swings (hips/
  hamstrings, bilateral). They run through the exact same ready/work/rest
  engine as every other movement — same 10s/35s/20s phases — deliberately;
  giving warm-up items their own shorter timing is exactly the kind of
  per-movement special-casing the engine's segment-index-as-division design
  has resisted since v27, and doing it here would reopen that.

  **Two places show the split.** The intro list (`overview()` in
  `js/views/stretch.js`) now sections "Warm-up" from "Main session" using the
  same `.section-head` pattern Home already uses for "Working on" / "Last
  session," instead of blending 17 items into one undifferentiated list — but
  only when a routine actually has warm-up items, so the cool-down keeps its
  single flat list untouched. The running screen gets a green `.st-warmup`
  badge next to the dose badge during those four sets; green because that is
  already the rest-day rest phase's colour — a warm-up is a positive,
  unhurried state, not a gap, and amber stays reserved for that job alone.

  **Rest day is now 17 movements, 23 sets, ~25 minutes** (was 13/18/~19:30).
  `tests/stretches.test.mjs`'s asserted window for the routine's length
  widened from 15–22 to 15–26 minutes to match — a deliberate acceptance of
  more total time as the cost of warming up, not a loosened test. Two
  content ids needed art/audio bookkeeping even though neither exists yet:
  added to `PENDING_ART` in `js/stretch-art.js` (same contract as every other
  undrawn movement), and the test harness's response listener in
  `tests/features.test.mjs` gained an exception for `audio/cues/*.webm` 404s
  — a movement with no voice clip recorded yet 404s by design, same as
  `createVoice()`'s own contract, and until now nothing had exercised that
  path since all 26 existing clips exist. `deep-squat-hold.webm` was the
  rest-day routine's first announced clip before this and is now second;
  updated the two tests that hard-coded it, and the two step-count
  assertions that hard-coded the old "18" total.

  All eight suites green (known week-streak flake aside), screenshot-checked
  the new section and badge in light and dark. sw `CACHE` → v34, `VERSION` →
  v34, no files added or removed.

- 2026-08-05 — **v35: the strength module, and the Stretch tab became `Off mat`.**
  User handed over a written spec (a Claude-chat brief, now kept verbatim as
  `docs/STRENGTH.md`) for a once-a-week bodyweight strength programme, and asked
  for it inside the stretch section — *"might mean we need to rename the
  section."* It did. **Read `docs/STRENGTH.md`'s "As built" section before
  touching any of this**; only the short version is here.

  **The rename.** Offered four names and the user picked **Off mat** — precise,
  and it dodges a collision: "training" already means BJJ everywhere else in
  this app (training calendar, weeks trained). Tab label, page title and page
  sub all changed; the route `#/stretch` did **not**, because nothing is gained
  by breaking a bookmark or an installed shortcut over a word. `#/strength` is
  a second route under the same tab, and `app.js` maps it to `/stretch` so one
  tab lights for both. The segmented picker moved into `js/ui.js` as
  `offMatTabs()` and is now three tabs shared by both views — routine tabs stay
  `<button>`s (they swap in place, so a running routine survives), the strength
  tab is an `<a>` because it is a different screen. Both are styled.

  **Why it is not built on the stretch engine.** The two routines are
  *timelines*: every segment is the same length, the current one is a division
  over elapsed milliseconds, and nothing is written down. A lift is the
  opposite — self-paced, and the numbers are the entire point. Sharing an engine
  would have bent one of the two out of shape. They share the section, `beeps.js`
  and `wakelock.js` (both lifted out of `js/views/stretch.js` this version), and
  nothing else.

  **The engine is pure and is the only part worth testing.** `js/strength.js`
  has no DOM, no storage and no clock; `tests/strength.test.mjs` is 26
  assertions against it, and the suite count is now **nine**. The four-step
  ladder — reps to a ceiling, then a 3s then 5s eccentric, then a 2s pause, then
  a harder variation — is the whole product: this app has no weight to add, so
  that ladder is the only way the numbers move. Two rules in it are easy to get
  wrong and are pinned by tests: **a set counts as hit only if the reps *and* the
  tempo held**, and **one bad session holds, two in a row regress** (regressing
  off every bad week means never going anywhere). `needsLoad` is what stops the
  programme stalling *silently* — the engine will never move you onto a
  variation marked as needing weight, because "put on a vest" is a decision, not
  a rep.

  **`ExerciseState` is derived, not stored.** `programmeState()` replays the
  whole log every time. A stored counter drifts the moment a session is edited or
  deleted, and drift in this particular number is invisible: you would simply be
  told to do the wrong thing forever, once a week, with nothing to notice. Fifty
  sessions replay in no time.

  **Storage, and the cost of it.** Sessions are **settings rows**
  (`strengthSessions`), not journal `entries`. An entry's backup format is a
  fixed tiny grammar of front-matter scalars, and a session is an array of
  exercises each holding an array of sets — there is no honest way to write that
  in it, and adding YAML to try is the thing this file forbids. Settings ride
  along in Export/Import for free. **The cost, stated plainly: strength sessions
  do not sync to the notes repo**, exactly like focuses and `likedMoves`. Same
  standing gap, now one item bigger.

  **Three deliberate departures from the spec**, all recorded in the doc: **no
  RPE** (the spec marks it optional, and the BJJ side had a 1–5 "how it went"
  that the user asked to remove in v21 — putting a 1–10 version of the same
  question on an adjacent screen is reintroducing something they rejected; the
  `note` field exists in the model with no UI, for the same reason — nothing on
  this screen wants a keyboard); **no multi-week climbing-load flag** (the cheap
  half shipped, `This week: 3 classes · 1 lift` from `store.weekLoad()`; flagging
  a climbing total is a claim about injury risk, and this app reports what was
  written down and never diagnoses); and **muting is a plain toggle**, since the
  app tracks no injuries.

  **Integration.** `trainingIndex()` now takes strength sessions as a second
  argument and marks a lift with a corner tick rather than a fill, so a day that
  held both a class and a lift still reads as both — one calendar, not two. A
  lift started on a day with BJJ already logged gets an amber banner saying lift
  after class, never before. That banner is the one place in the app where
  `.b-txt` wraps instead of truncating: the rule it states is the whole point,
  and "Lift after…" is worse than nothing.

  **Two bugs found by looking at the thing rather than by testing.** (1) The
  summary screen's "Back to the plan" was an `<a href="#/strength">` — on a
  screen that already sits at `#/strength`. No `hashchange`, no re-render, a
  button that does nothing. It is a `<button>` calling back into the view now,
  and there is a test on it. (2) The set corrections were a popover anchored
  under the button; five 58px set buttons wrap onto two lines at 360px, so set
  one's popover landed squarely on set five. It renders under the whole row now,
  in flow, and the buttons are `flex: 1 1 0` so five of them fit one row at 360px
  and get *bigger* on a wider phone.

  Nine suites green (the known week-streak date flake aside), screenshot-checked
  every screen in light and dark at 390px and 360px, no horizontal overflow, 0
  animations under `prefers-reduced-motion`. sw `CACHE` → v35, `VERSION` → v35;
  `js/strength.js`, `js/beeps.js`, `js/wakelock.js` and `js/views/strength.js`
  added to `SHELL`.

- 2026-08-05 — **v35 deployed.** `main` fast-forwarded from v34 (`ab9fa6a`) to
  `5afa9b3` and pushed, so GitHub Pages is serving v35 at
  `https://kezbolino.github.io/JJ-app/`. Ship gate before pushing: nine suites
  green (the known week-streak date flake aside; `schedule` under UTC,
  `America/Los_Angeles` and `Australia/Sydney`), `CACHE` == `VERSION` == v35,
  clean tree, fast-forward confirmed rather than a merge.

  **No churn expected in `jj-app-data`.** Nothing in v35 touches
  `js/markdown.js` or the entry model — strength sessions are settings rows, not
  entries, and settings have never been part of the notes-repo mirror.

  **Check the footer reads `JUJI v35` before judging anything on screen.** Same
  trap as every previous deploy: the installed PWA serves the old shell until
  the service worker takes the new `CACHE`, so close it fully and reopen. The
  visible tell that it landed is the tab bar — the middle tab should read
  **Off mat**, not Stretch.

- 2026-08-05 — **v36: Skip rest fixed, Home's stretch shortcut removed, the cog
  replaced.** Four small things off the back of the user testing v35 on the
  phone.

  **`Skip rest` did nothing, and that is on me.** The button was built,
  appended and styled in v35 and never had a click handler attached — it looked
  like a control and was inert. No test covered it, which is the actual lesson:
  the v35 suite asserted the rest timer *appeared*, so a button that did nothing
  passed every check. The fix is one line; the test that now pins it was
  verified against the broken code first (it fails with "Skip rest did not end
  the rest") rather than being written after the fact and assumed to work.
  Skipping stops the beeps as well as the countdown — ending a rest early means
  you are going again now, so the 3-2-1 would land mid-set.

  **Home lost the "Stretch off · 14 min" button** at the user's request. It
  predated the Off mat tab: when the cool-down was reachable only from Home it
  needed a door, and it has had one in the tab bar since v31. `routineMs` /
  `getRoutine` / `DEFAULT_ROUTINE` dropped out of `home.js`'s imports with it —
  a removal that leaves an unused import behind is how a file slowly stops
  telling the truth about what it depends on. Test pins both halves: no
  `#/stretch` link in `.view`, and the tab that replaced it is still there.

  **The cog is gone; Settings is `sliders` now.** The user said it "looks shit"
  and they were right — rendered at 4× it is a soft, lumpy blob with eight
  uneven teeth, and at the 21px it actually ships at it reads as a smudge. It
  was the only icon in `SHAPES` trying to be a picture of a machine part; every
  other one is two or three strokes. Three rails and three knobs survive being
  small because there is nothing in them to lose. Compared against a properly
  computed 8-tooth gear before choosing (contact sheet at 21px and 3×) — the
  clean gear is a real improvement on the old one and still lost to the
  sliders on legibility at size. `gear` is **removed** from `SHAPES`, not left
  orphaned; `.settings-btn` is unchanged, so the smoke test's route assertion
  needed only a wording fix.

  Nine suites green (the known week-streak date flake aside). sw `CACHE` → v36,
  `VERSION` → v36, no files added or removed.

- 2026-08-05 — **v37: the Off mat tab icon is a dumbbell.** The stick figure
  added in v31 was the only *pictorial* icon in a nav bar of two- and
  three-stroke glyphs (house, plus-circle, chart line, books), and it packed a V
  of arms and a V of legs within a few pixels of each other — at the 21px it
  renders at, the two Vs merged and the head detached, so it read as a scribbled
  asterisk.

  Drew fourteen candidates across two rounds and rendered every one **inside the
  real nav bar at real size**, which is the only test that means anything —
  judged as isolated 24px artwork, several of the rejects looked fine. What that
  caught: a kettlebell reads as a handbag (the handle arc merges with the bell),
  a rolled mat reads as a toggle switch, and a "flex arc" reads as a trending-up
  arrow. The user picked the dumbbell over a properly redrawn figure and over a
  minimal lengthen-arrow.

  **Worth knowing, because it is a real tension and not an oversight:** the tab
  holds three things and two of them are stretching, so a dumbbell leans on the
  strength third — and the programme is bodyweight, so it also implies weights
  that are not in it. Chosen anyway, with that stated: it is the one candidate
  legible at a glance, and five straight strokes is a shape with nothing to lose
  at small size. If it ever reads as over-claiming, option 4 from that round (a
  redrawn figure, arms up) is the swap.

  The tab bar's icons are **inline SVG in `index.html`**, not entries in
  `SHAPES` — nothing in `js/ui.js` changed. sw `CACHE` → v37, `VERSION` → v37.

- 2026-08-05 — **v38: "now the other side" cues.** The user recorded the file-3
  script parked last session and asked for it cut up and played during the 10s
  get-ready phase of a two-sided movement, picked at random. Six lines in the
  take, not the eight the script listed.

  **The cut was ordinary this time, and that is the whole story.** The take has
  a deliberate pause after every line — gaps of 1.16–1.89s — so
  `silencedetect=noise=-35dB:d=0.28` found six speech runs directly and there
  was none of the v29 word-count-proportion guesswork. Padded 90ms in / 140ms
  out, which cannot reach a neighbour across a 1.16s gap. Checked the arithmetic
  rather than trusting it: speech in the source is 8.33s and speech in the six
  cuts is 8.33s, so nothing was dropped.

  **Both v32 traps were paid attention to.** Cut in **two passes** — trim to an
  intermediate mono WAV with no filter, then fade and encode to opus in a
  separate invocation, because combining `-ss`/`-t` with `afade` in one command
  is what silently produced 24 empty files. And verified with `volumedetect`:
  all six read -19 to -24 dB mean, in line with the existing clips. **There is
  no ffmpeg in this session's image** — `pip install imageio-ffmpeg` provides a
  static 7.0.2 build with libopus, which is the way to get one.

  **`pickOtherSide(last, rand)` is pure and lives in `js/stretches.js`, not in
  the view.** That is not tidiness: the browser caches a decoded clip, so a
  repeat play fires **no network request**, and a Playwright test watching
  requests silently undercounts — the first version of that test failed
  claiming "only 4 cues fired" when eight had. The choice is the only part of
  the audio path checkable without ears, so it has to be reachable from node.
  Four unit tests cover it: never repeats back to back, every take reachable
  from every previous take, uniform over the five it may pick, and every number
  it can return has a file in `SHELL`. The first draft had a fencepost that made
  take 1 unreachable on the opening draw — the reachability test is there
  because of it.

  **The "is this the second side?" test is `segs[i-1].item.id === segs[i].item.id`,
  not `side === 'Right side'`.** The label is display copy; keying audio to it
  means a copy edit silently changes what you hear.

  The browser test that remains checks the clips rather than the picker: all six
  load, decode, run 0.5–4s, and have a **peak above 0.05** — measured off the
  decoded samples, because a valid container of the right duration with silence
  in it is exactly what shipped twice in v29.

  Nine suites green (the known week-streak date flake aside). sw `CACHE` → v38,
  `VERSION` → v38; the six clips added to `SHELL`.

- 2026-08-06 — **v39: all 30 move names re-cut, plus a spoken countdown and
  seven hype lines.** One 2:37 take holding four zones (13 cool-down names, 17
  rest-day names, one "3, 2, 1, let's go", seven hype lines), with the zone
  boundaries the user gave as timestamps.

  **The cut was hard, and the reason is worth knowing — it is about the
  delivery, not the recording.** (Corrected after the fact: I first blamed
  background music, inferred from the filename, and said so here. There is no
  music. My own measurements disproved it in the same session — every gap in
  the file is true digital silence, −70 to −100 dBFS, which is exactly what
  music underneath would rule out — and I kept the wrong explanation anyway.
  Don't repeat that: the numbers were right there.)

  The actual problem is that **the pauses inside a line and the pauses between
  lines overlap in length**, because most lines are two sentences ("Deep squat
  hold. Sit all the way down in it, fo shizzle.") and some lines run into the
  next with barely a breath. Concretely, in this take:

  - a pause *inside* `ninety-ninety-liftoff`, between "lift-off" and "small
    range", is **0.74s**;
  - the break *between* `bear-crawl` and `side-plank` is **0.33s**.

  So a mid-sentence pause ran more than twice as long as a real line break, and
  no width threshold can separate those. Picking "the n-1 widest gaps" landed on
  the right *total* by merging two lines and splitting another — a correct count
  is not a correct segmentation, and that is the trap to remember.

  **What worked: transcribe and align.** `pip install pocketsphinx` (the
  acoustic model ships inside the wheel, so no download — Whisper's is still
  blocked by this session's egress policy). Split on every gap ≥0.40s to get
  *fragments*, transcribe each, and align them against the script by hand. The
  transcript is garbage in isolation — "os x one makes" is "Cossack squat next" —
  but it is unambiguous about *which line* a fragment belongs to, which is the
  only question being asked. That caught two errors width alone had made:
  `ninety-ninety-liftoff` spans a 0.62s gap, and `bear-crawl` / `side-plank` are
  separated by only 0.28s.

  **Every one of the 30 output clips was then transcribed again and checked
  against its own move.** 29 matched a distinctive word outright; the 30th
  (`quad-kneel`) matched on its tail, "you know don't rush it" for "young'n.
  Don't rush it". That audit is the closest thing to listening available here,
  and it is worth the two minutes — a clip cut one line early is silent about
  its own wrongness.

  The v32 traps were handled as before: two-pass cut (trim to WAV, then fade and
  encode), and `volumedetect` on all 38 outputs — −20 to −29 dB, none silent.
  `pip install imageio-ffmpeg` is still how to get an ffmpeg in this image.

  **The wiring.** Two new slots, both deliberately *not* on every set — the
  beeps are the baseline and a voice on every rep is just the noise the app
  makes. `COUNTDOWN_CHANCE` 0.18: a spoken "3, 2, 1, let's go" fires with 3
  seconds of get-ready left and **replaces** the three tick beeps rather than
  playing over them (muted falls back to ticks, so the last three seconds are
  never silent). `HYPE_CHANCE` 0.45: a hype line as the work phase starts. They
  are **mutually exclusive by construction** — both are decided once, on
  entering the ready phase, because the countdown already ends on "let's go" and
  a hype line on top of it would be two voices at once.

  `pickOtherSide` generalised to `pickCue(count, last, rand)`, with `pickHype`
  as the second caller. Same no-immediate-repeat guarantee, same unit tests, now
  run over both counts.

  **Testing a coin flip.** The two new cues fire at random, which is untestable
  as written, so the browser tests stub `Math.random` via `addInitScript` before
  the app loads — 0.10 lands under the countdown chance, 0.30 misses it and
  lands under the hype chance. That pins the wiring deterministically while the
  pickers stay unit-tested. The clip-integrity test now covers all 14 generic
  cues and still measures **decoded sample peaks**, not duration.

  Nine suites green, 50 browser assertions. sw `CACHE` → v39, `VERSION` → v39;
  `countdown.webm` and `hype-1..7.webm` added to `SHELL`.

- 2026-08-06 — **v40: five amends to the Off mat routines, and the timing engine
  stopped assuming uniform segments.**

  **The warm-up now flows.** User: it does not need a get-ready or a rest, it
  should lead into the next one and be announced during the work phase. Right on
  all three counts — counting you into a march on the spot is dead air, and
  resting 20s between movements whose job is to warm you up defeats them.
  `phasesFor(routine, item)` gives a `warmup` item `{ready: 0, work, rest: 0}`.
  Rest day drops 24.9 → 22.4 minutes.

  **That broke the invariant this file has defended since v27**, and the fix is
  worth understanding rather than reverting. Segments used to be uniform so the
  current one was `floor(elapsed / SEGMENT)`. `segments()` now precomputes each
  segment's `start`/`end` and `segmentAt()` binary-searches them. **A
  precomputed table is not a running total.** The rule that mattered was never
  "all segments are equal" — it is that *nothing accumulates per tick*, because
  an accumulator drifts and a lookup cannot. A phone that sleeps through half a
  routine still resumes in exactly the right place, which is the whole point,
  and there are tests pinning that the timeline is contiguous and that
  `segmentAt` is exact at every boundary.

  The spoken name follows the phases rather than the `warmup` flag: it lands on
  whichever phase the segment *opens* with. A movement that flows straight in
  also gets no countdown and no hype line — there is no get-ready to count down,
  and its own name is already playing.

  **Rest now shows what is coming.** It used to keep the movement you had just
  finished on screen and put "Next: …" in the cue line. You cannot set up for a
  movement you cannot see, so the whole card — figure, name, targets, dose, cue
  — is now the next one, badged `NEXT UP`. The *counter* still reads the set you
  just did, because the rest belongs to that set; `paintSegment(showIdx,
  stepIdx, ahead)` carries both indices for exactly that reason.

  **Finishing a routine marks the calendar.** New `mobilitySessions` settings
  row, same storage call and same not-yet-syncing trade-off as strength.
  `trainingIndex()` takes a third argument and the calendar marks mobility in
  the **bottom-left** corner in green, opposite the lift's top-right blue, so a
  day can carry a class, a lift and a stretch and read as all three. **Only a
  routine run to the end counts** — ending early is not a session you did. It is
  never a class and nothing counts it as one: there is a test asserting the
  class total stays at zero after a cool-down. "Log a class" is gone from the
  finish screen, which is what prompted this.

  **Two chrome fixes.** `End routine` was an underlined text link and is now a
  filled red button — the first and only use of `--danger` in the app, which
  gets a note in the tokens saying red means "this throws work away" and is not
  amber's job. And the `JUJI vNN` footer is hidden while a routine runs
  (`body:has(.st.is-running) .appfoot`) — checking a deploy landed is not
  something you do mid-hold, and it stays everywhere else because that is how
  you check a deploy landed.

  **A test technique worth reusing:** `fastPage(factor)` in
  `tests/features.test.mjs` overrides `performance.now()` via `addInitScript`
  so the routine's clock runs 25× (or 400×) faster. The engine derives
  everything from that clock, so the routine speeds up and nothing else does —
  `setInterval` still fires on real time and the ticks just land further apart
  on the timeline. It is the only way to reach a rest phase 45 seconds into a
  set, or a finish screen 14 minutes in, without a test that takes that long.

  Nine suites green (53 browser assertions), screenshot-checked warm-up, main,
  rest, finish and calendar in light and dark, no overflow at 390px. sw `CACHE`
  → v40, `VERSION` → v40, no files added or removed.

- 2026-08-06 — **v41: the strength session got a voice, and a v39 precache bug
  came out with it.** One 69s take: eight lift names, five "rest is over" lines,
  three extra motivational ones the user added at 1:04 and told me to "use
  wherever".

  **The cut was ordinary and the audit is the part that matters.** They batched
  roughly three lines per generation (the free TTS caps at 200 characters), so
  the between-generation gaps are 2–4.5s and the between-line gaps 1.2–1.8s —
  wide enough to split on directly. What is *not* optional is the check
  afterwards: **all eight lift clips were transcribed and matched against their
  own move name**, 8/8, and that mapping was shown to the user before anything
  was wired. They asked "can I trust you wire it correctly", and the honest
  answer is not to ask for trust — the eight names are the only clips whose
  identity matters, so verify those and show the table. The generic pool cannot
  be mis-mapped by construction: any of them can play in any slot.

  One line, `rest-over-1`, is only 0.91s ("Rest done.") where the script had a
  longer line. Kept — it is a complete short line, not a clipped one.

  **Where they play.** The rest timer is the only moment in a lift when the
  phone is face down, so that is where the voice went: when the rest ends it
  either names the **next** movement (if the one you just did is finished) or
  plays a generic "rest is over" (if you are going again). The beep alone cannot
  tell those apart, which is the whole point. `nextExerciseId` skips muted
  movements and ones already complete. The three motivational lines joined the
  stretch routines' hype pool as `hype-8..10`; `HYPE_CUES` 7 → 10 and nothing
  else changed.

  **`createVoice()` moved to `js/voice.js`**, alongside `beeps.js` and
  `wakelock.js`, now that both Off mat screens use it.

  **Two bugs found on the way, neither reported by a user.**

  1. **Four clips shipped in v39 were never precached.** `warmup-march`,
     `warmup-squat`, `warmup-arm-circle` and `warmup-leg-swing` were new files
     in v39 — the warm-up had no voice before — and I added them to disk and not
     to `SHELL`. They 404 offline, silently, because `createVoice` swallows a
     missing clip by design. There is now a test asserting **`SHELL` and
     `audio/cues/` match exactly, both directions**: a clip on disk but not
     precached is silent offline, and a clip in `SHELL` that does not exist is
     worse — `cache.addAll` rejects and the *whole service worker install*
     fails. Verified the test fails on each direction before keeping it.
  2. **The strength screen leaked an AudioContext per visit.** Since v35 it
     built a beeper on every mount and never closed it; adding a voice would
     have doubled the rate. Browsers allow only a handful, so a few visits in
     every tone would have gone silent with no error at all. `mountAudio()`
     closes the previous pair, bounding it at one.

  **A latency fix that the test flushed out.** The cue for the end of a rest is
  known two minutes ahead, so `voice.preload(id)` fetches and decodes it when
  the rest *starts*. Otherwise the first play on a cold cache puts a network
  round-trip between the beep and the voice, at the exact moment you are not
  looking at the screen. (The test that caught it was watching for a request
  that only fired when the timer fired — worth remembering as a way to notice
  work happening later than it should.)

  `audio/cues/` is now 60 clips, 824 KB, all precached. Nine suites green (55
  browser assertions). sw `CACHE` → v41, `VERSION` → v41; `js/voice.js` added
  to `SHELL`.

## Parked — pick this up next session

**Everything through v41 is shipped and deployed.** The voice-cue re-recording
job that sat parked here is **finished** — all 30 per-move names, the six "other
side" takes (v38), a spoken "3, 2, 1, let's go" and seven hype lines are cut and
wired. `audio/cues/` holds 44 clips, ~600 KB, all precached in `SHELL`.

**If more clips ever arrive, read the v39 entry before cutting them.** The short
version: in that take the pauses *inside* a line were sometimes longer than the
breaks *between* lines (0.74s vs 0.33s), so no gap-width threshold could split
it and a plausible-looking split was silently wrong. The only thing that worked
was transcribing the fragments with `pocketsphinx` and aligning them against the
script. Budget for that whenever the pauses are not obviously graded — the v38
take, with a deliberate 1.2–1.9s after every line, was a ten-minute job.

**Also still open**, unchanged and unrelated to the audio: 19 movements have no
artwork (`PENDING_ART` in `js/stretch-art.js` — the 15 from v27 plus the four
v34 warm-up items); `docs/AUDIT.md` §4–§9; and focuses, `likedMoves` and now
**strength sessions** are all device-local and do not sync. The strength module
ships no artwork and no voice cues at all — it is a form, not a routine, so it
needs neither, but if the two stretch routines ever get their missing figures
the eight lifts are the obvious next ask.
