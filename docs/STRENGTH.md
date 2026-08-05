# Strength Training Module, spec for implementation

> **Status: built in v35.** The spec below is the brief as it was handed over,
> kept verbatim so the reasoning behind each decision stays readable. What was
> actually built, and the three places it deliberately departs from the brief,
> are recorded in **[As built](#as-built)** at the bottom. Read that section
> before changing anything here.

A module to be embedded into an existing BJJ tracking app. This spec describes behaviour and data, not implementation. Fit the architecture, naming conventions, styling and storage approach to whatever the existing app already uses.

---

## Context

The user trains BJJ 3-4 times a week and lifts once a week. Bodyweight only: a pull-up bar and floor space, no weights. He is 75kg. The strength work exists to support jiu-jitsu and add some muscle, not as an end in itself.

The critical constraint: **once a week means he will not remember what he did last time.** The entire value of this module is that it tells him exactly what to do this session based on what he did last session. If it just records numbers, it has failed and he may as well use a notes app.

---

## The core problem this solves

Standard workout apps progress by adding weight. This programme has no weight to add. It progresses through a four-step ladder applied per exercise:

1. **Add reps** up to a ceiling (12 for most, 45s for holds)
2. **Slow the eccentric**, 3 seconds lowering, then 5 seconds
3. **Add a pause**, 2 seconds at the bottom of the rep
4. **Change variation**, move to a harder version of the movement and reset to step 1

An exercise sitting at step 3 with a 5-second eccentric and 12 reps has maxed out bodyweight progression and needs load. The app must detect and flag this.

---

## Data model

### Exercise (static definition)

| Field | Notes |
|---|---|
| `id` | stable identifier |
| `name` | display name |
| `category` | pull, push, legs, posterior, core |
| `rep_ceiling` | integer, reps at which to advance the ladder |
| `is_hold` | boolean, if true the unit is seconds not reps |
| `is_unilateral` | boolean, if true reps are per side |
| `variation_chain` | ordered list of exercise ids, easier to harder |
| `cue` | one-line form reminder shown during the session |

### SessionLog

| Field | Notes |
|---|---|
| `date` | |
| `exercise_id` | |
| `sets` | array of `{ reps, eccentric_seconds, pause_seconds, completed }` |
| `rpe` | optional, 1-10, how hard the whole exercise felt |
| `note` | optional free text |

### ExerciseState (derived, or stored and updated)

| Field | Notes |
|---|---|
| `exercise_id` | |
| `current_variation` | which item in the chain he's on |
| `ladder_step` | 1-4 |
| `target_sets` | |
| `target_reps` | |
| `eccentric_seconds` | |
| `pause_seconds` | |
| `needs_load` | boolean, true when ladder is exhausted |

---

## The programme

Full body, one session, roughly 60-75 minutes. Order is fixed: hardest movements first.

| # | Exercise | Starting prescription | Rest | Rep ceiling |
|---|---|---|---|---|
| 1 | Pull-ups | 5 x 6, 3s eccentric | 2 min | 8 |
| 2 | Bulgarian split squat | 4 x 10 each leg | 2 min | 12 |
| 3 | Archer press-ups | 4 x 6 each side | 2 min | 10 |
| 4 | Inverted rows, feet elevated | 4 x 12 | 2 min | 15 |
| 5 | Nordic curl negatives | 4 x 4 | 2 min | 6 |
| 6 | Pike press-ups, feet elevated | 3 x 10 | 90s | 12 |
| 7 | Hanging leg raises | 3 x 10 | 90s | 12 |
| 8 | Hollow body hold | 3 x 45s | 90s | 60s |

Warm-up prompt before exercise 1: arm circles, leg swings, 10 bodyweight squats, 10 press-ups, dead hang.

### Variation chains

- **Pull-ups**: negatives to strict to archer to weighted (weighted requires load)
- **Press-ups**: standard to feet-elevated to archer to one-arm progression
- **Split squat**: bodyweight to paused to loaded (requires load)
- **Rows**: feet on floor to feet elevated to archer
- **Pike press-ups**: floor pike to feet elevated to wall handstand
- **Nordic**: partial with hand assist to full negative to slow negative

---

## Screens and behaviour

### 1. Session view (the main screen)

The only screen that matters. He opens this at the start of a session.

- Shows exercises in order with **this session's targets already calculated** from last session
- Each set is tappable to log: reps achieved, and a flag for whether the tempo was held
- Tapping a completed set again should allow editing, he will mis-tap with sweaty hands
- Rest timer starts automatically on set completion, using the per-exercise rest value
- Form cue visible without tapping into anything
- Last session's numbers for that exercise shown alongside the target, small, for reference
- Must work with one thumb and must not require typing where a stepper will do

### 2. Progression engine

After a session is saved, evaluate each exercise:

- **All sets hit the target with tempo held** → advance. If reps are below the ceiling, add 1 rep. If at the ceiling, move up the ladder step and reset reps to the starting number for that step.
- **Target missed on two or more sets** → hold the prescription, no change.
- **Target missed on two consecutive sessions** → regress. Drop one rep, or step back down the ladder if already at the starting rep count.
- **Ladder exhausted** (step 3, 5s eccentric, at rep ceiling) → set `needs_load` true and surface a prompt: this movement now needs added weight, either move to the next variation in the chain or add a loaded rucksack or vest.

### 3. History

- Per-exercise view showing progression over time
- Should make visible that the numbers are moving, since with slow bodyweight progression it often does not feel like they are

### 4. Deload

- Every 7th completed session, prompt a deload: same exercises, half the sets, same reps
- He can accept or skip. Do not force it.
- A deload session does not trigger progression either way

---

## Integration with the BJJ side of the app

This is the reason for embedding it rather than using a separate app, so it should not be a bolted-on separate tab that shares nothing.

**Required:**

- Strength sessions appear in the same training log or calendar as BJJ sessions, visually distinguished
- Warn if a strength session is logged on a day that already has BJJ logged, with the rule: lift after BJJ, never before

**Worth doing if cheap:**

- Weekly load view: BJJ sessions plus strength sessions in one count. Flag if the combined total is climbing over several weeks, since this is where injury risk sits.
- If the app tracks injuries or niggles, allow an exercise to be muted while something is sore rather than requiring the whole session to be skipped.

---

## Explicitly out of scope for V1

- Nutrition or macro tracking. Wanted eventually, not now.
- Body weight logging beyond a single stored value.
- Any exercise library beyond the eight above.
- Custom programme builder. This is one programme, his programme.
- Social, sharing, streaks.
- Video demonstrations.

---

## Acceptance criteria

The build is done when:

1. He can open the app cold after three weeks off and it tells him exactly what to do, with no thinking required.
2. Logging a full session takes under 90 seconds of actual interaction.
3. After saving, next session's targets are already set.
4. When pull-ups max out, he gets told he needs a weight vest rather than silently stalling.
5. Strength and BJJ sessions are visible in one place.

---

## Notes for the implementer

- The user is not a developer. Explain decisions in plain terms and avoid unexplained jargon.
- Match the existing app's storage, styling and structure rather than introducing a new pattern.
- British English throughout the UI.
- No em dashes in any user-facing copy.
- Build the progression engine as isolated, testable logic. It is the only genuinely non-trivial part and everything else is a form.

---

## As built

Shipped in **v35**, as the third tab of the **Off mat** section (the Stretch tab
renamed — it now holds the after-class cool-down, the rest-day mobility routine
and this).

### Where it lives

| File | What it is |
|---|---|
| `js/strength.js` | The programme and the progression engine. Pure — no DOM, no storage, no clock. |
| `js/views/strength.js` | The screens: the plan, the session, the summary, the history. |
| `tests/strength.test.mjs` | 26 assertions against the engine. `node tests/strength.test.mjs`. |
| `js/beeps.js`, `js/wakelock.js` | Lifted out of `js/views/stretch.js` so the rest timer can share them. |

Sessions are stored as **settings rows** (`strengthSessions`), not as journal
`entries`. An entry's backup format is a fixed tiny grammar of front-matter
scalars — there is no honest way to write an array of exercises each holding an
array of sets in it, and adding YAML to try is exactly what `CLAUDE.md` forbids.
The trade-off, stated plainly: like the flashcard deck and starred moves,
**strength sessions do not sync to the notes repo yet.** Library → Export is the
backup until they do.

`ExerciseState` is **derived, not stored** — `programmeState()` replays the log
every time. A stored counter drifts the moment a session is edited or deleted,
and drift in this particular number is invisible: you would simply be told to do
the wrong thing forever.

### Three deliberate departures

1. **No RPE.** The spec lists it as optional. The BJJ side of this app had a
   1–5 "how it went" self-report and the user asked for it to be removed in v21;
   putting a 1–10 version of the same question back on an adjacent screen would
   be reintroducing something they rejected. The `note` field is in the data
   model but has no UI, for the same reason — nothing on this screen requires a
   keyboard.
2. **No multi-week climbing-load flag.** The cheap half of the "weekly load
   view" is built: the plan screen reads `This week: 3 classes · 1 lift`, from
   `store.weekLoad()`. Flagging a combined total that is climbing over several
   weeks was left out — it is a claim about injury risk, and this app's standing
   rule is that it reports what was written down and never diagnoses.
3. **Exercise muting is not tied to an injury record.** The app tracks no
   injuries, so muting is a plain per-movement toggle (`strengthMuted`) that
   survives between sessions. A muted movement stays in the session marked
   `skipped`, and moves the ladder in neither direction.

### Things that will bite whoever touches this next

- **The rest timer is screen-local, and that is on purpose.** The *set log* is
  what has to survive navigation, and it does — the draft is written to storage
  on every tap. A rest countdown does not; it tears itself down via the render
  token (`js/render.js`) the moment `#view` is replaced.
- **The corrections panel is not a popover.** Five 58px set buttons wrap onto
  two lines at a 360px Android width, so anything hanging below set one lands on
  top of set five. It renders under the whole row instead.
- **"Back to the plan" on the summary screen is a `<button>`, not a link.** That
  screen sits at `#/strength`, the hash it would link to, so a link fires no
  `hashchange` and the router never re-renders — a dead end that is invisible
  until somebody taps it. It was one, briefly.
- **A holds-only movement has no eccentric and no pause.** Steps 2 and 3 of the
  ladder are skipped for `isHold` exercises; they add seconds to the ceiling and
  then report `needsLoad`. Inventing a tempo for an isometric would be worse
  than admitting it has run out of road.
- **The engine never moves you onto a variation marked `needsLoad`.** It flags
  the exercise instead. "Put on a weight vest" is a decision, not a rep.
