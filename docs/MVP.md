# MVP — the first slice

Defined 2026-07-27 from how kezbolino actually intends to use the app. This
supersedes the "10 MVP features" list in `VISION.md`, which was a roadmap rather
than a first build.

---

## The loop

```text
Go to class  →  write what we did  →  it gets tagged  →  it lands on a
technique page alongside videos and past notes  →  dashboard shows where
you are  →  coverage gaps suggest what to look at next
```

Everything else in `VISION.md` is downstream of this loop and can wait.

---

## In scope

### 1. Dashboard — the front door

The screen you open by default. Three things:

| Panel | Source | Notes |
|---|---|---|
| **Classes attended** | derived from journal entries | count this week / month / all time |
| **What you should focus on this week** | user-set focus, later suggested | small number of active focuses |
| **What we're learning in class** | ⚠️ external — see open question | gym's current curriculum / theme |

The third panel is the only one the app cannot derive from your own data. How it
gets in is unresolved — see `OPEN-QUESTIONS.md` §12.

### 2. Class journal (capture)

Free text with light structure — date, coach, techniques, rolling notes,
personal thoughts. Must be fast. Capture friction is the product.

### 3. Tagging

Entries get tagged against a canonical ontology. Tags are what connect
everything; without them there is no knowledge base, no dashboard insight and no
coverage map.

Manual tagging is acceptable for v1. Auto-tagging is an enhancement, not a
prerequisite — it can be added once real entries exist to test against.

### 4. Technique pages (the knowledge base)

One page per position / technique, assembled automatically from tags:

- journal entries mentioning it
- personal notes
- YouTube links
- related techniques

### 5. YouTube links

Paste a URL → title, thumbnail, channel, duration → user tags it → it appears on
the relevant technique pages. No transcript work, no AI, no downloads.

### 6. Search

Across everything. Has to be good; it's the fallback for whenever the structure
fails.

---

## Explicitly deferred

| Feature | Why deferred |
|---|---|
| **Annual wrapped** | User's own call — nice-to-have, not a reason to open the app |
| Voice capture | High value, but adds transcription + AI before we know the data model holds |
| Rolling video analysis | Future |
| Game chains / decision trees | Future |
| Monthly review | Needs months of data |
| Weekly theme, move of the week | Content problems, not software problems |
| Timeline scrubbing | Needs a year of data to be interesting |

---

## The coverage engine (v1.5, first real payoff)

Not in the first build, but the data model must support it from day one.

### The insight, restated honestly

Old framing: *"Evidence radar shows what you're actually good at."* — unsupported
by the data.

New framing: **coverage asymmetry**. Within a position, compare how much
attention each *role* has received. Report the imbalance; suggest, don't judge.

> "You've written a lot about half guard sweeps. How's your half guard passing?
> Try these."

This is a fact about your notes, not a claim about your skill. It cannot be
wrong the way a competence score can.

### What this implies for the ontology

A flat tag list can't express it. Coverage needs **position × role**:

- **Position:** half guard, closed guard, side control, mount, back, standing…
- **Role / intent:** play it (bottom), pass it (top), escape it, submit from it,
  retain it, take it down…

Your coverage map is then a matrix, and a gap is an empty cell next to a full
one. Half guard with 14 bottom-sweep entries and 0 passing entries is a visible
hole.

**This is the single most important design decision in the MVP.** Get
position × role into the data model now; retrofitting it later means
re-tagging every entry ever written.

### What it powers

Pentagon graph, knowledge gaps and recommendations are all the same computation
over this matrix. Build the matrix once.

---

## Success test

If, after a month of classes, opening the dashboard tells you something you
didn't already know and would act on — it works. If it's just a diary with
extra steps, the coverage model is wrong, not the idea.
