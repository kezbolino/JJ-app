# Voice scripts

Every spoken cue in the app, per voice.

**Status.** Both voices cover everything that shipped before v64: 62 clips each,
every movement in the two original routines and every strength lift nameable in
either.

**Also outstanding: second takes of every movement name** — the variety batch,
specced at the bottom of this file. The app can play more than one reading of a
line as of v71 (`CUE_TAKES` in `js/voices.js`); nothing is recorded yet, so
every movement still says the same words every time.

**Outstanding: the 27 Pilates lines, in both voices** (54 clips). The routine
shipped in v64 without audio on purpose — it runs on beeps, and a missing clip
has always been silent by design. What makes that deliberate rather than broken
is `PENDING_CUES` in `js/voices.js`: every Pilates id is listed there, and
`tests/stretches.test.mjs` asserts a pending id is one that genuinely has no
recording, in any voice. **Delete an id from that set the moment its line lands
in *both* voices** — a cue recorded in one voice only goes missing on half your
sessions, which is the hardest kind of gap to notice. The script is at the
bottom of this file. Arnold landed in
v52; Snoop's last three (`kb-getup`, `kb-swing`, `wu-press-ups`) landed with it.
There is a test asserting every voice can name everything the app speaks, so a
future movement cannot quietly ship in one voice and not the other.

That includes the five **session complete** lines, wired in v52: a finished
routine or lift chimes, then speaks.

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

## Session complete (5, shipped)

**The chime comes first, then the voice.** The three-note chime in `js/beeps.js`
is the signal that the session is over — the same notes every time, readable
without looking at the phone — and the spoken line is the flourish on top. A
line arriving *instead* of the chime would be a worse signal, so it lands 900ms
later, just after the chime's last note ends at ~840ms.

They play at the end of a completed routine and at the end of a lift. Ending
early plays neither: that is not a session you finished. Muting silences both,
as it always has.

`pickFinish()` in `js/stretches.js` draws from all five with no no-repeat state,
unlike the hype and other-side pickers — a session finishes exactly once, so
there is no previous take within it to avoid.

**Teardown waits for the clip to actually end.** `voice.say` returns the buffer
length and the routine holds its audio contexts open for that long plus a
margin; closing them underneath would cut the line off mid-sentence, and the
takes differ by seconds between the two voices (Snoop 1.7–3.1s, Arnold
2.9–5.4s). A fixed timeout would have to suit the longest line in the longest
voice and would go stale the moment one is re-recorded.

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

---

## Pilates — both voices, still to record (27 each)

The routine is at `#/stretch?r=pilates`. Same rule as everywhere else: **the
movement name first, clearly**, then the character. These play while the
phone is on the floor and you are on your back, so the name is the payload.

Written as the *cue*, not the joke — put each voice's own spin on it at the
microphone. The app's on-screen cue for each is in `js/stretches.js` and is
the fallback if a line needs shortening: keep every clip under about 5
seconds, because the spoken countdown fires with 3s of the get-ready left and
will cut a longer name off (see the v52 note on Arnold's longest clips).

| id | say |
|---|---|
| `pil-breathing` | Lateral breathing. Hands on the ribs, breathe wide. |
| `pil-pelvic-tilt` | Pelvic tilts. Flatten the back, then let go. |
| `pil-head-nod` | Head nods. Tiny. The neck is not the abs. |
| `pil-pelvic-curl` | Pelvic curl. One bone at a time, up and down. |
| `pil-chest-lift` | Chest lift. Ribs to hips, elbows wide. |
| `pil-chest-lift-rot` | Chest lift with rotation. Turn the whole ribcage. |
| `pil-toe-taps` | Toe taps. Keep the back on the floor. |
| `pil-hundred` | The Hundred. Breathe in for five, out for five. |
| `pil-roll-up` | Roll-up. Slow all the way up, slower on the way down. |
| `pil-leg-circles` | Single leg circles. Keep the hips dead still. |
| `pil-rolling-ball` | Rolling like a ball. Tuck tight, never the neck. |
| `pil-single-leg-stretch` | Single leg stretch. One knee in, one leg long. |
| `pil-double-leg-stretch` | Double leg stretch. Reach long, then pull it in. |
| `pil-scissors` | Scissors. Switch the legs, chest stays up. |
| `pil-lower-lift` | Lower lift. Only as low as the back stays down. |
| `pil-criss-cross` | Criss-cross. Elbow to the opposite knee, slowly. |
| `pil-teaser` | Teaser. Up to the V, and back down with control. |
| `pil-side-kick` | Side kick series. The torso does not move. |
| `pil-clam` | Clam. Open the knee, keep the hips stacked. |
| `pil-side-bend` | Side bend. Hips to the ceiling, long arc. |
| `pil-swan` | Swan. Lift the chest. This is the one your back has been asking for. |
| `pil-single-leg-kick` | Single leg kick. Heel to the seat, double pulse. |
| `pil-swimming` | Swimming. Small and fast, and keep breathing. |
| `pil-leg-pull-front` | Leg pull front. Plank. Lift one leg, hips level. |
| `pil-saw` | Saw. Rotate, reach past the little toe, breathe it all out. |
| `pil-spine-stretch` | Spine stretch forward. Curl over, then restack. |
| `pil-mermaid` | Mermaid. Reach over, breathe into the ribs. |

---

# Second takes — the variety batch (v71)

**Why.** Every movement has had exactly one recording since the voices shipped,
so the same words land every time that movement comes round — thirteen of them
every cool-down, seventeen every rest day, forever. The generic pools (`hype-N`,
`other-side-N`) have varied from the start and the movement names never have.

**How it works.** `CUE_TAKES` in `js/voices.js` says how many readings each
voice has of each id, and `createVoice` picks one, never the same one twice in
a row — the same `pickCue` rule the pools use. **Take 1 keeps the plain
filename**, so nothing already on the phone moves: the new file is
`<id>-2.webm` next to `<id>.webm`.

**Landing a take is three things in one commit** — the bytes in
`audio/cues/<voice>/`, the count in `CUE_TAKES`, and the filename in `sw.js`'s
`CUES`. `tests/stretches.test.mjs` fails on any one of them missing, in both
directions: a declared take with no file is silent on the sessions the picker
happens to choose it, and a file nobody declares rides in the precache forever
without ever being asked for.

**Record these in any order, one voice at a time.** `CUE_TAKES` is per voice,
so Snoop can have two readings of a movement while Arnold has one and nothing
is wrong. The **pools below are not** — `OTHER_SIDE_CUES` and friends are one
number for both voices, so `other-side-7` has to exist in *both* folders before
that constant moves.

**Same rules as every batch.** One file per line, named after the line. A clear
second of silence between lines if they come in one take. Movement name first,
plainly — "Ninety ninety", not "90/90". Keep each under about five seconds.

## Second takes — after-class cool-down (13)

| id | Snoop | Arnold |
|---|---|---|
| `neck-side` | Neck side stretch. Ear to the shoulder, easy now. | Neck side stretch. Take it over. Slowly. |
| `wrist-floor` | Kneeling wrist stretch. Palms down, lean in gentle. | Kneeling wrist stretch. Palms down. Lean. |
| `childs-pose` | Child's pose. Sit back on them heels and breathe. | Child's pose. Sit back. Breathe. |
| `thread-needle` | Thread the needle. Slide that arm under, shoulder to the floor. | Thread the needle. Arm underneath. All the way. |
| `ankle-rock` | Half-kneeling ankle rock. Rock that knee forward, heel stays down. | Half-kneeling ankle rock. Knee forward. Heel down! |
| `hip-flexor-lunge` | Kneeling hip flexor lunge. Tuck the hips, feel that front. | Kneeling hip flexor lunge. Tuck the hips. Good. |
| `quad-kneel` | Kneeling quad stretch. Heel to the backside, nice and slow. | Kneeling quad stretch. Heel to the seat. |
| `pigeon` | Pigeon stretch. Shin across the front, sink in. | Pigeon stretch. Shin forward. Sink down. |
| `frog` | Frog stretch. Knees out wide, rock it back. | Frog stretch. Knees wide. Rock back. |
| `ninety-ninety` | Ninety ninety hip stretch. Both knees bent, sit up tall. | Ninety ninety hip stretch. Sit tall. Breathe. |
| `seated-fold` | Seated forward fold. Long legs, fold over easy. | Seated forward fold. Fold over. Do not bounce. |
| `sphinx` | Sphinx. Up on them elbows, open the chest. | Sphinx. Onto the elbows. Chest up. |
| `supine-twist` | Supine spinal twist. On your back, knees over, let go. | Supine spinal twist. Knees across. Relax. |

## Second takes — rest-day routine (17)

| id | Snoop | Arnold |
|---|---|---|
| `warmup-march` | March in place. Knees up, get that blood moving. | March in place. Knees up. Go! |
| `warmup-squat` | Bodyweight squat pulses. Little bounces down low. | Bodyweight squat pulses. Down, down, down. |
| `warmup-arm-circle` | Arm circles. Big ones, both directions. | Arm circles. Big circles. Both ways. |
| `warmup-leg-swing` | Leg swings. Swing it front to back, stay tall. | Leg swings. Front and back. Stay tall. |
| `deep-squat-hold` | Deep squat hold. All the way down, sit in it. | Deep squat hold. All the way down. Settle. |
| `cossack-squat` | Cossack squat. Slide across, one side then the other. | Cossack squat. Shift across. Deep. |
| `ninety-ninety-liftoff` | Ninety ninety lift-off. Tiny lift, hold it there. | Ninety ninety lift-off. Lift. Small range. |
| `glute-bridge-single` | Single-leg glute bridge. One foot planted, hips to the sky. | Single-leg glute bridge. Hips up. Squeeze! |
| `copenhagen` | Copenhagen plank. Top leg up on the chair, hold steady. | Copenhagen plank. Top leg on the chair. Hold! |
| `single-leg-rdl` | Single-leg Romanian deadlift. Hinge back slow, chase that hamstring. | Single-leg Romanian deadlift. Hinge. Control it. |
| `jefferson-curl` | Jefferson curl. Roll down slow, one bone at a time. | Jefferson curl. Roll down. Vertebra by vertebra. |
| `thoracic-press-up` | Prone thoracic press-up. Press the chest up off the floor. | Prone thoracic press-up. Press up. Open it. |
| `wall-slide` | Scapular wall slide. Arms up the wall, keep 'em touching. | Scapular wall slide. Up the wall. Keep contact. |
| `dead-hang` | Dead hang. Grab the bar and just hang, nephew. | Dead hang. Hang. Do not let go. |
| `neck-isometric` | Neck isometrics. Press into the hand, hold it. | Neck isometrics. Push. Hold. Eight seconds. |
| `bear-crawl` | Bear crawl. Hips low, crawl it out. | Bear crawl. Hips low. Forward! |
| `side-plank` | Side plank. Up on the elbow, hips high. | Side plank. Up. Hips high. Hold it. |

## Second takes — strength lifts (9; `single-leg-rdl` is above)

| id | Snoop | Arnold |
|---|---|---|
| `pull-up` | Pull-ups. Dead hang to the top, no swinging. | Pull-ups. Full hang. Chest to the bar! |
| `archer-press-up` | Archer press-ups. Lean over one arm, other one long. | Archer press-ups. Over the bending arm. |
| `kb-getup` | Turkish get-up. Eyes on that bell the whole way. | Turkish get-up. Eyes on the bell. Slow. |
| `split-squat` | Bulgarian split squat. Back foot up, sink straight down. | Bulgarian split squat. Down. Shin upright. |
| `hanging-leg-raise` | Hanging leg raises. Curl the hips, no swinging. | Hanging leg raises. Curl the pelvis. No swinging! |
| `inverted-row` | Inverted rows. One straight line, pull the chest up. | Inverted rows. Straight line. Pull! |
| `pike-press-up` | Pike press-ups. Hips high, head to the floor. | Pike press-ups. Hips high. Crown down. |
| `hollow-hold` | Hollow body hold. Low back pressed flat, hold it. | Hollow body hold. Back flat. Hold! |
| `kb-swing` | Kettlebell swings. Snap them hips, let it float. | Kettlebell swings. Snap the hips! |

## Second take — strength warm-up (1)

| id | Snoop | Arnold |
|---|---|---|
| `wu-press-ups` | Press-ups. Ten of 'em, chest all the way down. | Press-ups. Ten. Chest to the floor! |

## Pool extensions

These are **not** per voice — the counts (`OTHER_SIDE_CUES`, `HYPE_CUES` in
`js/stretches.js`, `REST_OVER_CUES` in `js/views/strength.js`) are one number
each, so every line here has to be recorded in **both** voices before the
number moves. Until then, leave the constant alone and the extra files out of
the repo.

**`countdown` is the sameiest cue in the app** and is the best line-for-line
value here: one recording, played on about one set in five, identical every
time. It becomes `countdown-2`/`-3`/`-4` through `CUE_TAKES` like a movement
name, so it *is* per voice and can land one voice at a time.

### countdown — three more takes each (via `CUE_TAKES`)

| file | Snoop | Arnold |
|---|---|---|
| `countdown-2` | Three. Two. One. Go on then. | Three. Two. One. Move! |
| `countdown-3` | Three, two, one — let's get it. | Three. Two. One. Now! |
| `countdown-4` | Three. Two. One. Here we go, nephew. | Three. Two. One. Begin!

### now the other side — `other-side-7` to `-10`

| file | Snoop | Arnold |
|---|---|---|
| `other-side-7` | Flip it over, nephew. | Turn around. Other side. |
| `other-side-8` | Other side now. | The other side. Now! |
| `other-side-9` | Swap them over. | Switch. Go. |
| `other-side-10` | Same thing, other side. | Same again. Other side. |

### rest is over — `rest-over-6` to `-8`

| file | Snoop | Arnold |
|---|---|---|
| `rest-over-6` | That's the rest. Back to it. | The rest is finished. Up! |
| `rest-over-7` | Time's up, young'n. Go again. | Time is up. Again! |
| `rest-over-8` | Break's done. One more round. | No more resting. Move! |

### hype — `hype-11` to `-14`

| file | Snoop | Arnold |
|---|---|---|
| `hype-11` | That's it. Stay smooth with it. | Do not stop. Finish it! |
| `hype-12` | Easy now. You got plenty left. | You have more in you. Give it! |
| `hype-13` | Look at you go, nephew. | Excellent. Keep going! |
| `hype-14` | Keep breathing. Nice and steady. | Breathe. And push! |
