# Open questions — BJJ Brain

Unresolved decisions that block or reshape the build. Raised 2026-07-27 against
`docs/VISION.md` v1. Answer these in here as they get settled; don't let them
live in a chat window.

---

## 1. The MVP is not an MVP

`VISION.md` labels ten features as MVP, then adds the knowledge graph, personal
wiki, game profile, two radar charts, timeline, AI insights, recommendations,
knowledge-gap detection, weekly theme, monthly review and annual wrapped. That
is a multi-year roadmap wearing an MVP badge.

**Question:** what is the smallest version you would personally use every single
training night for a month?

Working hypothesis: features 1, 5 and 6 (journal, notes, voice capture) plus
search. Everything else is derived from that data and can be added later without
migration pain — *if* the data model is right from the start.

---

## 2. Cold start is the existential risk

Nearly every feature that makes this special — pentagon, wrapped, insights,
knowledge gaps, game DNA, timeline — needs months of accumulated data. On day 1
the app is an empty notes app with worse UX than Apple Notes. On day 30 it is a
thin one.

Spotify Wrapped works because listening data is a *byproduct* of the core loop.
Here, logging **is** the work. There is no byproduct.

**Question:** what makes this worth opening in week one, before the graph has
anything in it?

---

## 3. Retention depends on typing while exhausted

You train, you are wrecked, you drive home. The app only works if you log
anyway. This is where training-log apps die.

That makes **voice capture (feature 6) the single most load-bearing feature in
the product**, and it is currently listed sixth. If capture takes more than ~30
seconds of effort, the data never accumulates and nothing downstream exists.

**Position:** voice capture is not a nice-to-have, it is the core loop.

---

## 4. The "Evidence" pentagon overlay measures the wrong thing

The pentagon proposes Confidence ("what I think I'm good at") vs Evidence
("what my training history suggests"), and sells the gap between them as the
insight.

But training history only contains **what you wrote down**, which tracks what
you are *interested in*, not what you are *good at*. Studying escapes heavily
could mean you are terrible at escapes or obsessed with them — the data cannot
distinguish these. Meanwhile the Learning Pentagon explicitly measures study
time. So both radars measure attention, while one is labelled competence.

**Question:** where does genuine competence signal come from? Candidates: rolling
outcomes logged per position, self-rating per session, competition results,
training partner feedback. Without one of these, "Evidence" should be renamed to
what it actually is (Attention / Volume) rather than implying skill.

---

## 5. Auto-tagging is the make-or-break technical bet

"Each entry is automatically tagged" carries the whole knowledge graph. BJJ
vocabulary is large, inconsistent and regional — knee slice / knee cut / knee
slide are one technique; dogfight and wrestle-up overlap; every gym has its own
names.

If tagging is 80% accurate, the graph is 20% wrong, and every insight built on
top inherits that error compounded.

**Question:** do we adopt or build a canonical technique ontology (positions →
techniques → concepts, with synonyms) before writing the tagger? Probably yes.
This is likely the first real engineering task.

---

## 6. Why not just an Obsidian vault?

Obsidian already provides markdown notes, backlinks, graph view, search, mobile
apps, offline-first and a plugin API. That is a large fraction of the vision,
free, today.

**Question:** is the honest answer "the AI layer, the radar charts and the
wrapped"? If so, is this an app at all, or a set of Obsidian plugins plus a
local analysis tool? Building it standalone means re-implementing editor, sync,
search and mobile — years of work Obsidian already did.

Deciding to build standalone anyway is legitimate. Deciding it *by default*,
without answering this, is not.

---

## 7. Personal tool or product?

`VISION.md` is written in product language ("Users maintain..."), but the actual
user base today is one person. This changes auth, multi-tenancy, data model,
hosting and cost.

**Question:** single-user local-first tool (like Distill), or multi-user product?

---

## 8. Private repo vs mobile-first

Design principles say mobile-first and offline-first. The repo is **private**,
and free GitHub Pages does not serve private repos.

**Question:** if this needs to be on your phone at the gym, how does it get
there? Options: flip the repo public (like `social-media-app`), host elsewhere
(Vercel/Netlify/Cloudflare serve private repos on free tiers), or keep it a
laptop tool for now.

---

## 9. AI cost and privacy

Voice transcription plus tagging plus periodic insight generation is a recurring
per-user cost, and journals contain gym politics, injuries, and named training
partners.

**Note:** Distill already routes everything through a single `LLMProvider`
interface with a keyless mock provider. That abstraction is worth reusing here
rather than reinventing — see `kezbolino/distill`.

---

## 10. Weekly theme and move of the week are content problems

Both need either ongoing curation labour or an AI good enough to pick well. They
look like features but behave like a subscription to your own time.

---

## 11. Naming

The product is **BJJ Brain**. The repo is `JJ-app`.

Two projects in the hub already suffer name drift (Wingman / Street Food Post /
`social-media-app`). Renaming a GitHub repo is free right now — one commit, no
clones, no deploys, no links. It will not stay free.

**Recommendation:** rename the repo to `bjj-brain` before any code lands.
