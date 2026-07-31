# Enhancements — what comparable apps do that JJ-app doesn't

Written 2026-07-31 against v16, as a companion to `docs/AUDIT.md`. The audit was
about what is broken. This is about what is absent.

Drawn from three neighbourhoods: **BJJ training logs** (BJJ Buddy, Marune,
Grapplers Guide, the various mat-log apps), **habit and fitness trackers**
(Strong, Hevy, Strava, Streaks), and **personal knowledge tools** (Obsidian,
Day One, Anki). Every idea below is filtered against this repo's actual
constraints — no build step, no dependencies, offline-first, Android/Chrome on a
de-Googled phone — and against the two rules that outrank features: **attention,
never skill**, and **capture friction is the whole product**.

Ordered by value to this app, not by effort. Nothing here is a bug; nothing here
should be built before `docs/AUDIT.md` §1–3.

---

## 1. A round timer

**Everyone else has one.** It is close to universal in BJJ apps, and it's the
one feature people open a second app for. 5-minute rounds, 1-minute rest, an
audible beep, keeps running with the screen off.

**JJ-app has:** nothing. `grep -i timer` finds only a debounce in `log.js`.

**Shape here.** A `#/timer` route: rounds, work, rest, a big start button. Sound
via `AudioContext` (an oscillator burst — no audio file to cache, no asset), and
`navigator.wakeLock` to keep the screen alive. Pure JS, zero dependencies, works
offline, no data model change. It would be the first thing in the app that is
useful *during* training rather than after it — which is worth something on its
own, because the app currently gives you no reason to open it on the mat.

**Watch:** a background timer in a PWA is unreliable if the tab is truly
suspended. Compute elapsed time from a start timestamp rather than counting
`setInterval` ticks, so it self-corrects when the phone wakes up.

---

## 2. A training calendar and a streak

**What they do.** Strong, Hevy and every habit tracker lead with a calendar grid
and a current streak. GitHub's contribution graph is the visual everyone already
knows how to read.

**JJ-app has:** `countClasses` → this week / last 30 days / total. Three numbers,
no shape. There is no way to see *when* you trained, or that you dropped off for
three weeks in May.

**Shape here.** A month grid on Home or Map: one cell per day, filled if a class
is logged, tinted by gi/no-gi. Plus current streak and longest streak. All of it
is derivable from `entry.date` — no model change, one new function in `store.js`.

This is the cheapest fix for the cold-start problem in `OPEN-QUESTIONS.md` §2: a
calendar is legible and rewarding from week one, unlike coverage, which needs
months of data to say anything.

**Watch:** streaks punish rest days, and BJJ has them for good reasons (injury,
deload, life). Count *weeks trained* rather than consecutive days, or make the
target "2+ per week" so a Tuesday/Thursday practitioner isn't shown a broken
streak every single week. And this is attendance — a fact — so it stays on the
right side of the attention/skill line without any hedging.

---

## 3. Spaced repetition on the flashcard deck

**What they do.** Anki and Duolingo schedule cards by how well you knew them;
that scheduling *is* the product. v12 already borrowed the Duolingo/Brilliant
visual language.

**JJ-app has:** a real flashcard deck (`js/views/focus.js`) — front, back, flip,
prev/next — with **no scheduler**. Every card is equally likely, forever. You
review the thing you nailed last week as often as the thing you keep forgetting.

**Shape here.** Add `{ ease, interval, due, reps }` to each focus card and a
three-button rating after the flip (*Again / Good / Easy*). SM-2 is about 25
lines of arithmetic. The deck then opens on what's due, and Home's focus banner
becomes "3 cards due" — a reason to open the app on a non-training day, which
right now it doesn't have.

**Watch:** focuses are stored as a device-local setting and **do not sync** (same
as `likedMoves`). Adding scheduling state makes that gap more annoying — you'd
review on your phone and see nothing due on desktop. Worth extending the
notes-repo format to carry both at the same time.

---

## 4. Session types beyond gi / no-gi

**What they do.** BJJ logs distinguish class, open mat, private, seminar and
**competition**, because they are different activities that deserve different
weight.

**JJ-app has:** `ENTRY_TYPES = ['class','note','question','video','principle']`
and a `gi` flag. A competition and a Tuesday fundamentals class are the same
record.

**Shape here.** A `session` field on class entries — `class | open-mat | private
| seminar | comp` — as a second segmented row next to gi/no-gi. It's one
front-matter scalar, so the markdown grammar stays boring (add the key, extend
`tests/markdown.test.mjs`). Then Map can answer a question it currently can't:
*what have you actually used in competition, versus what you drill?* That is a
genuinely different signal from note volume and it comes free with the field.

**Watch:** comp results are the one place where "what worked" is a real
observation rather than a skill claim — recording *"this submission worked in a
match"* is a fact about a match. Keep it phrased that way and it doesn't breach
the rule; let it drift into a win-rate score and it does.

---

## 5. Belt and promotion history

**What they do.** Belt and stripe tracking is table stakes in BJJ apps, usually
with "classes since your last promotion".

**JJ-app has:** the belt ranks as a *brand mark* (`BELT_RANKS` in `js/ui.js`,
sized by average years) — but it knows nothing about **your** belt. The mark is
decoration.

**Shape here.** Promotions as dated events in settings: `[{rank, date}]`. Home
then reads "Blue belt · 147 classes since 12 Mar 2025", and the brand mark can
fill to where you actually are — turning the existing device into a live
progress indicator instead of a static illustration. The calendar in §2 could
mark promotion days.

**Watch:** this is the idea most likely to slide into claiming competence. The
honest version reports two facts — the rank you were given and the classes you
have logged since. It must never estimate *time to next belt*: that is a
prediction about a decision someone else makes, and CLAUDE.md already rejected a
fabricated "mat hours" badge on the same grounds.

---

## 6. Launcher shortcuts — logging in one tap from the home screen

**What they do.** Capture-first apps put the capture action on the app icon.
Long-press Todoist or Bear and you get "New task" / "New note" straight away.

**JJ-app has:** nothing. Long-pressing the installed icon offers only the app.
Opening the app lands on Home; logging is a second tap.

**Shape here.** A `shortcuts` array in `manifest.webmanifest`:

```json
"shortcuts": [
  { "name": "Log a class", "url": "./#/log", "icons": [...] },
  { "name": "Drill flashcards", "url": "./#/focus", "icons": [...] }
]
```

Supported by Chrome on Android for installed PWAs. **Pure manifest, no JS**, and
it removes a tap from the single path CLAUDE.md says to guard above everything
else. Probably the best value-per-line in this document.

**Watch:** `manifest.webmanifest` is in `SHELL`, so it needs a `CACHE` bump to
reach the installed app — and Android sometimes only picks up new shortcuts on
reinstall.

---

## 7. A nudge to log after training

**What they do.** The retention mechanic of every habit app: a notification at
the time you usually do the thing.

**JJ-app has:** nothing. If you forget to log on the drive home, nothing ever
reminds you, and `OPEN-QUESTIONS.md` §3 names this as the retention risk.

**Shape here — and an honest platform caveat.** Real scheduled notifications need
Web Push, which on Android Chrome goes through FCM. The phone is **CalyxOS**;
Calyx ships microG, so push *may* work where it wouldn't on a fully de-Googled
build — but this needs ten minutes of checking on the actual device before any
code is written, exactly like the mic/PWA quirks in §14. It also needs a push
server, which this repo can't have (static host, public, no secrets).

The zero-infrastructure version that definitely works: **an in-app nudge**. On
open, if your usual training days have a gap ("you normally train Tue/Thu; no
Thursday logged"), Home shows a one-line prompt with a link straight to a
pre-dated log entry. No server, no permissions, no notification at all — it just
means the reminder only lands when you happen to open the app.

Middle option: a `.ics` calendar file the user imports once, with a reminder on
their training days. Their calendar app does the notifying; JJ-app stays static.

---

## 8. Links between entries, and backlinks

**What they do.** Obsidian and Roam's core move: `[[wikilinks]] `plus an
automatic "linked mentions" list. `docs/VISION.md` asks for a knowledge graph;
this is what one is actually made of.

**JJ-app has:** tags, which connect entries *to positions*. Two entries can never
reference each other. "Same problem as three weeks ago" is unsayable.

**Shape here.** Let an entry link another by id, surfaced as a "Related" list on
both ends. Capture stays frictionless if links are made from the *reading* side
— a "Link to another entry" affordance when you open an old note — rather than
adding syntax to the log form. In the markdown mirror it's a `related: [id, id]`
front-matter list, which the fixed grammar already supports (it has one inline
list, `tags`).

**Watch:** this is the one idea here with real scope. It earns its place because
it's the difference between a tagged journal and the knowledge graph the vision
is asking for — but it should follow the audit's §6 Trends work, not precede it.

---

## 9. A trash, with undo

**What they do.** Every notes app on earth. Apple Notes, Obsidian, Day One:
deleted items sit recoverable for 30 days.

**JJ-app has:** `confirm('Delete this entry? This cannot be undone.')` and then
it genuinely can't be. `deleteEntry` removes the row and writes a tombstone; the
next push deletes the file from the repo. The text still exists in the data
repo's git history, but recovering it means finding the commit on github.com — a
route the user is unlikely to take and has never been shown.

**Shape here.** Soft-delete: set `deletedAt` instead of removing the row, filter
it out of `allEntries()`, and only convert to a real tombstone-and-file-deletion
after 30 days. A "Recently deleted" section at the bottom of Library restores in
one tap. The sync machinery is untouched, because a soft-deleted entry simply
isn't in the set push looks at until it hardens.

**Watch:** `allEntries()` is the single funnel every view reads through, which is
what makes this cheap — but `pathFor` and the push path must both keep ignoring
soft-deleted rows, or a "deleted" note stays visible in the backup repo.

---

## 10. How the session actually went

**What they do.** Strong and Hevy log sets and reps; Strava and Whoop log
perceived effort. One tap, and it gives every session a second dimension to plot
against.

**JJ-app has:** three free-text fields and a gi flag. Everything downstream
counts *entries*, so a brutal two-hour session and a light technique class are
identical rows.

**Shape here.** Two optional taps at the top of the log form: **rounds rolled**
(a number) and **how it went** (a 1–5 self-report). Both nullable, both skippable,
neither blocking the save. That unlocks honest questions the app can't currently
ask — *your no-gi sessions rate consistently lower than your gi ones*, or
*rolling volume dropped every week this month* — and it pairs naturally with the
Trends work in the audit's §6.

**Watch:** the framing has to stay first-person. "How it went" is a self-report
about a session, which is a fact about what you wrote; the moment it becomes a
performance average shown as a score, the app is claiming competence and the rule
is broken. Rounds rolled is safe — it's a count, like class attendance. The
self-report is the part to design carefully or leave out.

---

## Runners-up

Real features in comparable apps, deliberately not in the ten:

- **Training partner tracking.** A staple of BJJ logs ("rolled with Steve, got
  passed"). Flagged because it sits in direct tension with a decision already
  made: the `coach` field was removed on 2026-07-28 at the user's request, and
  CLAUDE.md says don't reintroduce it unasked. Partners aren't coaches, but it's
  the same shape of data and the same privacy question — the user's call, not a
  default.
- **Photos and video clips on an entry.** Standard in journalling apps, and
  genuinely useful for positions. Costed and set aside: the backup is markdown
  in a git repo, so binaries mean either base64 bloat in the note files or a
  second storage story, and either way it breaks "small files, no deps".
- **Goals with a target** ("12 classes this month", progress ring). Fine and
  honest, but §2's calendar delivers most of the same motivation with less
  machinery.
- **"On this day"** resurfacing (Day One). Cheap and pleasant, but it needs a
  year of data before it does anything.
- **Multi-gym / drop-in tracking** for travel. Niche until it isn't.
- **A weekly or monthly review ritual.** Named in `VISION.md`, never built. It
  is arguably where the audit's §6 Trends work should land rather than a
  standalone feature.

---

## If only three get built

**§6 launcher shortcuts** (an afternoon, pure manifest, protects capture),
**§2 calendar and streak** (the best answer to cold start, all derivable from
data already held), and **§3 spaced repetition** (the deck is already built —
this is a scheduler bolted onto finished UI, and it gives the app its first real
reason to be opened on a rest day).
