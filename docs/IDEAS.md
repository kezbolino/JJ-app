# Ideas from outside BJJ — a second survey

Written 2026-09-21 against v71, at the user's request: *"research other learning
apps, maybe apps that are Fitness but not bjj related and see what I can add as
a feature."*

**This is deliberately not `docs/ENHANCEMENTS.md` again.** That one was written
in July 2026 against v16, drew on BJJ logs, Strong/Hevy/Strava/Streaks and
Obsidian/Day One/Anki, and all ten of its items shipped in v17 (two since rolled
back). This survey goes somewhere else on purpose: **skill-learning apps**
(chess repertoire trainers, Duolingo, Readwise) and **fitness apps that are not
grappling** (climbing, load monitoring). The neighbourhoods that were already
mined are not mined again.

## The filter

Nothing goes in this list unless it survives all of:

- **No build step, no dependencies, no framework.** Plain ES modules.
- **Offline first.** v53 was an entire version about the app working on a train.
  A feature that needs a network is a feature that is absent on a train.
- **Attention, never skill.** The app reports what has been *written about*. It
  does not report how good you are, and it does not diagnose.
- **Capture friction is the whole product.** Nothing may make logging a class
  slower.
- **Not already built, and not already removed on purpose.** The round timer
  (v18), spaced repetition on the deck (v20), rounds and how-it-went (v21) and
  session types (v22) were each taken out at the user's request. They are not
  ideas, they are decisions.

Ordered by value to *this* app, not by effort or by how good the source app is.

---

## 1. Daily resurfacing — your own old notes, one at a time

**Where it comes from.** Readwise's Daily Review: it holds everything you have
ever highlighted and shows you a small handful each day, weighted so older
material appears less often, because the alternative is a library you never
reopen.

**What it would be here.** Home shows one old line from your own journal — a
`Key thoughts & adjustments` from a class four months ago, with a link to the
entry. Nothing else.

**Why it fits this app specifically.** JJ-app's whole premise in `VISION.md` is
that *"the user's knowledge should become more valuable the longer they use
it"*, and today the only entry the app ever puts in front of you is the most
recent one. Everything else is reachable only by deciding to go and search for
it, which is exactly the thing nobody does. There is a year of notes in there
and the app has never once volunteered any of it.

**This is not spaced repetition coming back.** v20 removed SM-2 because
removing the Again/Good/Easy rating left the scheduler with no input, and a
half-removed feature is worse than either state. Resurfacing has **no grading,
no scheduler and no per-item state** — it is a weighted random draw over
`allEntries()`, computed fresh each day and stored nowhere. If it ever grows a
"got it / show me again" button it has become the thing that was deleted, and
that is the line.

**Cost.** One pure function (pick an entry given today's date and the entry
list, deterministic so it does not change as you re-render), one card on Home.
No new storage, no sync change, no model change.

---

## 2. Repertoire versus reality — what you say you're working on, against what you actually write about

**Where it comes from.** Chess opening trainers. The good ones (Chessbook, and
ChessAtlas paired with Lichess studies) do one thing Lichess itself does not:
they **read your actual games back against your stated repertoire** and tell you
where the two have come apart. Lichess has no deviation detection at all, which
is why third-party tools exist for it.

**What it would be here.** The app already holds both halves and has never put
them next to each other:

- what you *say* you are working on — the focus deck (v0.2, now with priority
  and archive flags, v60) and `likedMoves` (v7, "your game")
- what you *actually wrote about* — every tag on every entry

So: *"Butterfly sweep is starred and hasn't appeared in a note since June."*
Or the other way round, which is more interesting: *"You've written about
leg entanglements in 9 of your last 12 classes and none of your cards mention
them."*

**This is the knowledge graph finally doing something.** `VISION.md` promises
the app will answer "what have I been working on recently" and "how has my game
evolved" — the Map's drift section (v45) answers the second, and nothing has
ever answered the first against your own stated intentions.

**Where the line is, and it is a real one.** This must phrase everything as
attention, not neglect-with-consequences. *"Not written about since June"* is a
fact. *"You're neglecting your butterfly guard"* is a coaching claim the app has
no standing to make, and it is the exact slide CLAUDE.md warns about.

**Cost.** Pure, testable, node-only: two arrays in, a list of observations out.
Renders as a card on the Map next to "Your game". No new data of any kind.

---

## 3. Week-to-week variability — stated, never diagnosed

**Where it comes from.** Every serious endurance and team-sport app shows a
training-load number, usually some form of acute:chronic workload ratio.

**And the research is why this is the version to build rather than that one.**
A 2026 multilevel meta-analysis is blunt about ACWR: the observational evidence
**cannot establish** that an elevated ratio causes injury or that lowering it
reduces risk, partly because a niggle makes you train less *before* the injury
is diagnosed, so the ratio partly reflects an injury already under way rather
than causing one. What the same literature does support is duller and more
useful: **week-to-week variability** in session load predicted injury better
than absolute weekly load did.

**What it would be here.** One line, on Home or the Map: *"This week: 5
sessions. Your eight-week average is 3."* That is all. No score, no zone, no
colour, no ratio, no "you are in the danger band".

**v35 already declined the climbing-load flag** on the grounds that flagging a
climbing total is a claim about injury risk and this app never diagnoses. That
decision stands and this does not reopen it — a count against an average is a
statement about what you did. The moment it grows a threshold it has become the
flag that was declined.

**Cost.** `store.weekLoad()` already exists and counts classes and lifts for
the current week (v35), with a comment at the top calling itself *"the honest
version of a load metric: it counts sessions, which is a fact, and says nothing
about intensity, which it cannot know."* This is that same computation over a
trailing window — plus mobility sessions, which it does not currently take and
which have been stored since v40. Pure, tested in node, no new storage.

---

## 4. A weekly review

**Where it comes from.** Every reflective-practice tool has one, and Duolingo's
whole retention engine is a small daily ritual rather than a big one.

**But it is really owed from inside this repo.** `VISION.md` names a weekly or
monthly review and it was never built; `ENHANCEMENTS.md`'s runners-up say
explicitly that this is arguably where the Trends work should have landed rather
than as a standalone Map section.

**What it would be here.** One screen, reachable on demand, showing the week
just gone: sessions, what you tagged, the gap the coverage map is pointing at,
and the one thing you wrote in `Key thoughts` that you have not written since.
It ends on a single prompt — one text field, saved as an entry.

**The thing to get right.** It must be **pull, not push**. The log nudge was
removed whole in v62; a weekly review that chases you is that nudge wearing a
hat. A card that sits on Home on a Sunday and says "review last week" and does
nothing if ignored is a different thing.

---

## 5. Turn a coverage gap into a question for the coach

**Where it comes from.** The assessment-driven climbing apps (Lattice,
Crimpd) turn a measured weakness into a prescribed session. That whole shape is
wrong for this app — it needs self-assessment scores, and the self-report was
removed in v21 — but the *last mile* of it transfers: a weakness that produces
no action is a chart.

**What it would be here.** The Map already computes gaps ("you've written a lot
about half guard sweeps — how's your half guard passing?"). Add one line under
it: **"Ask about this next class"**, which drops the phrase into your next log
entry's `What we drilled` placeholder, or simply onto the focus deck as a new
card with one tap.

**Cost.** Very small — it reuses the existing gap computation and the existing
deck write. The value is that the app's most-designed feature currently ends in
a sentence and not in anything you can do.

---

## 6. First-appearance and "how long you've been on this"

**Where it comes from.** Climbing logbooks' pyramid views, and Strava's "since
you started" framing.

**What it would be here.** On a position or technique page: *"First written
about 4 March. 11 entries since. Last one 9 days ago."* The app knows all three
numbers and shows none of them.

**Honest by construction** — every one of those is a date on an entry you wrote.
It is the cheapest thing on this list and it partly overlaps the Map's drift
strips (v45), which is why it is at 6 and not higher.

---

## 7. A niggle log — flagged as the user's call, not proposed

**Where it comes from.** Rehab and physio adherence apps, and the body-map
input that most serious lifting apps now carry.

**Why it is here at all.** `docs/STRENGTH.md` records that muting a movement is
a plain toggle *"since the app tracks no injuries"* — so the absence is
deliberate and already noted. And v49's whole rest-timing argument turns on not
under-recovering.

**Why it is not a recommendation.** It is the same shape as two things already
rejected: the 1–5 "how it went" (removed v21) and the `coach` field (removed
2026-07-28, don't reintroduce unasked). It is also the one item on this list
where the app would be storing something that looks medical, and this repo's
standing rule is that it reports and never diagnoses.

**If it is ever wanted**, the honest version is a note, not a score: a line on
an entry, searchable, with no aggregation, no chart, and nothing that ever
relates it to training volume.

---

## Considered and rejected, with the reason

- **Streak freeze / streak repair** (Duolingo). The week-streak already solves
  the problem it exists for: JJ-app counts *weeks trained*, not consecutive
  days, chosen in v17 precisely because a day streak breaks every week in this
  sport and punishes rest. A freeze protects a streak that cannot break that
  way.
- **Daily goals, XP, gems, energy** (Duolingo). Duolingo's own free tier moved
  to an energy system that depletes on every exercise whether you are right or
  wrong — a retention mechanic, not a learning one. This app has one user and
  nothing to retain them against.
- **"Review your mistakes"** (Duolingo's mistake list, chess deviation
  detection). Both source apps have a machine-readable record of what you got
  wrong. BJJ has no such record — inferring one from note text means a model
  deciding what counts as a mistake, which puts fiction in the coverage map.
  §2 is the version of this idea that runs on data the app actually has.
- **Assessment → prescribed programme** (Lattice, Crimpd). Needs self-reported
  or measured scores; the self-report was removed in v21 and this app has no
  sensor.
- **A readiness score.** Composite 0–100 readiness numbers are common in
  wearables and the scientific basis for most of them is opaque. This app has
  no HRV, no sleep and no RPE, so it would be a number computed from nothing.
- **Grade-pyramid style difficulty distribution** (8a, Vertical Life). BJJ
  sessions have no grade, and the nearest analogue — the position × role
  heatmap — is already built and is the one thing CLAUDE.md says must survive
  any refactor.
- **AI explanation of your notes.** Already spitballed and parked at the user's
  request; see the parked section in CLAUDE.md, which has the costs and the
  three objections.
- **Video on a card.** Already spitballed and parked; same place.

---

## If only three get built

**§2 repertoire versus reality** — it is the one idea here that only this app
could have, it runs entirely on data already stored, and it is the first thing
that would make the deck and the coverage map talk to each other.

**§1 daily resurfacing** — the cheapest real answer to "a year of notes you
never reopen", and the only item on the list that makes the app worth opening on
a day you did not train.

**§3 week-to-week variability** — one line, no new data, and it is the honest
half of a feature every fitness app gets wrong.

---

**Nothing here is built.** No code changed in this commit; `CACHE` and `VERSION`
stay where they are.

## Sources

- [ACWR meta-analysis and its limits (PMC, 2026)](https://pmc.ncbi.nlm.nih.gov/articles/PMC13520966/)
- [Acute:Chronic Workload Ratio — conceptual issues](https://www.scienceforsport.com/acutechronic-workload-ratio/)
- [Best chess opening trainers compared, 2026 (Dark Squares)](https://darksquares.net/blog/chess-training-apps/best-chess-opening-trainers-2026-compared)
- [Building a chess opening repertoire that sticks (ChessAtlas)](https://chessatlas.net/blog/opening-repertoire-building/how-to-build-a-chess-opening-repertoire-that-actually-sticks-2026-guide)
- [Readwise — reviewing your highlights](https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights)
- [Readwise — adding intention to spaced repetition](https://blog.readwise.io/adding-intention-to-spaced-repetition/)
- [Crimpd](https://www.crimpd.com/) and [Lattice Training](https://latticetraining.com/)
- [Crimpd vs Lattice vs Sequence, 2026](https://fitnessaitrends.com/blog/crimpd-vs-lattice-vs-sequence-climbing-training-app/)
- [Duolingo streak system breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Duolingo review 2026 — mistakes review, energy system](https://languageappguide.com/app-reviews/duolingo-review/)
