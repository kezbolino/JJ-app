# Technique ontology — draft v0

**This needs a practitioner's eye. Correct it.** Drafted 2026-07-27 by Claude;
kezbolino trains, Claude does not. Wrong names, missing positions and bad
groupings are expected — fixing them is the point.

## Why this exists

Tags connect everything in the app. A flat tag list can't answer "you've written
a lot about half guard sweeps, how's your half guard passing?" — that needs to
know half guard has a **top** and a **bottom**, and that you've filled one side
and not the other.

So every tag is a **position × role** pair, not a word.

---

## Roles

What you are trying to *do*. Applies differently depending on which side you're on.

| Role | Side | Meaning |
|---|---|---|
| `retain` | bottom | keep the guard, stop it being passed |
| `sweep` | bottom | reverse to top |
| `submit` | either | finish from here |
| `escape` | bottom | get out of a pin |
| `pass` | top | get past the guard |
| `maintain` | top | hold and consolidate the pin |
| `takedown` | standing | get it to the ground |
| `td-defence` | standing | stop the takedown |
| `back-take` | either | get to the back |
| `transition` | either | move to a better position |

A **coverage gap** is an empty role next to a full one on the same position.

---

## Positions

### Standing
`takedown` · `td-defence` · `submit`
- Single Leg, Double Leg, Body Lock, Ankle Pick, Snap Down, Arm Drag
- Guard Pulling, Sprawl, Whizzer, Underhook Battle
- Grip Fighting *(concept-heavy)*

### Closed Guard
bottom: `retain` `sweep` `submit` `back-take` · top: `pass`
- Hip Bump, Scissor Sweep, Flower Sweep, Pendulum
- Armbar, Triangle, Kimura, Guillotine, Omoplata
- Standing Pass, Knee Wedge, Log Split

### Half Guard
bottom: `retain` `sweep` `submit` `back-take` · top: `pass` `submit`
- Dogfight, Knee Tap, Underhook Sweep, Old School, Electric Chair
- Deep Half, Lockdown, Z-Guard / Knee Shield, Coyote
- **Passing:** Knee Slice *(a.k.a. knee cut / knee slide)*, Leg Weave,
  Crossface Pressure, Body Lock Pass, Smash Pass

### Open Guard
bottom: `retain` `sweep` `submit` · top: `pass`
- De La Riva, Reverse De La Riva, Spider, Lasso, Collar Sleeve
- Butterfly, X-Guard, Single Leg X, Shin-to-Shin, K-Guard, 50/50
- **Passing:** Toreando, Long Step, Leg Drag, Float, Headquarters, Stack

### Side Control
bottom: `escape` · top: `maintain` `submit` `transition`
- Escapes: Frame & Shrimp, Ghost Escape, Underhook Recovery, Bridge & Roll
- Top: Crossface, Kimura, Americana, Arm Triangle, Baseball Choke
- Transitions: to Mount, to Knee on Belly, to North South

### North South
bottom: `escape` · top: `maintain` `submit`
- North South Choke, Kimura

### Knee on Belly
bottom: `escape` · top: `maintain` `submit`
- Far Side Armbar, Baseball Choke

### Mount
bottom: `escape` · top: `maintain` `submit` `transition`
- Escapes: Upa / Bridge & Roll, Elbow Knee, Hip Heist
- Top: Armbar, Cross Collar, Ezekiel, Arm Triangle, S-Mount, Gift Wrap

### Back Control
bottom: `escape` · top: `maintain` `submit`
- Escapes: Scoot & Shrug, Hand Fighting, Falling to the Weak Side
- Top: RNC, Bow & Arrow, Body Triangle, Short Choke

### Turtle
bottom: `escape` `retain` · top: `maintain` `back-take` `submit`
- Granby Roll, Sit Out, Peek Out
- Clock Choke, Seat Belt, Hooks In

### Front Headlock
`submit` `back-take` `transition`
- Guillotine, D'Arce, Anaconda, Peruvian Necktie

### Leg Entanglements
`submit` `transition` `escape`
- Ashi Garami, Outside Ashi, Saddle / 411, Inside Sankaku, 50/50
- Straight Ankle, Heel Hook, Kneebar, Toe Hold
- Escapes: Hitchhiker, Boot Removal, Clearing the Knee Line

---

## Concepts

Separate from techniques — this is `VISION.md` feature 8 (coach principles).
Concepts cut across positions and should be taggable on their own.

Pressure · Connection · Frames · Inside Position · Angle · Base · Posture ·
Grips · Hip Position · Head Position · Weight Distribution · Timing ·
Head-and-Arm Control · Underhooks · Levers

Coach quotes attach here, not to techniques:
"Inside position wins" → `Inside Position`.

---

## Synonyms

Tagging must fold these together or the graph fragments. Gyms rename everything.

| Canonical | Also called |
|---|---|
| Knee Slice | knee cut, knee slide, knee through |
| Dogfight | wrestle-up (overlapping, not identical) |
| Upa | bridge and roll |
| Toreando | bullfighter, toreando pass |
| Americana | keylock, figure four |
| Saddle | 411, honey hole, inside sankaku |
| RNC | rear naked choke, mata leão |
| Body Lock Pass | body lock, over-under lock |

**This table will be permanently incomplete.** It should be editable in-app —
when the tagger gets something wrong, you correct it once and it learns the
alias.

---

## Open questions for review

1. **Gi vs no-gi** — collar chokes and lapel guards don't exist in no-gi.
   Separate axis, a flag per technique, or ignored for now?
2. **Granularity** — is "De La Riva" one tag, or does it need sub-positions?
   Too fine and nothing accumulates; too coarse and the coverage map is blunt.
3. **Missing positions?** Nothing here for standing submissions, scrambles or
   competition-specific situations.
4. **Should the user be able to add positions?** Almost certainly yes — but then
   the coverage engine has to cope with a position that has no roles defined.
