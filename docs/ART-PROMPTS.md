# Image prompts for the missing figures

**16 figures are missing.** Seven are in the rest-day mobility routine and
render as a blank slot in the app today; nine are strength lifts, which have no
figure *and* no code that would draw one — see the note above that section.

This list is generated from `PENDING_ART` in `js/stretch-art.js` and `EXERCISES`
in `js/strength.js`, checked against the 23 ids that actually have art. **It was
last reconciled on 2026-08-21**, when twelve prompts for figures that had already
shipped in v48 were removed from this file — they would have had someone
regenerate artwork the app already had.

## What is missing

**Rest-day mobility (7)** — these are the ones you can see missing:

- `warmup-march`
- `ninety-ninety-liftoff`
- `copenhagen`
- `jefferson-curl`
- `thoracic-press-up`
- `wall-slide`
- `dead-hang`

**Strength (9)** — nothing renders these yet, so they change nothing until
the view does:

- `pull-up`
- `archer-press-up`
- `kb-getup`
- `split-squat`
- `inverted-row`
- `pike-press-up`
- `hanging-leg-raise`
- `hollow-hold`
- `kb-swing`

**Already drawn (23)** — do not regenerate these:

`ankle-rock`, `bear-crawl`, `childs-pose`, `cossack-squat`, `deep-squat-hold`, `frog`, `glute-bridge-single`, `hip-flexor-lunge`, `neck-isometric`, `neck-side`, `ninety-ninety`, `pigeon`, `quad-kneel`, `seated-fold`, `side-plank`, `single-leg-rdl`, `sphinx`, `supine-twist`, `thread-needle`, `warmup-arm-circle`, `warmup-leg-swing`, `warmup-squat`, `wrist-floor`

`ankle-rock` is in that list but is an optional redo; its prompt is at the bottom.

---

## How to send them back

Send the **raw PNG** to the `art-inbox` branch, named after the id in the
heading — no tracing, no Illustrator, no removing the background. The pipeline
does all of that: potrace at `turdsize 8`, `alphamax 1.0`, `opttolerance 1.2`,
threshold 128, upscale 2x before tracing, then reframe the viewBox to a square on
the real bounding box with a 5% margin.

**One image per request, one movement per image.** A contact sheet of all of them
comes back at ~150x130px per figure with captions and borders traced in, which is
a thirtieth of the area needed — that is what stalled this job in the first
place. If the style drifts between requests, attach a PNG render of one of the
shipped figures as a reference alongside the prompt.

## The style block — paste this in front of every prompt

> Black line-art contour drawing of a single human figure on a plain white
> background. Clean black outlines of even weight, nothing else: no shading, no
> hatching, no grey, no colour, no fill, no ground line, no shadow, no text, no
> border. Simple fitted athletic clothing — shorts and a vest. Minimal facial
> detail. The whole body in frame with a small margin around it. Square image.

That block is what makes a new figure sit next to the eleven already shipped.
The line weight of the eleven is heavy and uniform; if a generated figure comes
back spindly, say "thick, confident, uniform line weight" and try again.

## The rule that decides whether a prompt is any good

**Name the exact moment, and name the thing that has to be legible.** Several of
these are movements, not positions, and a still that picks the wrong instant
just draws a person standing there. Every prompt below ends with the one detail
that makes it *that* movement and not its neighbour — keep those lines, they are
doing the work.

**Then look at it at 52px.** That is the size in the routine list. The v26 round
produced four unreadable figures that looked fine at full size, and the v47
`ankle-rock` shipped looking near-identical to `hip-flexor-lunge` at that size.
Render it small before you trust it.

---

# Rest-day mobility — the seven that are missing

## `warmup-march`

> Side view. A person marching on the spot, caught mid-step: one knee lifted to
> hip height with the shin hanging down, the other leg straight and standing. The
> opposite arm is swung forward, elbow bent, and the other arm swung back.
> Upright posture.

## `ninety-ninety-liftoff`

> Slightly raised three-quarter view. A person seated on the floor in the 90/90
> position: front leg bent 90 degrees in front with the shin across the body,
> back leg bent 90 degrees out to the side. Both hands are planted on the floor
> beside the hips. The **front shin is lifted a few inches clear of the floor**,
> with the torso upright and not leaning back. The small gap under the front shin
> is the point of the drawing.

## `copenhagen`

> Side view. A person in a side plank with the lower forearm on the floor, elbow
> under the shoulder. The **top leg is resting on a simple chair seat**, straight,
> supported near the ankle. The bottom leg hangs below with the knee down and
> resting on the floor. The hips are lifted so the body is in a straight line.
> The chair is a plain outline with no detail.

## `jefferson-curl`

> Side view. A person standing with completely straight legs, rolled down as far
> as they go: the spine curled forward one segment at a time into a deep even C
> shape, head hanging heavy between the arms, arms hanging straight down with the
> hands past the shins. The evenly rounded spine is the point — this is the one
> stretch where a rounded back is deliberate.

## `thoracic-press-up`

> Side view. A person face down with the hands planted flat on the floor under
> the shoulders, arms pressing nearly straight so the chest lifts high. The hips
> and thighs stay down in contact with the floor. The curve is in the upper back
> and ribs. Distinct from `sphinx`: here the arms are straight, not on the
> forearms.

## `wall-slide`

> Side-on-to-slightly-angled view showing a person standing with their back flat
> against a plain vertical wall. Both arms are raised with the elbows bent about
> 90 degrees and the **backs of both forearms, wrists and hands pressed flat
> against the wall**, sliding upward overhead. The wall is a single straight
> line. The contact between the forearms and the wall is the point.

## `dead-hang`

> Front view. A person hanging at full stretch from a simple horizontal bar
> above, both hands overhead in an overhand grip, arms completely straight, body
> relaxed and long, legs together and hanging straight down, feet clear of the
> floor. The shoulders are relaxed up towards the ears. The bar is a plain
> horizontal line.

---

# Strength — the nine that are missing

**Read this before generating these.** `js/views/strength.js` currently draws no
figures at all — the lift is a form, not a routine, and there is no code that
would render one. These prompts are ready when you are, but shipping them is a
**view change as well as an art job**, and it is worth deciding first *where* a
figure would go (next to the movement name in the session list, most likely) and
whether it earns the space on a screen that is mostly numbers and buttons.

Each prompt draws the **middle** progression, not the easiest or hardest, so the
picture stays right as you climb the ladder.

Each prompt draws the **middle** progression, not the easiest or hardest, so the
picture stays right as you climb the ladder.

## `pull-up`

> Front view. A person hanging from a simple horizontal bar overhead in an
> overhand grip, hands a little wider than the shoulders, pulled all the way up
> so the chest is at bar height and the elbows are down by the ribs. Legs
> straight and together, hanging still. The bar is a plain horizontal line.

## `archer-press-up`

> Front view from slightly above. A person in a press-up at the bottom, hands
> very wide. **One arm is bent with the chest lowered over that hand; the other
> arm is completely straight out to the side.** Body in one straight line from
> head to heels, hips level. The contrast between the bent and straight arm is
> the point.

## `kb-getup`

> Side view. A person part-way through a Turkish get-up: propped on one
> straight arm with the hand planted on the floor behind them, the other arm
> straight up overhead holding a **kettlebell**, hips lifted off the floor, one
> knee bent with that foot flat and the other leg straight out along the floor.
> The eyes are looking up at the bell. The kettlebell is a simple outline — a
> rounded bell with a squared handle.

## `split-squat`

> Side view. A person in a Bulgarian split squat at the bottom: the back foot is
> resting on top of a plain chair seat behind them, back knee low. The front shin
> is upright with the knee over the foot, front thigh roughly parallel to the
> floor. Chest upright, arms hanging or hands at the chest. The chair is a plain
> outline.

## `inverted-row`

> Side view. A person lying face up underneath a low horizontal bar, gripping it
> overhand with both hands, pulled up so the chest touches the bar and the elbows
> are back past the ribs. The body is in one straight line from head to heels
> with the heels on the floor. The bar is a plain horizontal line.

## `pike-press-up`

> Side view. A person with hands and feet on the floor and the **hips pushed very
> high** into an inverted V, legs straight, at the bottom of a pike press-up so
> the elbows are bent and the crown of the head is near the floor between the
> hands. The steep angle of the body is the point.

## `hanging-leg-raise`

> Side view. A person hanging from a simple horizontal bar overhead, arms
> straight, with both legs straight and lifted together to horizontal or above,
> hips curled slightly up towards the ribs. No swing — the body is still and
> controlled.

## `hollow-hold`

> Side view. A person lying on their back with the **low back pressed flat to the
> floor**, both arms reaching straight back overhead and both legs straight and
> together, all four limbs held just a few inches off the floor so the body makes
> a long shallow banana shape. Head and shoulders lifted slightly.

## `kb-swing`

> Side view. A person at the top of a kettlebell swing: standing tall, hips fully
> snapped through, both arms straight out in front at about chest height holding
> a **kettlebell** that is floating out at the end of the arms. Feet flat. This
> is the top of the swing, not a squat and not an overhead lift — the bell is at
> chest height, no higher.

## `single-leg-rdl` — already drawn, nothing to do

The lift and the rest-day mobility item are the same movement and the same id,
and the figure shipped with the rest-day batch. If a figure is ever rendered on
the strength screen, this one is already in `ART` and needs no new artwork.

---

# Optional

## `ankle-rock` — a redo, if wanted

The shipped one has the knee behind the toes, so it reads as a hip flexor lunge.
Only regenerate if that bothers you.

> Side view. A person in a half-kneeling lunge: back knee on the floor, front
> foot flat. The front knee is driven **far forward, well past the toes**, so the
> shin is at a steep 40-degree angle rather than upright. The front heel stays
> flat and pinned to the floor. Both hands press down on the front knee, pushing
> it further forward. The extreme forward angle of the front shin is the point of
> the drawing.
