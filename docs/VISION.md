# BJJ Brain — Product Vision

> **Not another BJJ instructional app.**
>
> BJJ Brain is a personal knowledge system for grapplers. It remembers
> everything you learn, connects it together, identifies patterns in your game,
> and helps you become a better practitioner over time.
>
> Think:
> - Obsidian for knowledge
> - Spotify Wrapped for progress
> - A personal coach that never forgets

**Status:** vision v1, captured 2026-07-27. Nothing below is built yet. Scope,
sequencing and the "MVP" boundary are still open — see `docs/OPEN-QUESTIONS.md`.

---

## Core philosophy

The app should not simply store notes. It should answer questions like:

- What have I been working on recently?
- What are my biggest weaknesses?
- What techniques fit my current game?
- What concepts am I missing?
- How has my game evolved over the past year?

**The user's knowledge should become more valuable the longer they use the app.**

---

## MVP features

### 1. Class journal

Every training session creates a journal entry.

```text
Date:    27 July 2026
Coach:   John

Techniques
- Knee Slice Pass
- Leg Weave Pass
- Cross Face Pressure

Rolling Notes
- Passed Steve twice
- Got guillotined three times
- Lost chest pressure

Personal Thoughts
Need to keep my hips lower during passing.
```

Each entry is automatically tagged, e.g. `Guard Passing`, `Knee Slice`,
`Cross Face`, `Guillotine Defence`.

### 2. Areas of focus

Users maintain a small number of active focuses (e.g. Half Guard, Pressure
Passing, Escapes). Editable at any time. Future AI can suggest focuses based on
journal history.

### 3. Technique library

Instead of folders, everything is connected. A technique page (e.g. Half Guard)
contains personal notes, journal entries, coach notes, saved videos, related
techniques, concepts, questions and rolling clips.

### 4. YouTube integration

Paste a link; the app extracts title, thumbnail, channel and duration. The user
tags it (e.g. Half Guard / Sweep / Dogfight / Intermediate). The video then
appears automatically wherever those topics are viewed.

### 5. Personal notes

Support for text, images, checklists, voice notes and links. Everything
searchable.

### 6. Voice capture

Quick capture while driving home. User says:

> "I think I'm losing the underhook because my elbow flares."

AI converts into:

```text
Category:        Half Guard
Problem:         Losing Underhook
Possible Cause:  Elbow Flaring
Review:          Next Session
```

### 7. Questions

Users are encouraged to save open questions — "Why can't I finish Kimuras?",
"Why do I keep getting flattened?", "Why did coach say to look away?".
Questions can later become notes.

### 8. Coach principles

Concepts stored separately from techniques — "Inside position wins", "Never
chase", "Connection beats speed".

### 9. Training goals

Set goals before class (fight for underhooks, stand up once, don't accept
bottom side control); review achieved / not achieved after.

### 10. Move of the week

A single featured technique, preferably connected to the current focus.
Includes a short explanation, video, key detail, and why it fits your game.

---

## Knowledge graph

The long-term vision. Everything connects:

```text
Half Guard
├── Sweeps
├── Passing
├── Escapes
├── Videos
├── Notes
├── Coach Tips
├── Concepts
├── Competition Notes
└── Related Techniques
```

Users browse relationships instead of folders.

## Personal wiki

Every technique becomes its own page, e.g. **Kimura** — trained 18 times, 34
journal entries, 12 videos, 8 coach mentions, 9 rolling clips; related concepts
(Connection, Elbow Control); works well against Half Guard; needs improvement on
the Side Control finish.

## Game profile

The app builds a profile of the user's game: primary style, favourite guard,
most studied, fastest improving, least used.

## Pentagon graph

Interactive radar chart across Guard, Passing, Submissions, Wrestling, Escapes,
with two overlays:

- **Confidence** — what I think I'm good at
- **Evidence** — what my training history suggests

The difference between the two provides the insight.

## Learning pentagon

A second radar showing where study time is being invested.

## Timeline

Scrub through time and watch the pentagon evolve, the knowledge graph expand,
focuses change and new techniques appear.

## AI insights

Examples of the intended voice:

- "You've spent 70% of your study time on Half Guard."
- "You've mentioned pressure passing 41 times this month."
- "You appear to struggle maintaining chest pressure."
- "You've watched 15 passing videos but only 2 escape videos."
- "You haven't reviewed mount escapes for six weeks."

## Recommendations

Based on the current game rather than random techniques. Half Guard → Dogfight →
Single Leg suggests knee tap, back takes, wrestle-up variations.

## Knowledge gaps

Detect missing links — a user who knows Butterfly Sweep, Butterfly Arm Drag and
Butterfly Elevation but not Butterfly Passing gets prompted to fill the gap.

## Weekly theme

One theme per week (e.g. Frames); videos, coach notes, personal notes and
recommendations all relate to it.

## Monthly review

Sessions trained, most studied positions, most common problems, biggest
improvements, current focus, suggested focus next month.

## Annual wrapped

Spotify-Wrapped-style: 142 sessions, most studied position, favourite
submission, most improved, most-saved coach quote, most mentioned word.

---

## Future features

### Rolling video analysis
Upload sparring footage and add timestamps (2:14 lost underhook, 4:52 nice
sweep, 7:10 failed armbar). Searching "underhook" surfaces notes, videos,
journal entries and rolling clips together.

### Game chains
Techniques as connected sequences: Half Guard → Dogfight → Single Leg → Body
Lock → Side Control → Mount → Arm Triangle.

### Decision trees
Closed Guard → Hip Bump → opponent posts → Kimura → opponent defends → take the
back. Teach pathways rather than isolated moves.

### Game DNA
Gradually identify the user's identity — primary style, secondary, developing,
weak area, rarely used. **The AI should describe the user's game rather than
judge it.**

---

## Design principles

- Fast
- Calm
- Minimal
- Zero clutter
- Offline-first where possible
- Beautiful search
- Everything connected
- Keyboard friendly (desktop)
- Mobile-first experience
- Designed for years of accumulated knowledge

---

## The goal

After five years, this should not feel like an app. It should feel like a
second brain. Every class, every coach, every breakthrough, every mistake,
every video, every note — connected into one evolving map of the user's
jiu-jitsu journey.

The longer someone uses BJJ Brain, the more valuable it becomes.
