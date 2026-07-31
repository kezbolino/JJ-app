# Audit — JJ-app v16

Reviewed 2026-07-31 against `main` at v16. Whole codebase read (5,117 lines
across `js/`, `css/`, `sw.js`, `tests/`), all five suites run, three findings
reproduced in a real browser.

**Suite status: green.** 13 markdown + 9 tagger + 7 moves + 14 smoke + 10 sync
= 53 passing, no page errors.

**What's already sound** — worth saying, because it shapes what not to touch.
The position × role model holds all the way through (`coverage` → `findGaps` →
heatmap → rails) and nothing in the app claims skill from note volume. Sync's
three traps (`putEntryRaw`, tombstones, the fixed front-matter grammar) are all
respected in the code and covered by tests. Every anchor that carries block
children now sets `display` — the v11 class of bug is closed. `h()` never
touches `innerHTML`. No secrets in the repo.

Ten solutions follow, ordered by what they cost the user, not by effort.

> **Status:** §1 (render token), §2 (local dates), §3 (import guard) and §10
> (manifest) were **fixed in v17**. §4–§9 are still open, and the "suggested
> order" at the foot of this document still applies to them.

---

## 1. A stale re-render destroys whatever screen you're on — including a
## half-written class

**Severity: high. Reproduced.**

`js/views/home.js` fires a quiet daily auto-sync and then re-renders:

```js
runSync(null, { quiet: true }).then(ok => {
  if (ok) { clear(root); home(root); }        // root IS #view, always
});
```

`root` is the single `#view` element the router renders every screen into.
Nothing checks whether the user is still on Home when the promise lands. The
sync button does the same thing.

Repro (fake GitHub, 1.2 s per call — a phone on gym wifi is slower): open the
app, tap **Log a class**, type into the form. When the in-flight sync settles,
the form is wiped and replaced by Home while the URL still reads `#/log`:

```
typed. hash = #/log
after sync settled: { hash: '#/log', textareas: 0, text: null, heading: 'JJ' }
>>> CLOBBERED: the typed entry was destroyed mid-edit
```

This fires on the exact path the app is built around: open it after training,
go straight to Log. It is a first-run-of-the-day bug, so the auto-sync gate
(`lastSyncAt` older than today) makes it *more* likely, not less.

**Solution.** A render generation token in `js/app.js`, incremented on every
`route()`. Every async continuation checks it before touching the DOM:

```js
export let renderId = 0;
// in route(): renderId++;
```

```js
const mine = app.renderId;
runSync(null, { quiet: true }).then(ok => {
  if (ok && app.renderId === mine) { clear(root); home(root); }
});
```

One token kills the whole class of bug — `library()`, `map()`, `position()` and
`focus()` all re-render themselves from async handlers too. Worth pairing with
a draft autosave on the Log form (stash `entry` in sessionStorage on input,
restore on mount), which also covers the tab bar, the back button and a
mid-entry PWA kill.

---

## 2. The default log date is wrong for most of the world's evenings

**Severity: high. Confirmed.**

```js
export const todayISO = () => new Date().toISOString().slice(0, 10);
```

`toISOString()` is UTC. Verified:

| Local moment | `todayISO()` |
|---|---|
| Thu 30 Jul, **7:30pm Los Angeles** | `2026-07-31` ❌ |
| Thu 30 Jul, **8:00am Sydney** | `2026-07-29` ❌ |

Evening training west of UTC gets filed on **tomorrow**; morning training east
of UTC on **yesterday**. Nothing warns you — the date field just shows the wrong
day, and it propagates into the markdown filename (`pathFor` uses `entry.date`),
the "This week" count, and every coverage query. `daysAgo()` in `store.js` has
the same UTC basis, so the 7- and 30-day windows can be a day out too.

**Solution.** Local date components, not UTC:

```js
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
```

Same for `daysAgo`. Add a test that runs under `TZ=America/Los_Angeles` with a
faked clock — this is exactly the bug that never shows up on a CI box pinned to
UTC.

---

## 3. Importing your own backup can silently break sync

**Severity: high.**

`js/backup.js`:

```js
for (const setting of data.settings ?? []) await db.put('settings', setting);
```

Entries merge carefully by `updatedAt`. Settings are written unconditionally —
including four keys that are **device-local bookkeeping, not data**:

- `sync` — repo, branch and **token**, replaced by the other device's
- `syncState` — `{commit, paths, indexHash}`, i.e. what *that* device last pushed
- `tombstones` — pending deletions belonging to that device
- `lastSyncAt`

A stale `syncState` is the dangerous one. `push()` trusts `state.paths` to decide
what the repo holds; import someone else's and the local device believes files
are already backed up that aren't, and `gone` is computed against the wrong set.
Notes stop reaching the repo with no error and no pending dot.

CLAUDE.md records that the July attendance backfill was hand-built **without** a
`settings` key precisely to dodge this. That instinct was right; the guard
belongs in the code, not in each file.

**Solution.** Skip the device-local keys on import:

```js
const DEVICE_LOCAL = new Set(['sync', 'syncState', 'tombstones', 'lastSyncAt']);
for (const s of data.settings ?? []) {
  if (DEVICE_LOCAL.has(s.key)) continue;
  await db.put('settings', s);
}
```

`focuses`, `likedMoves` and `ontologyOverrides` still travel, which is what you
actually want from a restore.

---

## 4. A tombstone can ask GitHub to delete a file that is already gone

**Severity: medium — hardening. Not reproducible against the fake GitHub;
unverified against real GitHub.**

`push()` builds its delete list from tombstone paths without checking the remote
tree:

```js
for (const path of gone) tree.push({ path, mode: '100644', type: 'blob', sha: null });
```

Delete the same note on two devices (or delete one another device already
removed) and the second push sends `sha: null` for a path the base tree no
longer contains. `tests/fake-github.mjs` accepts this — I ran the two-device
double-delete and it committed cleanly — but the fake is permissive by design
and real GitHub's Git Data API is stricter about deleting an absent path.

The blast radius is what makes it worth fixing on suspicion: **tombstones are
only cleared after a successful push**, so a rejected commit doesn't just fail
once — it re-sends the same bad delete on every subsequent sync. One transient
error becomes permanently wedged backup.

**Solution.** `pull()` already fetches the remote tree; thread it into `push()`
and intersect before building the delete entries. Drop tombstones whose file is
already absent — they've done their job. Add a fake-GitHub case that 422s on
deleting an unknown path, so the test suite would actually catch this.

---

## 5. A failing sync is invisible

**Severity: medium.**

The daily auto-sync swallows everything:

```js
} catch (err) {
  if (!quiet) toast(`Sync failed — ${err.message}`);
  return false;
}
```

`quiet` is true on the automatic path. A fine-grained PAT expires (GitHub caps
them at a year, and they can be revoked sooner), and from then on nothing backs
up. The only signal is the amber pending dot, which also means the ordinary
"you wrote something since the last sync", so it's the cue the user is most
trained to ignore. Settings shows `Last sync: never` / a stale timestamp, but
Settings is the screen they already struggled to find (v16 added the gear for
exactly that reason).

**Solution.** Persist `lastSyncError` alongside `lastSyncAt`. When the last
attempt failed, or the last *success* is older than ~7 days, turn the Home cloud
button amber and show a one-line banner: *"Not backed up since 24 Jul — check
sync settings."* Amber's remit is already "gap / waiting on you"; this is the
same job. Everything needed is in `store.pendingSync` and `sync.getLastSync()`.

---

## 6. Nothing in the app looks at time

**Severity: medium — the largest gap against the premise.**

`docs/VISION.md` is about surfacing patterns in your game **over years**. Every
number the app shows is all-time or a fixed recent window: `countClasses` gives
week / 30 days / total, `coverage` and `findGaps` are all-time, the heatmap is
all-time. There is no month-over-month anything. Two years in, a user who has
completely rebuilt their game around leg entanglements will see a heatmap still
dominated by the closed guard they drilled in year one — attention accumulates
and never decays.

**Solution.** A **Trends** section on Map:

- **Classes per month** — one `tally()` row per month, reusing the existing
  component so the honesty of discrete countable cells carries over.
- **Attention drift** — for the top 5 positions, a small-multiples strip of
  monthly counts. Half guard fading as leglocks arrive is *the* pattern this app
  exists to notice, and it is currently invisible.
- Optionally a **rolling 90-day** toggle on the heatmap: same chart, recent
  window, so gaps reflect what you're neglecting *now*.

Same discipline as everywhere else: this is attention over time, never skill
over time. Pure additions to `store.js` (group by `date.slice(0, 7)`), no model
change.

---

## 7. Logging a class on a date you already logged is still silent

**Severity: medium.**

The v7 session fixed the *discoverability* half of the "editing logged a new
entry" report by adding an Edit cue to the Home last-session card. The other
half is untouched: tap **Log a class** on a day already logged and you get a
second entry for that date, with no cue at all. Two entries for one class
double-count in `countClasses` and in `coverage`.

Same hazard on the import path — the backfill's deterministic ids dedupe against
themselves, but not against a class the user logged by hand on the same date.

**Solution.** In `js/views/log.js`, when `id` is absent and the selected date
already has a `type === 'class'` entry, show a non-blocking line above the
fields: *"You already logged a class on Thu 30 Jul — open it?"* with a link to
`#/log/<id>`. Re-check on date change. Doesn't block a genuine two-sessions-in-
a-day, doesn't add a modal, and costs one `allEntries()` lookup the view already
performs.

---

## 8. Library renders every entry that has ever existed

**Severity: low now, certain later.**

`js/views/library.js` builds the "Everything" card from the unbounded list:

```js
everything.append(card(`Everything · ${entries.length}`,
  entries.length ? entries.map(e => h('a.entry', ...)) : empty(...)));
```

Each row is 3–8 nodes with tag chips. At today's ~40 entries that's nothing. At
three classes a week it's ~1,500 entries in ten years — several thousand nodes
built synchronously on every Library visit, and again on every fast-capture save
(`reload()` re-renders the whole view). On a phone this becomes a visible stall,
on the tab the user reaches for most after Home.

**Solution.** Cap the initial render at 50 with a **Show more** that appends the
next 50, and add type + month filters above the list. `allEntries()` is already
sorted newest-first, so this is a `slice`. Same shape as the existing typed
sections, no new concepts.

---

## 9. Search doesn't know about the structure the app built

**Severity: low.**

`store.search` matches raw text plus **position** labels only:

```js
const label = t.kind === 'concept' ? t.concept : POSITION_BY_ID[t.position]?.label ?? '';
```

Technique labels are never searched. Usually harmless — the tag came from the
text, so the word is in the body anyway. It fails exactly where the override
system is designed to help: teach the app that your gym's *"the shoulder thing"*
means Kimura, write that phrase in your notes, then search "kimura" and find
nothing. The app knows the entry is about a Kimura. It just won't say so.

Manually-added tags (the "Add a tag by hand" picker) have the same blind spot.

**Solution.** Include the technique and role label in the haystack — `tagLabel()`
in `js/ui.js` already resolves both, so it's a one-line change to reuse it. While
there: when a query resolves to a known position or technique, offer a jump —
*"Open Half Guard →"* — above the results.

---

## 10. The PWA splash is still dark-only, three versions after light became the
## default

**Severity: low, but it's the first thing seen on every cold launch.**

`manifest.webmanifest`:

```json
"background_color": "#0d0f14",
"theme_color": "#11131a",
```

Both dark. v13 made **light the default** with dark following the OS. `index.html`
got that pass — it carries media-scoped `theme-color` for both schemes — but the
manifest didn't. On a light phone, the installed PWA shows a near-black splash
and then paints `--bg: #f5f7fc`. A dark flash on every cold start of an app whose
default is light.

The manifest can't do media queries, so it has to pick one: pick the default.

**Solution.** `background_color: "#f5f7fc"` to match `--bg` in light, and a
`theme_color` from the light palette. `index.html` keeps handling the live chrome
correctly per scheme. Ships with the next `CACHE` / `VERSION` bump —
`manifest.webmanifest` is already in `SHELL`, so it needs the bump to reach
installed devices.

---

## Also noted, not in the ten

- **`js/db.js` header is stale** — it says sync "is not built yet" and points at
  `docs/OPEN-QUESTIONS.md` §13 as open. §13 was closed on 2026-07-27; sync
  shipped. Misleading to the next reader.
- **`fetchTitle()` has no timeout.** `addVideoForm.save()` awaits it before
  saving, so a captive-portal gym wifi (connects, never responds) hangs the save
  indefinitely rather than falling back to the typed title. `AbortSignal.timeout(4000)`
  or an `navigator.onLine` short-circuit.
- **No `beforeunload` guard on the Log form.** Covered in practice by the draft
  autosave suggested in §1.
- **Sync is whole-entry last-write-wins.** Edit the same note on two devices and
  the older edit vanishes with no notice. Correct for one user with two devices,
  and the tests cover the merge; worth knowing it's a deliberate limit rather
  than an oversight.
- **`touched.add(local.find(...)?.id)` in `pull()`** can insert `undefined` into
  the set. Harmless today, but it means "a blob we know" and "an entry we have"
  are silently allowed to disagree.

---

## Suggested order

**Ship first (all bugs, all small):** §1 render token, §2 local dates, §3 import
guard, §10 manifest. Together they're maybe 40 lines and one `CACHE` bump.

**Then:** §5 sync failure surfacing and §4 tombstone hardening — both protect
the backup, which is the thing there's no undo for.

**Then, as product work:** §7 duplicate-day cue, §9 search labels, §8 Library
pagination, and finally §6 Trends, which is the biggest and the one that most
needs a design conversation first.
