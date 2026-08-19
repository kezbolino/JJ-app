# Voice scripts

Every spoken cue in the app, per voice.

**Status.** Both voices are complete and shipped: 62 clips each, every movement
in both routines and every strength lift nameable in either. Arnold landed in
v52; Snoop's last three (`kb-getup`, `kb-swing`, `wu-press-ups`) landed with it.
There is a test asserting every voice can name everything the app speaks, so a
future movement cannot quietly ship in one voice and not the other.

Still unwired: the five **session complete** lines, now recorded in both voices.
The app has no spoken finish cue to put them in — see that section below.

The **id is the filename** — `audio/cues/<voice>/<id>.webm` — and the app asks
for a cue by movement id, so a line recorded under the wrong name is silent
rather than wrong.

Two ids are deliberately shared between sections: `single-leg-rdl` is both a
rest-day movement and a strength lift, and `dead-hang` is both a rest-day
movement and the strength warm-up's last item. One clip serves both places, so
the line has to make sense in either.

**Rule for every line: say the movement name first, clearly.** The joke is the
garnish. These play with the phone face down or while you are lying on your
back, and the cue's whole job is to tell you what is coming.

---

## Arnold — after-class routine (13)

| id | line |
|---|---|
| `neck-side` | Neck side stretch. Tilt it over. Do it. Do it now! |
| `wrist-floor` | Kneeling wrist stretch. Your hands have been gripping all night. Now they get to live. |
| `childs-pose` | Child's pose. Down you go. Stop whining. |
| `thread-needle` | Thread the needle. Reach that arm through. Come with me if you want to live. |
| `ankle-rock` | Half-kneeling ankle rock. Drive the knee past the toes. Do it! |
| `hip-flexor-lunge` | Kneeling hip flexor lunge. Squeeze the back glute. This is the good pain. |
| `quad-kneel` | Kneeling quad stretch. Grab the foot. I'll be back for the other side. |
| `pigeon` | Pigeon stretch. Front shin across. If it bleeds, we can kill it. |
| `frog` | Frog stretch. Knees wide. Let off some steam. |
| `ninety-ninety` | Ninety ninety hip stretch. Both knees bent. Now relax. |
| `seated-fold` | Seated forward fold. Reach for the toes. No whining. |
| `sphinx` | Sphinx. Up on the elbows. Open that chest. |
| `supine-twist` | Supine spinal twist. On your back, knees over. Consider that a divorce. |

## Arnold — rest-day routine (17)

| id | line |
|---|---|
| `warmup-march` | March in place. Get moving. Move it! |
| `warmup-squat` | Bodyweight squat pulses. Keep bouncing. Come on! |
| `warmup-arm-circle` | Arm circles. Forward, then back. Get the blood in there. |
| `warmup-leg-swing` | Leg swings. Front to back. Loosen those hips. |
| `deep-squat-hold` | Deep squat hold. Sit all the way down and settle in. |
| `cossack-squat` | Cossack squat. Shift the weight across. Five to eight each side. |
| `ninety-ninety-liftoff` | Ninety ninety lift-off. Small range. Lift that knee. |
| `glute-bridge-single` | Single-leg glute bridge. One foot down. Drive the hips up. |
| `copenhagen` | Copenhagen plank. Top leg on the chair. Hold it! |
| `single-leg-rdl` | Single-leg Romanian deadlift. Hinge at the hip. Slow. |
| `jefferson-curl` | Jefferson curl. Roll down one bone at a time. |
| `thoracic-press-up` | Prone thoracic press-up. Press that chest up. |
| `wall-slide` | Scapular wall slide. Arms up the wall. Keep contact. |
| `dead-hang` | Dead hang. Grab the bar and hang. Do not let go. |
| `neck-isometric` | Neck isometrics. Push against the hand. Eight seconds. |
| `bear-crawl` | Bear crawl. Hips low. Forward and back. |
| `side-plank` | Side plank. Up on the elbow. Hold. |

## Arnold — strength lifts (9 new; `single-leg-rdl` is shared, above)

| id | line |
|---|---|
| `pull-up` | Pull-ups. Full hang, chest to the bar. No kipping. |
| `archer-press-up` | Archer press-ups. Weight over the bending arm. Hips level. |
| `kb-getup` | Turkish get-up. Eyes on the bell. Do not lose that shoulder. |
| `split-squat` | Bulgarian split squat. Back foot on the chair. Shin upright. |
| `hanging-leg-raise` | Hanging leg raises. No swinging. Curl the pelvis. |
| `inverted-row` | Inverted rows. Body in one line. Pull! |
| `pike-press-up` | Pike press-ups. Hips high, crown to the floor. |
| `hollow-hold` | Hollow body hold. Low back flat. Hold it. Do not give up. |
| `kb-swing` | Kettlebell swings. Snap the hips. Let it float. |

## Arnold — strength warm-up (1 new; the rest are shared, above)

| id | line |
|---|---|
| `wu-press-ups` | Press-ups. Ten of them. Chest to the floor. Come on! |

---

## Arnold — countdown (1)

| id | line |
|---|---|
| `countdown` | Three. Two. One. Do it now! |

## Arnold — rest is over (5)

| id | line |
|---|---|
| `rest-over-1` | Rest is over. Get back to work. |
| `rest-over-2` | Enough resting. Move! |
| `rest-over-3` | Time is up. No more whining. |
| `rest-over-4` | Break is finished. Come on! |
| `rest-over-5` | That is it. Back on it. |

## Arnold — now the other side (6)

| id | line |
|---|---|
| `other-side-1` | Now the other side. |
| `other-side-2` | Switch. Other side. |
| `other-side-3` | Other side now. Do it. |
| `other-side-4` | Change sides. Come on. |
| `other-side-5` | Now the other one. |
| `other-side-6` | Switch it over. Go. |

## Arnold — hype (10)

| id | line |
|---|---|
| `hype-1` | Come on! Don't be a girly man! |
| `hype-2` | The pump is the most satisfying feeling. Chase it. |
| `hype-3` | If it bleeds, we can kill it. Keep going. |
| `hype-4` | Get to the choppa! Move! |
| `hype-5` | Milk is for babies. Finish the set. |
| `hype-6` | Who is your daddy, and what does he do? Push! |
| `hype-7` | You lack discipline! One more rep! |
| `hype-8` | Crush it. Hear the lamentations. Go! |
| `hype-9` | No pain, no gain. Stop whining. |
| `hype-10` | I'll be back. You keep working. |

---

## Snoop — the last three (recorded)

These three existed in Arnold before Snoop and were the only gap between the
voices. All three are in the strength module.

| id | where it plays | line |
|---|---|---|
| `kb-getup` | Turkish get-up — the lift name, on its first set and at the end of a rest | Turkish get-up, nephew. Slow, eyes on that bell. |
| `kb-swing` | Kettlebell swings — same two moments | Kettlebell swings. Snap them hips, bitch. |
| `wu-press-ups` | The strength warm-up checklist, announced by ticking the row above it | Press-ups. Ten of 'em. Chest to the floor, young'n. |

**`wu-press-ups` was wired to nothing until this batch.** `WARM_UP` in
`js/strength.js` carried `cue: null` for it from when no clip existed, so after
Arnold's clip shipped in v52 it was on disk and in the precache and still never
requested — downloaded on every update, unreachable, silent. There is now a test
(`every precached clip is one the app can actually ask for`) that fails on
exactly that: a clip nothing can name. **The file existing is not the same as
the app being able to reach it** — the same lesson as v41.

`single-leg-rdl` is deliberately not on this list. It is a lift and a rest-day
movement sharing one id, and the rest-day clip already covers both.

---

## Session complete (5, recorded in both voices, not wired)

Five finish lines came with the Arnold batch and Snoop counterparts followed.
Both sets are recorded; neither is **shipped**, and they are not in
`audio/cues/`. The
app has no spoken finish cue: a routine ends on the synthesised three-note chime
in `js/beeps.js` and a lift ends on its summary screen. Wiring them is a
feature — it needs a slot and a decision about whether the voice replaces the
chime or follows it. The "both voices or neither" blocker is gone; what is left
is the design. The recordings are in the source zips.

Ids follow the `rest-over-N` / `hype-N` convention, so `pickCue(FINISH_CUES, …)`
in `js/stretches.js` would drive them with no new mechanism.

| id | Arnold | Snoop |
|---|---|---|
| `finish-1` | Session complete. You did it. Well done. | Session complete. You did that, nephew. Respect. |
| `finish-2` | That is it. We are all finished. Now go and eat. | Good job, we done. Go eat, bitch. |
| `finish-3` | Done. You have earned that. I am proud of you. | Done. You earned that one, fo shizzle. |
| `finish-4` | The workout is over. I'll be back tomorrow. | Workout's over. Catch you tomorrow, young'n. |
| `finish-5` | Finished. Everybody out of the pool. Go! | Finished. Now go sit down. |

The Snoop column carries the same *function*, not the same catchphrases — a
Snoop line quoting Predator would be a worse impression, not a matching one.

**Snoop's `finish-2` and `finish-5` were reworded at the mic** — the recorded
takes do not match the script that was written for them, and the text above is
read off the filename slug plus a rough transcription, so their tails are
approximate. The other three match their script exactly. It does not matter for
wiring — finish lines are a pool, any one can play in any slot, like `hype-N` —
but correct them here if they are ever put on screen.

**The Arnold five are reconstructed too, not transcribed cleanly.** There was no
script for them — they arrived as extra files beyond the 62 in
`voice-record-list.txt`. Each line above is the filename's slug (which is only
the first four words) plus a `pocketsphinx` pass over the audio, which is rough:
it heard "That is it" as "others it's" and "the workout is over" as "would
produce over". The *sense* of each is certain and the opening words are exact;
the tails are best-effort. Correct them against the source before recording
Snoop versions to match.

## Recording notes

- **Already-cut files are worth far more than one long take.** The Arnold batch
  arrived as 67 numbered wavs, one line each, with the line's own text slugged
  into the filename — so the mapping could be *verified* (each file's slug had
  to be a prefix of its script line's slug) rather than inferred from gap widths
  or reconstructed with a transcriber. That check is two minutes and it is the
  whole of the v39 problem, gone. Ask for one file per line.
- **Match the level of what is already there.** The Arnold take came in at
  −15 dB mean against Snoop's −24 dB — roughly twice as loud, and the beeps were
  tuned against Snoop in v31. A flat `volume=-9dB` on encode put it at −24.4 dB,
  the same average, with the take's own dynamics intact. Measure both before
  assuming they match.

- **Leave a clear second of silence between lines.** The v39 take had pauses
  *inside* lines longer than the gaps *between* them (0.74s vs 0.33s), which made
  it unsplittable by gap width and needed transcription to align. A deliberate
  pause turns a two-hour job into ten minutes.
- Batch three or four lines per generation if the tool caps at 200 characters,
  and leave a longer gap between batches.
- Say the names plainly. "Ninety ninety" not "90/90", "Romanian deadlift" not
  "R-D-L" — the cut is verified by transcribing each clip and matching it against
  its own movement, and initialisms do not survive that check.
