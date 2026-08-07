# JUJI — Design System

A handoff document. Everything below is **as-built**, extracted from
`css/app.css` and `js/ui.js`, not aspirational. If you are designing a new
screen for this app, this is the whole language.

- **Product name on screen:** `JUJI` (all caps, no space). The repo, file paths
  and internal identifiers are `JJ-app` — don't unify them.
- **What it is:** a personal BJJ training journal. Phone-first PWA, static, no
  build step, no framework, no dependencies. Plain ES modules and one 1.6k-line
  stylesheet.
- **Target device:** Android / Chrome, 360–430px wide. Design at **390px**, and
  check nothing overflows at **360px**.
- **Design language name:** *Stripe × Tatami* — rounded rectangles with a solid
  pressable edge underneath. Chunky, tactile, quiet.

---

## 1. Principles

These are not decoration; each one has already changed a design decision.

1. **The app reports what you wrote about, never what you're good at.**
   Note volume is attention, not skill. No screen may imply competence. Charts
   get a caption saying so.
2. **Capture friction is the product.** If logging a class gets slower, nothing
   downstream gets data. Any new step on the logging path needs a very good
   reason.
3. **Colour carries meaning, not mood.** See §2 — blue is action, ink is data,
   amber is a gap, green is a positive state, red throws work away. A colour
   used decoratively stops meaning anything.
4. **Length must never imply a small amount where there is none.** A zero value
   is drawn as a *full-width dashed amber* rail, not a 2px sliver.
5. **Depth is a tier, not a style.** The shadow offset under an element encodes
   its importance (§4). Don't invent a new depth.
6. **One CTA per screen.** It's the only element allowed to move on its own.
7. **Never render user content as HTML.** `h()` in `js/ui.js` makes text nodes.
   No `innerHTML`, ever.

---

## 2. Colour

Two full palettes. Light is the **default**; dark follows the OS *and* can be
pinned by the user (`html[data-theme="light"|"dark"]`). Both palettes are
written out literally in the CSS — there is no build step to factor them out,
and a JS-only switch would flash the wrong theme on boot.

### Tokens

| Token | Light | Dark | Job |
|---|---|---|---|
| `--bg` | `#f5f7fc` | `#0d0f14` | page |
| `--surface` | `#ffffff` | `#151821` | cards, nav bar, inputs |
| `--surface-2` | `#f1f4fb` | `#1d212c` | inner tiles, chips, inactive segments |
| `--edge` | `#dde2ee` | `#090b10` | the solid edge under cards/buttons |
| `--line` | `#edf0f7` | `#232838` | 2px separators inside cards |
| `--track` | `#e4e9f4` | `#232838` | empty tally cell / empty rail groove |
| `--text` | `#12172a` | `#e7e9ee` | primary type **and all data fills** |
| `--muted` | `#5f6980` | `#98a0b2` | labels, counts. 5.5:1 — do not lighten |
| `--sub` | `#5c6478` | `#98a0b2` | body copy inside cards |
| `--accent` | `#3a63f0` | `#6ea8fe` | UI / action only |
| `--accent-edge` | `#2544b8` | `#2e5fa8` | plunge edge under an accent fill |
| `--accent-soft` | `#e8edfb` | `rgba(110,168,254,.16)` | active nav pill, gi badge, accepted tags |
| `--on-accent` | `#ffffff` | `#0b1220` | label on an accent fill |
| `--warm` | `#f0a020` | `#f0b429` | gap / attention |
| `--warm-ink` | `#b47a0a` | `#f0b429` | amber *text* (4.6:1 on light) |
| `--warm-soft` / `--warm-line` / `--warm-tint` | `#fff6e5` / `#f7dfae` / `#fff8ec` | tinted alphas | amber card fill, edge, zero-cell |
| `--good` | `#1e8e68` | `#57caa0` | positive state |
| `--good-soft` | `#eaf9f3` | `rgba(87,202,160,.12)` | its tint |
| `--danger` / `--danger-edge` | `#d4483b` / `#a5342a` | `#f2685a` / `#b8412f` | destructive |
| `--dash` | `#cfd7e8` | `#394054` | dashed "not yet" outlines |
| `--btn-line` | `#dde2ee` | `#232838` | outline on a neutral button |

### The colour rules — these are the important part

- **Blue = UI and action.** Buttons, links, active nav, focus rings. Blue is
  never used to draw a measurement, because a blue bar could be mistaken for a
  UI element and vice versa.
- **Ink (`--text`) = data.** Tally squares, bar fills that represent counts,
  numbers. Data is drawn in the same colour as type.
- **Amber = a gap, or something waiting on you. Four jobs, no fifth:**
  the gap-prompt card, zero cells / zero rails, pending-or-failing sync, and
  nothing else. It carries no brand duty (the brand mark uses belt colours) so
  it stays unambiguous.
- **Green = a positive, unhurried state.** The gi/no-gi stat, the rest phase of
  a routine, the warm-up badge. Never a success *toast* colour — success is
  silent here.
- **Red = "this throws work away".** Exactly one caller: ending a routine
  early. It is *not* a warning colour — amber owns "waiting on you". A red that
  appears elsewhere stops meaning anything.
- **Belt colours are ranks, not UI colours.** `--belt-white` `#ffffff`/`#f2f4f8`,
  blue `#2352a8`, purple `#6b3fa0`, brown `#6b4423`, `--belt-black`
  `#15171c`/`#2a2e37`. Two traps solved: white vanishes on light and black on
  dark, so **every segment carries a `--belt-line` hairline**, and dark-mode
  black is `#2a2e37` rather than near-black (a true black bar reads as an empty
  outlined slot). Belt blue is deliberately darker than `--accent` so a rank is
  never mistaken for an action.

---

## 3. Typography

**Nunito**, self-hosted as one 39 KB variable woff2 (`fonts/nunito.woff2`,
weight 400–900). No CDN, no Google Fonts link — the phone is de-Googled and the
app must work offline. Users can swap the body face via
`html[data-font="system"|"serif"|"mono"]`; **the brand wordmark stays Nunito
regardless**, because it is identity, not body copy.

Base: `16px / 1.5 / weight 500`.

### The weight rule

**Weight goes UP as type gets smaller.** Tight negative tracking is half of what
makes a heavy face read as dense, so tracking loosens as weight drops.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| `.page-title` | 1.85rem | 600 | −.015em |
| `h2` | 1.3rem | 600 | −.01em |
| `.section-head h3` | 1.05rem | 600 | −.01em |
| `h3` | 1rem | 600 | — |
| body | 1rem | 500 | — |
| `.page-sub` | .92rem | 600 | — |
| card body / `.entry-body` | .88rem | 500–700 | — |
| `.small`, `.empty` | .85–.9rem | 700 | — |
| `.card-title` (eyebrow) | **11px** | **800** | .6px, UPPERCASE |
| `label` | 11px | 800 | .6px, UPPERCASE |
| tab label | .62rem | 800 | .05em, UPPERCASE |
| `.btn` label | inherit | **900** | — |

Numbers that sit in columns use `font-variant-numeric: tabular-nums`. Always.

---

## 4. Shape and depth

Radii are tokens; pick the one that matches the element's size, don't invent.

```
--r-card  22px   cards
--r-panel 20px   buttons, banners
--r-input 16px   inputs
--r-tile  14px   inner tiles, squircle buttons, toast, segmented control
--r-chip  10px   tags
--r-cell  10px   grid cells
```

Spacing: `--pad: 16px` (view gutter + card padding is 18px), `--gap: 15px`
between blocks, `--tabbar-h: 60px`.

### The depth tiers

Elevation is a **solid colour offset shadow** — `box-shadow: 0 Npx 0 <edge>` —
never a blur. Pressing collapses it to `0` and translates the element down by
the same N, so the surface literally lands on its edge. Transition is
`.09s var(--spring)`.

| Depth | Used by |
|---|---|
| **7px** | `.btn.cta` — the one CTA per screen |
| **5px** | `.card`, `.banner`, `.btn`, `.btn.primary` |
| **4px** | `.avatar-btn` (the 42px squircles in the brand row) |
| **3px** | `.btn.small`, `.seg`, inputs, `.note-card`, `.exp-row` |

An alternate flat mode exists (`html[data-btn="ios"]`): 14px radius, a 1px soft
shadow, and press becomes `scale(.98) + brightness(.94)`. Any new pressable
component should get a rule in that block too.

---

## 5. Components

Class names are **stable and must not be renamed** — the smoke tests and the
position×role coverage chart key off them.

**Card** `.card` — `--surface`, radius 22, 5px edge, 18px padding, 15px bottom
margin. `a.card` must set `display: block` (an inline anchor collapses the
background to slivers — this was a real shipped bug).
`.card.warncard` is the amber variant.

**Eyebrow** `.card-title` — 11px/800 uppercase muted label, at the top of a card
or floating above one.

**Section header** `.section-head` — h3 left, small 800-weight action link right,
baseline-aligned, `24px 0 10px`.

**Buttons** `.btn` — 52px min height, 16/18 padding, radius 20, 2px
`--btn-line` outline (without it a white button on a white card is invisible),
weight 900.
`.primary` accent fill · `.wide` full width · `.small` 44px, radius 12, 3px edge
· `.danger` red fill · `.cta` 20px padding, 1.1rem, 7px edge, and a slow
`breathe` animation.

**Segmented control** `.seg` — flush buttons in a `--surface-2` trough,
3px edge, active button gets an accent fill. `aria-pressed` carries state.

**Inputs** — 13/14 padding, 2px `--line` border, radius 16, 3px edge. Focus
swaps the border to accent and adds `0 0 0 4px var(--accent-soft)` — a soft
ring, **never a hard outline**.

**Tags** `.tag` — `--surface-2` chip, radius 10, .8rem/700. Variants:
`.suggest` (dashed accent outline — an offer, not a fact), `.add` and
`.concept` (dashed `--dash` — "not yet"), and `.tags.accepted .tag` (accent
tint — on the entry). **Dashed always means provisional or absent.**

**Banner** `.banner` — icon + text + action, one line, text truncates with
ellipsis. `.warn` is the amber variant. One documented exception where `.b-txt`
wraps instead of truncating: the "lift after class, never before" rule, because
a truncated rule is worse than no rule.

**Tab bar** `.tabbar` — 5 tabs (Home · Log · Off mat · Map · Library), `position:
fixed` with matching body padding, `box-shadow: 0 -3px 0 --navline`. The active
tab gets `aria-current="page"`, accent colour, `stroke-width: 2.2`, and a tinted
`--accent-soft` pill that springs in behind the icon (`::before`, scale .55 → 1).

**Toast** — fixed, centred above the tab bar, inverted (`--text` bg, `--bg`
type), radius 14, the only blurred shadow in the app.

**Squircle button** `.avatar-btn` — 42×42, radius 14, 4px edge. Carries a status
dot: `.pending` amber dot, `.warn` full amber fill. When both apply, **warn
wins** — they share one corner and the worse state takes it.

---

## 6. Data display

The sacred one is **position × role coverage** — a gap is an empty cell next to
a full one, and that asymmetry is the entire thesis of the product. Do not
flatten it into a tag list, ever.

- **Tally** `.tally` — 20 discrete cells, 15px tall, 3px radius, filled from a
  real percentage. Fill is `--text`. Cells reveal left-to-right on a stagger;
  **never animate a width**.
- **Heatmap** `.heat` — position rows × role columns, opacity encodes volume.
  A zero cell is a **dashed amber cell**, never a faint blue one. The role axis
  is only the roles the shown positions actually use (a fixed 4-column axis was
  tried and dropped — it filled Side Control and Mount with "not applicable"
  dots). It scrolls sideways inside its own box with row labels `position:
  sticky` — **the page never scrolls horizontally**.
- **Coverage rails** `.cov-row` — label / rail / count. A zero role is a
  **full-width dashed amber rail**. The fill is accent with a diagonal stripe
  overlay and animates its width over `.8s` on first paint.
- **Trend strips** — scaled **per row, not across the card**: "how did this
  position's months compare to each other" is the readable question. Minimum
  alpha for a non-zero month is **0.34** — anything lower and one entry looks
  like zero.
- **Calendar** — a day can carry three marks at once: class (fill), lift (top-
  right corner tick, blue), mobility (bottom-left corner, green). One calendar,
  not three.

Every chart carries a line of copy saying it measures attention, not skill.

---

## 7. Motion

One easing token for everything: `--spring: cubic-bezier(.2,.9,.25,1.15)`.

| Move | Timing |
|---|---|
| button press | .09s |
| chip/segment state | .16s |
| nav pill spring | .3s |
| screen entrance `fx-rise` | .34s, 12px up + fade |
| tally cell `fx-cell` | .22s, scale .7 → 1 |
| chip `fx-pop` | .3s, .85 → 1.06 → 1 |
| rail fill | .8s width |
| CTA `breathe` | 2.6s, scale 1 → 1.02 |

**Screen entrance** is a staggered cascade over `.view > *` at 50ms steps,
capped at .3s from the 7th child. The router rebuilds those nodes on every
route, so it re-fires with zero JS.

**Two hard-won rules:**
- Entrance animations fill **backwards only**. A `forwards` fill freezes the
  buttons' 3D press mid-air.
- The CTA's breathe **holds at rest for 45% of its cycle**. An element that
  never stops moving is never "stable" for a test runner and never quite ready
  to be tapped.

`prefers-reduced-motion: reduce` disables every animation and transition
explicitly, by selector, at the bottom of the stylesheet — **and any new
animated component must be added to that list.** The target is literally zero
running animations.

---

## 8. Iconography

Line icons, drawn as inline SVG in `SHAPES` (`js/ui.js`): 24×24 viewBox,
`fill: none`, `stroke: currentColor`, `stroke-width: 1.8`, round caps and joins.

Current set: `user pin calendar search video chevron plus cloud edit star mic
trash undo flame cards sound soundOff sliders`. Tab-bar icons are inline in
`index.html` rather than in `SHAPES`.

**Two or three strokes each. That is the constraint, not a coincidence.** Two
icons have been thrown out for breaking it: an 8-tooth cog (uneven and soft at
the 21px it shipped at — replaced by three rails and three knobs) and a stick
figure whose arms and legs merged into an asterisk at 21px.

**Judge every icon rendered in place, at real size.** A kettlebell reads as a
handbag; a rolled mat reads as a toggle switch; a flex arc reads as a
trending-up arrow. None of that is visible at 24px in isolation.

Sizes: 21px in a squircle, 22px in the tab bar, 20px in a CTA, 14–19px inline.
`.btn svg` is sized globally — an unsized SVG renders at natural size and
swallows the button.

---

## 9. Accessibility

- `--muted` is 5.5:1 on white and 5.9:1 on the dark surface. **Do not lighten
  it.** `--warm-ink` exists solely so amber text clears 4.6:1.
- Never encode meaning in colour alone: zero cells are *dashed as well as*
  amber; belt segments carry a `title` and the group an `aria-label`.
- `[hidden]` is forced with `display: none !important`, because the UA rule is
  specificity 0,1,0 and any later class setting `display` silently beats it.
- Anything hidden by `backface-visibility` on a flipped card must also be
  `inert` — the eye can't see it but the keyboard and screen reader can.
- Live regions use `.sr-only`; state changes are announced, ticking seconds are
  not.
- Minimum tap target 44px (`.btn.small`); the standard button is 52px.

---

## 10. Voice and copy

Plain, second person, lower-case-ish, never congratulatory. The app doesn't
cheer. Examples that set the tone:

- "Nothing was logged — this is just the cool-down."
- "General guidance, not physio."
- "This shows what you've written about, not what you're good at."
- Empty states describe the absence, they don't sell the feature.

Uppercase is for labels and eyebrows only, and **it is applied in JS when a
string mixes cases** — `text-transform: uppercase` on `"10s ready"` gives you
`10S READY`, which is wrong, and one CSS transform cannot produce mixed case.

---

## 11. Working constraints a designer should know

- **No build step, no dependencies, no framework.** Anything requiring npm on
  the user's machine is the wrong answer; they edit this repo from a phone.
- **No binaries where text will do.** Figures are inline SVG paths, beeps are
  synthesised from an `AudioContext`. The app must stay small and offline.
- **`sw.js` precaches the shell** — every byte added to CSS/JS is a download on
  every update. `js/stretch-art.js` is already 120 KB of path data; a second
  doubling would not be acceptable.
- **Bump `CACHE` in `sw.js` and `VERSION` in `js/version.js` together** on any
  change to `js/` or `css/`. The footer number only means "latest" when they
  match.
- Screenshot-check new work in **light and dark**, at **390px and 360px**, and
  confirm **zero running animations** under `prefers-reduced-motion`.
