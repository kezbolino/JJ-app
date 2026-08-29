# Image prompts for the figures

> **OUTSTANDING, 2026-08-29: the 27 Pilates movements.** The routine shipped in
> v64 with no artwork on purpose — it is useful the day it ships and the figures
> follow. Every id is in `PENDING_ART` in `js/stretch-art.js`, and there is a
> test asserting each one is declared rather than accidentally undrawn.
>
> **Read "How to send them back" and "What was learned tracing these" below
> before generating anything** — the rules that worked are: no captions, no cell
> borders, at least ~300px per figure, and one movement per drawing.
>
> **Size warning, and it is the real constraint.** `js/stretch-art.js` is 166 KB
> and sits in `CORE`, which is precached atomically and re-downloaded on every
> version bump. 27 more figures at ~6 KB each is another ~160 KB — a doubling.
> **This batch should go into its own module** (`js/pilates-art.js`), lazily
> imported by the routine view and listed in `LAZY`/`EXTRAS` in `sw.js`, exactly
> as the lift figures did in v58. `tests/offline.test.mjs` already enforces what
> LAZY is allowed to mean.

## The 27 Pilates figures still wanted

Same house style as the existing set: **single continuous contour line drawing,
one person, plain white background, no shading, no text, no border, side-on
unless noted, the whole body in frame**. Draw the moment that *shows the
movement*, not the rest position — for anything with a range, that is the end of
the range.

| id | draw this |
|---|---|
| `pil-breathing` | **Lateral breathing** — lying on the back, knees bent, feet flat, both hands flat on the sides of the ribcage — seen from the side, ribs visibly wide |
| `pil-pelvic-tilt` | **Pelvic tilts** — lying on the back, knees bent, pelvis tucked so the lower back is flat to the floor |
| `pil-head-nod` | **Head nods** — lying on the back, knees bent, chin nodding a fraction toward the chest — head still on the floor |
| `pil-pelvic-curl` | **Pelvic curl** — the top of a shoulder bridge: shoulders down, hips high, one long diagonal from knee to shoulder |
| `pil-chest-lift` | **Chest lift** — lying on the back, knees bent, head and shoulders curled off the floor, hands cradling the head, elbows wide |
| `pil-chest-lift-rot` | **Chest lift with rotation** — the same curl, ribcage rotated so one elbow points across toward the opposite knee — drawn from a high three-quarter angle so the twist reads *(one side only; the app runs it twice)* |
| `pil-toe-taps` | **Toe taps** — lying on the back, legs in tabletop, one toe touching the floor, the other knee still stacked over the hip |
| `pil-hundred` | **The Hundred** — lying on the back curled up, legs straight and low at about 45 degrees, arms straight and hovering by the hips |
| `pil-roll-up` | **Roll-up** — mid roll-up — spine in a deep C-curve halfway between lying and sitting, arms reaching forward past the knees |
| `pil-leg-circles` | **Single leg circles** — lying on the back, one leg straight up to the ceiling, the other long on the floor; a faint circular arrow at the raised foot *(one side only; the app runs it twice)* |
| `pil-rolling-ball` | **Rolling like a ball** — tucked in a tight ball, hands holding the shins, balanced on the tailbone with the feet off the floor |
| `pil-single-leg-stretch` | **Single leg stretch** — curled up, both hands drawing one bent knee in to the chest, the other leg straight and low |
| `pil-double-leg-stretch` | **Double leg stretch** — curled up at full reach — arms straight overhead, both legs straight and low, body a long shallow arc |
| `pil-scissors` | **Scissors** — lying on the back curled up, legs split — one vertical, one low — hands holding the ankle of the high leg |
| `pil-lower-lift` | **Lower lift** — lying on the back, both legs straight and together, lowered to about 45 degrees, hands under the hips |
| `pil-criss-cross` | **Criss-cross** — curled up, one knee in, torso rotated so the opposite elbow crosses toward it — high three-quarter angle |
| `pil-teaser` | **Teaser** — the top of a teaser: balanced on the tailbone in a V, legs at 45 degrees, arms reaching parallel to the legs |
| `pil-side-kick` | **Side kick series** — lying on one side, body in one long line propped on the forearm, top leg swung forward at hip height *(one side only; the app runs it twice)* |
| `pil-clam` | **Clam** — lying on one side, knees bent and stacked, feet together, the top knee opened upward *(one side only; the app runs it twice)* |
| `pil-side-bend` | **Side bend** — the top of a side bend: one hand and the outside of one foot on the floor, hips lifted high, top arm sweeping overhead in a long arc *(one side only; the app runs it twice)* |
| `pil-swan` | **Swan** — face down, hands under the shoulders, chest and head lifted into a long back extension, hips staying down |
| `pil-single-leg-kick` | **Single leg kick** — face down propped on both forearms, chest lifted, one heel kicked in toward the seat |
| `pil-swimming` | **Swimming** — face down, opposite arm and leg lifted off the floor, head just clear of the floor |
| `pil-leg-pull-front` | **Leg pull front** — a straight-arm plank with one leg lifted a few centimetres, hips level |
| `pil-saw` | **Saw** — sitting tall, legs wide, torso rotated and folded so one hand reaches past the opposite foot, the other arm reaching back *(one side only; the app runs it twice)* |
| `pil-spine-stretch` | **Spine stretch forward** — sitting with legs wide, spine curled forward into a deep C over the legs, arms reaching along the floor |
| `pil-mermaid` | **Mermaid** — side sitting with the legs folded to one side, one arm reaching overhead and over into a long side bend *(one side only; the app runs it twice)* |

---

## Where each figure came from

- **11 mobility** — the v48 contact sheet.
- **1** — `ankle-rock`, a single full-size PNG (v47). Its pose is imperfect: the
  knee sits behind the toes where the cue says to drive it well past them. It
  does not read as a duplicate of `hip-flexor-lunge` in the list, so it stayed.
- **7 mobility + 9 strength** — the 2026-08-21 sheets. `single-leg-rdl` needed
  nothing: the rest-day mobility item and the lift are the same movement and the
  same id.

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

---

# What was learned tracing these

The pipeline is scripted but the script is disposable; these are the four things
that cost time and would cost it again.

**1. potracer's `Bitmap` traces where the array is FALSE.** So the mask is
`np.array(im) >= 128` — True for the white page — and the ink is what comes
back. Passing the intuitive `< 128` succeeds, returns curves, and wraps every
figure in a contour around the whole canvas: rendered, that is a black rectangle
with the figure knocked out of it in white. Confirm the polarity on a 20px black
square against a white field before trusting a batch. A fill-rule change does
not fix it — the rectangle is really in the path.

**2. Do not upscale a tile that is already big.** The v48 pipeline resized 2×
before tracing, which was right for 150px tiles (it stops potrace turning each
pixel step into a corner). At 300–450px it just multiplies curve segments:
93.7 KB for seven figures at 2×, 62.5 KB at 1×, visually identical.

**3. Thicken the ink, or the figures do not match the shipped set.** These
drawings have a lighter line and more interior detail (faces, muscle contours)
than the Illustrator originals. Two iterations of `binary_dilation` on the ink
before tracing lands on the shipped weight — checked side by side at 120px and
52px. Three starts to fill the torso in. It also *reduces* the byte count, since
neighbouring lines merge.

**4. Segment a sheet by connected components, not a nominal grid.** A grid crop
clips whatever overflows its cell — it took the bar off `hanging-leg-raise` and
gave `split-squat` a pair of feet from the tile above. Label the ink with a
*small* dilation (4px): a large one merges figures that sit above each other in
the same column. Then order the boxes by each figure's **centre** against the
sheet's row height, never by its top edge — within one row a hanging figure's
bar sits 175px above a press-up's shoulders, and banding on the top edge put
four names on the wrong drawings.

And the standing rule, unchanged: **render it at 52px and look at it.** That is
the size in the routine list. It is what caught `ankle-rock` reading as
`hip-flexor-lunge` in v47, and it is the only check that matters.
