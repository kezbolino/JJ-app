# Voice scripts

Every spoken cue in the app, per voice. The **id is the filename** —
`audio/cues/<voice>/<id>.webm` — and the app asks for a cue by movement id, so
a line recorded under the wrong name is silent rather than wrong.

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

## Recording notes

- **Leave a clear second of silence between lines.** The v39 take had pauses
  *inside* lines longer than the gaps *between* them (0.74s vs 0.33s), which made
  it unsplittable by gap width and needed transcription to align. A deliberate
  pause turns a two-hour job into ten minutes.
- Batch three or four lines per generation if the tool caps at 200 characters,
  and leave a longer gap between batches.
- Say the names plainly. "Ninety ninety" not "90/90", "Romanian deadlift" not
  "R-D-L" — the cut is verified by transcribing each clip and matching it against
  its own movement, and initialisms do not survive that check.
