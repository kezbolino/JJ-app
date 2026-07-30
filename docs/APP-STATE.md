# JJ-app — Current State (for a redesign brief)

> A snapshot of what the app *is today*, written so a designer can propose a
> redesign without reading the code. Current shipped version: **v12**, live at
> `https://kezbolino.github.io/JJ-app/`. Date: 2026-07-30.

---

## 1. What it is

A **personal knowledge system for Brazilian jiu-jitsu**. You journal every
class, and the app connects entries into a lightweight knowledge graph so it can
surface patterns in your game over months and years.

The core, non-negotiable idea: the app reports **what you have written about**,
never **what you are good at**. Note volume is *attention*, not *skill*. Every
number and chart is framed as coverage/attention, never competence.

The signature feature is **coverage asymmetry**: "you've written a lot about
half-guard *sweeps* — how's your half-guard *passing*?" A gap is an empty cell
next to a full one.

---

## 2. Hard constraints (these shape every design decision)

- **Static offline PWA.** No build step, no framework, no dependencies. Plain
  ES modules loaded straight from disk. This is what lets it deploy to any
  static host and be edited from a phone. A redesign must stay build-free —
  no React, no Tailwind, no bundler.
- **Phone-first, and the phone is Android/Chrome on CalyxOS** (de-Googled).
  Don't assume iOS/Safari. No Google Fonts CDN, no Google services — the
  brand font is self-hosted (`fonts/nunito.woff2`, 39 KB).
- **Offline-first.** Service worker caches the whole shell; everything works
  with no network. IndexedDB is the source of truth.
- **Small files, no deps.** No WASM, no in-browser ML/transcription. Deliberate.
- **Public repo, no secrets.** Served by GitHub Pages. The private journal data
  lives in a *separate* private repo.
- **Never render user content as HTML.** All DOM is built with a tiny `h()`
  text-node helper; there is no `innerHTML`.
- **Single accent colour: blue** (`--accent`). A Figma orange was previously
  proposed and *declined by the user* — don't reintroduce orange as the brand
  colour. Warm amber (`--warm`) is reserved for "gap / attention" signals only.

---

## 3. Tech shape / layout

```
index.html            shell + bottom tab bar
css/app.css           ALL styling (~650 lines); light + dark via prefers-color-scheme
js/app.js             hash router (#/…) and boot
js/ui.js              h() element builder, icon() SVG set, shared chips/cards
js/views/*.js         one file per screen (home, log, map, position, library, search, settings, focus)
js/store.js           entry CRUD + every derived query (coverage, gaps, themes, moves)
js/ontology.js        shipped positions/roles/techniques/synonyms
js/tagger.js          text → suggested tags (literal matching, NO AI)
js/appearance.js      device-local font + button-style prefs
js/version.js         VERSION string (footer)
sw.js                 offline cache
```

Rendering model: the router clears `#view` and calls a view function that
appends DOM nodes. No virtual DOM, no state library. Re-render = rebuild nodes.

---

## 4. Navigation

A **fixed bottom tab bar** with four tabs, each an inline SVG icon + uppercase
label:

| Tab | Route | Purpose |
|-----|-------|---------|
| **Home** | `#/` | Dashboard / front door |
| **Log** | `#/log` | Capture a class |
| **Map** | `#/map` | Coverage map + "your game" |
| **Library** | `#/library` | Everything saved + videos/notes + backup |

Not in the tab bar (reached by links): **Working on** (`#/focus`, flashcards,
maps to Home tab), **Position page** (`#/map/:position`), **Search**
(`#/search`), **Settings** (`#/settings`, maps to Library tab). A version
footer (`JJ-app v12`) sits above the tab bar on every screen.

---

## 5. Screen-by-screen (current content)

### Home (`#/`) — the dashboard, front door
- **Brand row**: "JJ" wordmark (blue) + a round **sync button** top-right
  (cloud icon; links to Settings if sync unconfigured, else taps to sync now,
  spins while busy, shows an amber dot when there are unpushed changes). App
  also auto-syncs once per calendar day in the background.
- **Hero card**: big "Total classes logged" number, a divider, then a 3-stat
  row (This week · Last 30 days · Gi/No-gi %).
- **Focus banner**: "Working on: … · Drill" — links into the flashcard deck.
- **Gap panel** (conditional): "You've written about X pass N times — and
  nothing on retain." Only appears once there's enough data to be honest
  (threshold: a sibling role with ≥3 entries).
- **Last session** section: one card showing the most recent class (date, gi
  flag, title, snippet, up to 4 tags) with an explicit "✎ Edit" affordance.
- **Big CTA**: "Log a class" — the largest tap target, gently breathing.

### Log (`#/log`, or `#/log/:id` to edit) — capture
Capture friction is treated as *the whole product*. Sensible defaults, nothing
mandatory.
- Header: "Log a class" / "Edit entry" + Cancel.
- Date picker + Gi/No-gi segmented toggle on one row.
- Three freeform textareas: **What we drilled**, **Rolling notes**,
  **Key thoughts & adjustments**.
- A one-line mic hint: "tap a field and switch to your voice keyboard to talk
  your notes in" (voice capture = an offline voice keyboard, not in-app
  transcription).
- **Tags**: current tags as chips + suggestions generated live from the text
  (literal matching). Tap a suggestion to accept; ⊘ mutes a wrong word forever.
- Behind "Show options": add a tag by hand (Position → Role → Technique
  pickers) and "Teach a word" (map your gym's slang onto a real technique).
- Save / Delete.

### Map (`#/map`) — coverage + your game
The honest radar. **This screen contains the app's most protected feature.**
- Header "Your map" + subtitle.
- **Your game**: star moves you like; the app suggests adjacent/similar ones to
  drill next (ontology-based, no AI). A Position→Move picker to star by hand.
- A **decorative radar backdrop** (dots per busy position — purely decorative;
  the honest numbers are the bars).
- **Exposure breakdown**: horizontal bars, share of attention per position,
  labelled "attention, not skill."
- **Gaps**: roles with nothing written next to roles with plenty.
- **Roles within each position**: the *sacred* position×role coverage bars —
  one row per role, filled bar + count, empty siblings flagged amber as gaps.
- Untouched positions listed at the bottom.

### Position page (`#/map/:position`) — a technique page, assembled from tags
Coverage bars for the position, a technique list where you can ★ moves you
like, then entries and videos that were tagged to this position.

### Library (`#/library`) — everything saved
- Search field, a "N not backed up yet" banner when sync is dirty.
- **Saved videos** (paste a YouTube link → auto-title + thumb).
- **Notes** — fast-capture row for note/question/coach-principle.
- **Everything** — the full entry list.
- **Backup** card (sync settings, JSON export/import).

### Working on (`#/focus`) — flashcards
The focus list is a **flippable flashcard deck**: one card at a time (front =
the thing you're drilling, back = your cues), tap to flip (CSS 3D), prev/next
with a counter, and an "Edit deck" editor.

### Search (`#/search`) — plain full-text fallback over all entries.

### Settings (`#/settings`) — sync config, ontology corrections, **Appearance**
(App-font picker: Nunito/System/Serif/Mono; Button-style picker: Chunky/iOS),
manual JSON backup.

---

## 6. Visual language (current)

The current look is a **Duolingo/Brilliant-flavoured** system applied over the
app's own blue.

- **Type**: Nunito (self-hosted variable font, weight 400–900). Body weight
  500; headings/buttons 700–800. Swappable per-device.
- **Colour**: dark by default, light via `prefers-color-scheme`. Tokens:
  - `--bg #0d0f14` / `--surface #151821` / `--surface-2 #1d212c` / `--line #272c3a`
  - `--text #e7e9ee` / `--muted #949bad`
  - `--accent #6ea8fe` (blue) — the one brand colour
  - `--warm #f0b429` (amber) — gaps/attention/pending only
  - `--good #57caa0` (green) — the gi/no-gi stat
- **Shape**: 16px card radius; **999px full-pill buttons**.
- **Buttons ("chunky")**: a solid colour *edge* via `box-shadow: 0 4px 0`; on
  press the button drops `translateY(4px)` and the shadow collapses to 0 (fast
  down, springy back). The CTA has a 6px edge and a slow "breathe." An iOS-flat
  alternate (`data-btn="ios"`) swaps the plunge for a dim+shrink.
- **Nav**: a soft tinted pill springs in behind the active tab's icon.
- **Inputs**: 12px radius; focus swaps border to blue + a soft ring (no outline).
- **Bars** (coverage/exposure): recessed inset groove, 0.8s fill sweep.
- **Motion**: one master `--spring` easing everywhere. On every route the view's
  top-level blocks rise in a short staggered cascade. Chips pop when tapped.
  Full `prefers-reduced-motion` disable list at the bottom of the CSS.

Icons are a small hand-authored inline-SVG set in `js/ui.js` (`SHAPES`):
home, log(+circle), map(zigzag), library, user, pin, calendar, search, video,
chevron, plus, cloud, edit, star, mic.

---

## 7. Data model (must survive any redesign)

One record type for everything, distinguished by `type`
(`class | note | question | video | principle`):

```js
{ id, type, date, gi: 'gi'|'nogi'|null, title,
  sections: { techniques, rolling, thoughts },   // class entries
  body, tags: [...], video: {…}|null, createdAt, updatedAt }
```

**Tags are pairs, never words** — this is the load-bearing decision:

```js
{ kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' }
{ kind: 'concept', concept: 'Pressure' }
```

Because a tag carries **position × role**, the app can answer "how much on
half-guard *passing* vs *sweeps*?" A flat tag list cannot, and retrofitting
would mean re-tagging every entry. Coverage is **derived on read**, never
stored. One entry counts once per cell (verbosity ≠ volume).

Storage: IndexedDB (`jj-app`), source of truth. Optional sync mirrors entries
as one-markdown-file-per-entry to a **separate private GitHub repo**; deletions
use tombstones; newest `updatedAt` wins; one commit per sync. The sync token
lives only in the browser.

---

## 8. Things a redesign MUST NOT break

1. **The position×role coverage map** (Map → "Roles within each position").
   It is the whole reason the data model is shaped the way it is. Keep it, and
   keep it honest.
2. **"Attention, not skill"** framing everywhere. Never let a stat imply
   competence.
3. **Capture stays frictionless.** If logging a class gets slower, the app
   dies — nothing downstream gets data.
4. **Cold-start usefulness.** Most features need months of data; the dashboard
   must still feel alive on day one and not shout empty states.
5. **Gap prompts stay above threshold** (don't flag an empty role until a
   sibling has ≥3 entries — below that it's noise).
6. **Blue accent, amber only for gaps.** No orange rebrand.
7. **No build step, no deps, no innerHTML, self-hosted assets.**

---

## 9. Freedom / where redesign is welcome

- Overall layout, spacing, hierarchy, and the *feel* of every screen.
- The dashboard composition (which panels, what order, how the hero reads).
- The Map's decorative radar (currently just a backdrop — could become
  something more meaningful, as long as the honest bars stay).
- Typography scale, card styling, motion, empty states, the flashcard deck.
- Iconography (though new icons must be inline SVG, no icon-font/CDN).

If proposing new colours, note the constraint: blue is the brand, amber means
"gap," and both light and dark themes must be supported via CSS variables.
