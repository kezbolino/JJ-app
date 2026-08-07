# Image prompts for the missing figures

> **PARKED, 2026-08-07.** Seven mobility figures and all ten strength ones are
> still missing, and the prompts below are ready — but the generation route is
> the unsolved part, not the wording.
>
> **The bind:** asking for all of them in one go returns a contact sheet, which
> is stylistically consistent but leaves each figure at ~150×130px — a
> thirtieth of the area needed, with captions and borders drawn in. Asking one
> at a time gives full resolution but a different house style every time: some
> figures come back with faces, some without, line weights vary. Neither route
> gives consistency *and* resolution, and a routine list where half the figures
> have faces is worse than one where several have no figure at all.
>
> The eleven that shipped in v48 came from the sheet and are internally
> consistent with each other; `PENDING_ART` means the rest simply render without
> a figure, which is the designed behaviour and looks fine.
>
> **Worth trying when this is picked up again:** feed the generator one of the
> shipped SVGs (or a PNG render of one) as a style reference alongside each
> prompt, so it has something concrete to match rather than a description. That
> is the only approach that plausibly gets both.

One prompt per movement, for generating the line drawings that `js/stretch-art.js`
holds. Send the **raw PNG** to the `art-inbox` branch, named after the id in the
heading — no tracing, no Illustrator, no removing the background. The pipeline
does all of that (`art-inbox/README.md` documents it).

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

# Cool-down (after class)

## `ankle-rock` — a redo, if wanted

The shipped one has the knee behind the toes, so it reads as a hip flexor lunge.
Only regenerate if that bothers you.

> Side view. A person in a half-kneeling lunge: back knee on the floor, front
> foot flat. The front knee is driven **far forward, well past the toes**, so the
> shin is at a steep 40-degree angle rather than upright. The front heel stays
> flat and pinned to the floor. Both hands press down on the front knee, pushing
> it further forward. The extreme forward angle of the front shin is the point of
> the drawing.

## `sphinx`

> Side view. A person lying face down, propped on both forearms with the elbows
> directly under the shoulders, forearms flat and parallel on the floor. The
> chest is lifted and the head is up and long, but the hips, thighs and legs stay
> flat on the floor. A gentle open curve through the upper back, not a deep
> backbend — the low back stays long.

---

# Rest day — warm-up

These four are movements. Each needs a clear mid-motion instant.

## `warmup-march`

> Side view. A person marching on the spot, caught mid-step: one knee lifted to
> hip height with the shin hanging down, the other leg straight and standing. The
> opposite arm is swung forward, elbow bent, and the other arm swung back.
> Upright posture.

## `warmup-squat`

> Side view. A person mid-squat, caught halfway down: hips back, knees bent to
> about 90 degrees, chest up, arms reaching forward at shoulder height for
> balance. A shallow, continuous, bouncing squat — not a deep bottom position.

## `warmup-arm-circle`

> Front view. A person standing, both arms straight out to the sides and swept up
> and back in a wide circle, hands at head height with the palms leading, so the
> arms are caught mid-sweep rather than static. Feet shoulder-width apart.

## `warmup-leg-swing`

> Side view. A person standing on one leg, one hand resting on a simple vertical
> support at their side for balance. The free leg is swung forward and up to
> about hip height, straight, caught mid-swing. Upright torso, no twisting.

---

# Rest day — main session

## `deep-squat-hold`

> Front view. A person at the very bottom of a deep squat, hips below the knees,
> feet flat with the heels down, knees pushed wide apart. Both elbows are inside
> the knees with the hands together at chest height, elbows pressing the knees
> outward. Chest upright. Front view because the width between the knees is the
> point.

## `cossack-squat`

> Front view. A person in a very wide stance, sitting all the way down over one
> deeply bent leg with that heel flat. The other leg is completely straight out
> to the side with the toes pointed up and the heel on the floor. Arms reach
> forward for balance. The extreme contrast between the deeply folded leg and the
> straight one is the point.

## `ninety-ninety-liftoff`

> Slightly raised three-quarter view. A person seated on the floor in the 90/90
> position: front leg bent 90 degrees in front with the shin across the body,
> back leg bent 90 degrees out to the side. Both hands are planted on the floor
> beside the hips. The **front shin is lifted a few inches clear of the floor**,
> with the torso upright and not leaning back. The small gap under the front shin
> is the point of the drawing.

## `glute-bridge-single`

> Side view. A person lying on their back with one foot planted flat on the
> floor, knee bent. The other knee is pulled up and hugged into the chest with
> both hands. The hips are lifted high so the body makes a straight line from the
> planted knee through the hip to the shoulder. Shoulders stay on the floor.

## `copenhagen`

> Side view. A person in a side plank with the lower forearm on the floor, elbow
> under the shoulder. The **top leg is resting on a simple chair seat**, straight,
> supported near the ankle. The bottom leg hangs below with the knee down and
> resting on the floor. The hips are lifted so the body is in a straight line.
> The chair is a plain outline with no detail.

## `single-leg-rdl`

> Side view. A person balanced on one straight leg, hinged forward at the hip so
> the torso is nearly horizontal. The other leg reaches straight back behind at
> the same height as the torso, making one long line from the head to the back
> heel. Arms hang down towards the floor. The spine is long and flat, not
> rounded.

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

## `neck-isometric`

> Head-and-shoulders, three-quarter view. A person seated upright, one open palm
> placed flat against the side of their own head above the ear, elbow out. The
> head stays perfectly upright and level — pressing against the hand without
> moving. Only the head, neck, shoulders and the one arm need to be in frame.

## `bear-crawl`

> Side view. A person on hands and feet with the **knees hovering an inch off the
> floor**, hips low and level, back flat. Caught mid-step, with one hand and the
> opposite foot both lifted and moving forward. The small visible gap under the
> knees is the point — without it this is just a plank.

## `side-plank`

> Front-on-to-the-body side view. A person balanced on one forearm with the elbow
> directly under the shoulder, feet stacked one on top of the other, hips lifted
> so the body is one straight line from head to heels. The top arm rests along
> the side of the body or points straight up.

---

# Strength

**Read this before generating these.** `js/views/strength.js` currently draws no
figures at all — the lift is a form, not a routine, and there is no code that
would render one. These prompts are ready when you are, but shipping them is a
**view change as well as an art job**, and it is worth deciding first *where* a
figure would go (next to the movement name in the session list, most likely) and
whether it earns the space on a screen that is mostly numbers and buttons.

Each prompt draws the **middle** progression, not the easiest or hardest, so the
picture stays right as you climb the ladder.

## `pull-up`

> Front view. A person hanging from a simple horizontal bar overhead in an
> overhand grip, hands a little wider than the shoulders, pulled all the way up
> so the chest is at bar height and the elbows are down by the ribs. Legs
> straight and together, hanging still. The bar is a plain horizontal line.

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

## `archer-press-up`

> Front view from slightly above. A person in a press-up at the bottom, hands
> very wide. **One arm is bent with the chest lowered over that hand; the other
> arm is completely straight out to the side.** Body in one straight line from
> head to heels, hips level. The contrast between the bent and straight arm is
> the point.

## `inverted-row`

> Side view. A person lying face up underneath a low horizontal bar, gripping it
> overhand with both hands, pulled up so the chest touches the bar and the elbows
> are back past the ribs. The body is in one straight line from head to heels
> with the heels on the floor. The bar is a plain horizontal line.

## `nordic-curl`

> Side view. A person kneeling upright with the **ankles held down by a fixed
> anchor at the floor**, lowering forward under control with the hips locked
> straight so the body is one line from knees to head, caught about halfway down.
> Both hands are up and ready in front of the chest to catch. The straight line
> from knee to shoulder — no hip bend — is the point.

## `kb-swing`

> Side view. A person at the top of a kettlebell swing: standing tall, hips fully
> snapped through, both arms straight out in front at about chest height holding
> a **kettlebell** that is floating out at the end of the arms. Feet flat. This
> is the top of the swing, not a squat and not an overhead lift — the bell is at
> chest height, no higher.

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
