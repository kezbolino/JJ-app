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
