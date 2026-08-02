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
node tests/moves.test.mjs       # pure node, fast
node tests/schedule.test.mjs    # pure node, fast — dates, SRS, attendance
python3 -m http.server 8099 &   # the three browser tests need this
node tests/smoke.mjs            # Playwright; the whole app loop
node tests/sync.test.mjs        # Playwright + fake GitHub (tests/fake-github.mjs)
node tests/features.test.mjs    # Playwright; timer, calendar, deck, trash, links
```

**Run all seven after touching anything in `js/`.** Between them they cover the
core loop (log → tag → technique page → dashboard → coverage prompt), tagging
including user corrections, backup format fidelity, multi-device sync including
deletions, the move-suggestion engine, and everything added in v17.

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
