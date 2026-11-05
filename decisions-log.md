# ALLOY — Decisions Log

Running record of implementation decisions made while building, as required by
plan §18.

**Scope note, stated plainly:** this file was **created in Task 1.1**. Plan §18
expects it to exist from the start, but it did not. It therefore records
decisions from Task 1.1 onward only. Earlier Phase 0 decisions were not
reconstructed here — inventing a history that was never written down would be
worse than an empty start, and the Phase 0 reports already record what was
decided in Phase 0.

A decision belongs here when it is a judgement call that (a) the governing
documents do not settle, and (b) a later task could reasonably need to revisit.
Locked product decisions from plan §16 do not belong here; they belong to the
plan.

---

## Task 1.1 — Design tokens

### D1.1.1 — Token values are adopted from the project's existing palette

**Context.** Plan §4 names materials and six functional colour families, and
hardware spec §5 maps them to controls, but neither document gives numeric
values for the panel materials or the functional families. The hardware spec
gives exactly one numeric anchor: the lamp glow range `#e8a454`–`#f0c27a`
(§4a).

**Decision.** Rather than invent a new palette, the token values were taken from
the project's own earlier palette in
`archive/documentation-site/lib/colors.ts`, which already carried the six
functional families with `base`/`hi`/`lo`/`ink` roles. The lamp token
(`--al-material-lamp: #edb268`) sits inside the spec's stated range. Panel,
text and border values were derived to sit around those anchors.

**Why.** ALLOY should have one palette, not two. The archived palette is the
project's own prior art and already encodes the cap-shading roles the hardware
spec's knob description requires.

**Reversible.** Yes — every value is a single declaration in
`src/lib/tokens.css`. Repainting the whole product means editing that file.

### D1.1.2 — `/dev/components` is a hash route, not a path route

**Context.** The task specifies the route `/dev/components`. The application is
hash-routed (`#/console`, `#/arrange`, `#/mixer`) — a locked Phase 0 decision so
the single-file build works on any static host without server rewrites.

**Decision.** The playground is reached at **`#/dev/components`**. It is a
distinct route value in `src/lib/rooms.ts` (`routeFromHash`), it is absent from
`ROOMS`, and the room navigation never links to it.

**Why.** A literal `/dev/components` path would either break on static hosting or
require history-API routing, which would change a locked decision for every
route in the app. The substance of the requirement — a private, directly
reachable, unlinked review surface — is fully met by the hash form.

**Reversible.** Yes, and cheaply: if real path routing is wanted later, it is one
routing change plus host configuration, and this page needs no modification.

### D1.1.3 — Token values are read from the live document, not imported

**Context.** The playground must show each token's actual value without keeping a
second copy that can drift.

**Decision.** `src/lib/tokens.ts` holds **metadata only**: name, label, category,
usage and provenance. No values. The page calls `readTokenValues()`, which reads
`getComputedStyle(document.documentElement)` for every registered token, so the
value displayed is the value the stylesheet computes.

**Why.** It makes drift structurally impossible for the *values*, and
`npm run check:tokens` makes drift impossible for the *set* of tokens: the
registry and the stylesheet must list exactly the same names in both directions.

**Reversible.** Yes.

### D1.1.4 — Tokens are declared globally but applied nowhere yet

**Context.** The tokens live on `:root`, so they exist on every page, including
the three rooms. Applying them to the rooms is Phase 2 work and out of scope.

**Decision.** `tokens.css` declares custom properties and nothing else — it
imports no rules that would restyle anything. Applying the tokens to the Console,
Arrange and Mixer rooms is expressly deferred to Phase 2, and
`npm run check:tokens` fails if `var(--al-` appears in any room or room
component.

**Why.** It gives the token system a single load point without smuggling a skin
into Phase 1.

**Reversible.** N/A — this is a boundary, not a preference.

### D1.1.5 — No web fonts; both type stacks resolve through the OS

**Context.** Plan §4 asks for compact industrial/condensed typography for
engraved labels and highly readable text elsewhere. The plan forbids adding
dependencies, and the build must work offline.

**Decision.** `--al-font-label` and `--al-font-ui` are system stacks only: a
condensed grotesque preference (`Roboto Condensed`, `Arial Narrow`,
`Helvetica Neue Condensed`, …) falling back to the system sans.
`--al-font-mono` handles tabular numbers.

**Consequence, stated honestly:** the condensed label face will not render
condensed on every host machine — it renders condensed where one of those faces
is installed and falls back to the system sans elsewhere.

**Open for the owner.** If an exact engraved face is required across all
machines, one font file must be vendored into the repository. That is a
dependency decision and is deliberately not taken here.

**Reversible.** Yes — the family tokens are one declaration each.

### D1.1.6 — Spacing tokens are in px; type tokens are in rem

**Context.** The scale has to serve dense control surfaces and readable
supporting content.

**Decision.** Spacing is px (panel dimensions must not rescale with the user's
text-size setting). Type sizes are rem (interface text must honour the user's
setting). Smallest spacing step is 2px, largest 48px, with the fine end of the
scale at 2/4/6/8px where control insets live.

**Reversible.** Yes.

---

## Task 1.3 — Fader

### D1.3.1 — The fader's law is a console audio taper, as data, with linear as the fallback

**Context.** Hardware spec §3 and the task brief specify the cap, the slot and
the tick marks, but neither says how a value maps to the cap's travel. Plan §9
defers every numeric audio value to listening tests, so no gain law is agreed.
The owner was asked before any code was written and chose the console taper
over a linear travel.

**Decision.** The mapping is a breakpoint table, `CONSOLE_TAPER`, exported
from `Fader.svelte` and passed as the `taper` prop: unity sits at 73% of the
travel, the top decade has the most room, the bottom of the scale is
compressed. Both directions (value → position, position → value) go through
the same table, re-normalised to the instance's `min`/`max`, so a narrower
range keeps the same law over its own travel. `taper = null` gives a linear
law. The printed majors are the table's own breakpoints, so the scale is
always true to the law in force.

**Numbers are a demonstration law.** −60 … +10 dB and the breakpoint positions
were chosen to look like a long-throw channel fader; they are not an agreed
audio-processing decision and are labelled as such in the playground.

**The bottom of travel is a finite `min`.** A real channel fader ends at −∞
(off). Representing "off" touches numeric entry, keyboard stepping,
`aria-valuemin`, display, and the DSP's idea of mute; those are product rules
for the audio-wiring task, not for a visual component with local state. Until
then the demo range's floor is −60 dB and is printed as −60. Adding an "off"
segment later is one extra breakpoint plus a display rule; the artwork does
not change.

**Reversible.** Yes — the law is a prop; swapping tables or going linear
touches no artwork.

### D1.3.2 — Shift means fine: precision-limited, not step-snapped

**Context.** The knob's convention is Shift = one tenth of a step for the
keyboard and 0.2× speed for a drag. In the knob every write is then snapped to
the step grid, which for most `step`/`decimals` pairs (e.g. step 0.5, one
decimal) snaps a fine nudge straight back to where it started — Shift+Arrow is
a no-op there.

**Decision.** In the fader a fine write (Shift held, keyboard or drag) skips the
step grid and is limited only by the display precision, so Shift+Arrow moves
by the smallest displayable amount and a Shift-drag lands between steps. The
knob was **not** changed — it is approved and out of scope — and the
discrepancy is recorded in the Task 1.3 report as a follow-up for a knob
maintenance task.

**Reversible.** Yes — one boolean parameter on `setValue`.

### D1.3.3 — Fader caps are cream, and only cream

**Context.** Hardware spec §5 places fader caps in the cream / off-white family
alongside input trim. The knob needed six families; nothing in the governing
documents gives a fader a second colour.

**Decision.** `Fader` has no `family` prop. The cap's three roles are read from
the cream tokens directly. If a master or return fader later needs another
colour, adding a `family` prop is a three-line change that follows the knob's
API; it was not added speculatively.

### D1.3.4 — Size: one host-settable width, travel as a prop

**Context.** "Compact enough for a future channel strip" needed a number. The
Phase 0 Console strip is 6rem wide with 0.375rem padding (84px inside).

**Decision.** The drawing is 72 units wide at 1× and scales as a whole from
`--fader-width` (default 4.5rem = 72px), which the component reads from its
host and never declares itself, so a strip or the playground sizes it from
outside. Travel between the limits is the `travel` prop (160px at 1×); the
slot, print and focus ring derive from it. The cap is 36 × 13 (2.77 : 1).

**Reversible.** Yes — both are single numbers.

### D1.3.5 — The fader cap is 25 × 20, by owner direction, overriding spec §3's proportion

**Context.** Hardware spec §3 asks for a cap "noticeably wider than tall
(roughly 2.5 : 1 to 3 : 1)". The first build was 36 × 13 (2.77 : 1). In
review the owner asked for the cap to be narrower and taller, was shown four
sizes mocked in the running page (36 × 13, 30 × 12, 28 × 16, 25 × 20) with
the spec conflict stated against each, and chose **25 × 20** (1.25 : 1,
wide-to-tall — still wider than tall, but half the spec's minimum ratio).

**Decision.** `CAP_W = 25`, `CAP_H = 20`, `CAP_RX = 5`. The finger-hollow
profile, its gradient stops, the light model and every other dimension are
unchanged; the hollow simply runs across a taller cap. `check:fader` pins
the owner's size, so a later task reading spec §3 cannot "correct" it back
without coming to the owner.

**Also by owner direction, round 2:** no shaft is drawn above or below the cap
(spec §3's "visible shaft" bullet). Both deviations are recorded in the Task
1.3 report.

**Reversible.** Yes — three constants.

### D1.3.6 — The fader cap is the owner's photo: ribbed, 25 × 32, cream

**Context.** In review round 4 the owner supplied a photo of the cap they
want (`uploads/the flaws-2.png`): a console fader cap taller than wide
(≈ 48 × 61 px in the photo, ≈ 4 : 5), neutral light grey, with a bevelled
rim, a concave face moulded with horizontal grooves, and a dark indicator
line across the middle. Asked two questions before coding: proportion
(match the photo at 25 × 32, or keep round 3's 25 × 20) → **match the
photo**; colour (the photo's neutral grey, or the cream family of spec §5)
→ **cream**.

**Decision.** `CAP_W = 25`, `CAP_H = 32`, `CAP_RX = 3`, rim 1.5, face
22 × 29, indicator line 2 units tall across the face at the cap's centre,
four grooves above it and four below at a 3-unit pitch (1.2 cut + 1 lit
wall). The face is one vertical gradient: shaded above the line, lit to
near the HI tone below it — the photo's distribution, which is also what a
concave face does under the panel's top-left light. Colours are the cream
tokens plus neutral black/white alphas; nothing new. The finger-hollow of
hardware spec §3 (two lips, pooled hollow) is **replaced**, and the 2.5–3 : 1
proportion is overridden further than in D1.3.5. `check:fader` pins 25 × 32
and the ribbed structure.

**Reversible.** Yes — the cap is one group of rects and two gradients; the
slot, print, law and interactions were not touched.

## Task 1.4 — Tactile switch

### D1.4.1 — Switch caps are the cream family, by owner choice

**Context.** Hardware spec §2 fixes the cap's shape and finish (square,
15–20% corners, glossy for the cap-labelled variant, matte for the
panel-labelled one) but not its colour; §5's colour table covers knobs and
fader caps and only says the engaged lamp is red or amber "regardless of the
switch's own function color". Asked before coding, with three options (cream
caps with dark print, as the eql/phase buttons in the owner's Neve module
photo; dark charcoal caps with light print; a per-function `family` prop like
the knob's), the owner chose **cream**.

**Decision.** Both variants take `--al-function-cream-{hi,base,lo}` through
`functionToken("cream", …)` and print in `--al-text-on-cream`. There is no
`family` prop. If function-coloured switch caps are wanted later, the cap's
three custom properties are the only thing to vary.

**Reversible.** Yes — three `style:` lines on the component root.

### D1.4.2 — The switch is a native button rendered with layered CSS, not an SVG

**Context.** The knob and fader are SVG drawings. Spec §6 allows "SVG or
layered CSS gradients". A push-button has platform semantics an SVG would
have to re-implement: Space activates on key-up, Enter on key-down, focus
and `aria-pressed` are native, and the label is real text.

**Decision.** The control is `<button type="button" aria-pressed>`; the cap,
seat, well, wall, drop shadow, print and lamp are layered CSS gradients,
inset/outset box-shadows and two pseudo-elements, scaled as a whole from one
host-settable length (`--switch-size`, 1.75rem = 28px at 1×) exactly as the
fader scales from `--fader-width`. Every tone is a token or a neutral alpha;
the structure check enforces the layering so a later task cannot flatten it.

**Reversible.** Yes — the host contract (props, data attributes, the size
variable) does not depend on the rendering technique.

### D1.4.3 — The engaged lamp lives inside the switch until Task 1.6

**Context.** The brief: do not begin Task 1.6's reusable lamp unless the
architecture already provides one. It does not — Phase 0 has no lamp, and
`--al-material-lamp` is the only lamp-related token.

**Decision.** `switch__lamp` / `switch__lens` are drawn inside
`TactileSwitch.svelte`, as presentation (`aria-hidden`; the state is the
button's `aria-pressed`). The lamp is self-contained — its own custom
properties (`--f-lamp-core/body/edge/glow`), its own bezel, lens, glow and
spill — so Task 1.6 can lift it into a `Lamp` component without redrawing
it. Amber uses `--al-material-lamp` (the incandescent token, inside spec
§4a's range) with the amber family round it; red uses the red family.

**Reversible.** Yes — one span pair and ~70 lines of CSS, by design.

### D1.4.4 — The print scales with the switch; the lamp sits beside the cap on the right

**Context.** The knob and fader keep their label and readout at token sizes
whatever the control's scale, because those are interface text. A switch's
print is different: the cap label is ink on the cap, and the panel labels
are engraving round the well — physically part of the control.

**Decision.** The three print sizes derive from `--switch-size` (10 / 11 /
10 px at 1×, the 2xs / xs steps) so an enlarged switch shows enlarged print.
The lamp is to the right of the cap, level with the resting cap's face, at
a fixed 6 px gap; the print is centred on the well and may be wider than it
without pushing the lamp away. No `disabled` state is built — the brief asks
for default, pressed and engaged only — and no lamp-position option exists
until a layout needs one.

**Reversible.** Yes — three `calc()` lines and one grid template.

## Task 1.5 — Analog VU meter and LED segment ladder

### D1.5.1 — Two components, no shared code, no "mode"

**Context.** The brief forbids one configurable meter with an LED look on the
VU face. The two things share nothing but the word "meter": one is a card,
a bulb and a moving needle; the other is a column of discrete lamps.

**Decision.** `VUMeter.svelte` and `LedLadder.svelte` are separate files in
`src/components/hardware/`, each with its own module-level scale constants
and its own fixture. Neither imports the other and neither has a `variant`
or `mode` prop. `check:meter` asserts the separation (no cross-reference,
no cream, lamp token, wash, vignette or turbulence in the ladder; no
`crispEdges`, segments or green family in the VU meter).

**Reversible.** Yes — nothing depends on a shared base; a later common
"meter housing" would be an extraction, not a rewrite.

### D1.5.2 — The VU scale is the standard VU law, −20 to +3, red from 0

**Context.** Spec §4a names the scale's parts (arc, ticks, numerals at key
points, red upper range, "VU") but not its numbers or its law. A real VU
meter's needle is linear in modulation percentage, not in dB — the marks
crowd toward the left and open out toward 0, which is what makes a VU scale
look like a VU scale.

**Decision.** `vuPosition(db)` = (pct(db) − pct(−20)) / (pct(+3) − pct(−20))
with pct = 100·10^(db/20); the needle sweeps 90° (−45° to +45°) about the
pivot, so −20 → −45°, −7 → −21.2°, 0 → +16.7°, +3 → +45°. Marks at −20, −10,
−7, −5, −3, −2, −1, 0, +1, +2, +3 with minor ticks between; numerals at −20,
−10, −7, −5, −3, 0, +3 only; the red band and red numerals from 0 to +3.
The level prop is clamped to the end stops: the needle cannot leave the
scale. Levels are demonstration numbers only; no metering law (reference
level, integration time) is implied or implemented — that is Phase 2 work.

**Reversible.** Yes — the marks table and the two constants.

### D1.5.3 — The incandescent glow is three blurred blobs, not a gradient; the drift is on by default

**Context.** Spec §4a is explicit: warm, soft, diffuse, uneven, brightest
near a lower-centre bulb, a slightly irregular vignette, asymmetric
falloff; never a flat fill, never one uniform hard-edged radial gradient.
A radial gradient, however soft, is a perfect concentric circle and reads
as a backlight.

**Decision.** The light is painted: three irregular Bézier blobs of the lamp
token (`--al-material-lamp #edb268`, inside the spec's `#e8a454`–`#f0c27a`)
under Gaussian blurs of σ 13 / 8 / 16 units on a 106 × 68 card — a pool low
and centred, a hotter core a little left of the axis, a faint third pool
up in the right — over a translucent cream wash, with a frosted
`feTurbulence` grain and an off-centre radial vignette that is transparent
across the middle. The bulb's slow brightness drift (two keyframe loops of
9.7 s and 6.3 s, opacity 0.972–0.992, within the spec's "barely perceptible")
is **on by default** (`lampDrift`), because the spec lists it as the thing
that separates a bulb from a fill; it is disabled when the lamp is off and
under `prefers-reduced-motion`, where the needle's swing also shortens
from 360 ms to 120 ms. Unlit, the same card is cream in shadow
(`cream 46% / black`) with the print still legible — everything the bulb
adds is the difference between the two.

**Reversible.** Yes — the three paths and five numbers; the drift is one
prop.

### D1.5.4 — The ladder's colours come from the function families; nothing is added

**Context.** §4b asks for green, amber-yellow and red segments. The Task 1.1
tokens already define each as a HI / BASE / LO family for exactly this kind
of indicator; `check:tokens` guards parity.

**Decision.** A lit segment is a vertical gradient HI→BASE→LO-ish
(`hi 70%` / `hi 22%` / `base 78% + lo`) of its band's family, a hairline
specular on its top edge, a hard 0.5-unit black seam, and a tight σ 1.7
bloom behind it; an unlit segment is the band's LO tone sunk into the
recess (`lo 30% / recess`) with the same seam — still visibly a lamp of
that colour, visibly not lit. No token was added and no colour is written
into the component (`check:meter` scans for hex colours other than neutral
black/white alphas).

**Reversible.** Yes — the gradient stops.

### D1.5.5 — A 16-segment demonstration scale, −40 to +4, not an agreed metering scale

**Context.** §4b does not fix the segment count or the thresholds; the real
scale is a Phase 2 metering decision (reference level, peak vs RMS, hold).

**Decision.** The default scale is 16 segments: nine green (−40, −30, −24,
−20, −16, −13, −10, −8, −6), four amber (−4, −3, −2, −1), three red (0, +2,
+4), numerals at −40, −20, −10, −6, −3, 0, +4 in the fader's convention.
Segments light cumulatively from the bottom by one counting function
(`ledLitCount`), so a lit set is contiguous by construction. The `segments`
prop takes any ascending list with the same band type, so the Phase 2
scale replaces this one without touching the drawing. The numbers are
placement for the demonstration only and are labelled so on the page.

**Reversible.** Yes — the table.

### D1.5.6 — Sizes: VU 120 × 84 at `--vu-width` 7.5rem; ladder 48 × 131.5 at `--ladder-width` 3rem

**Context.** The brief asks for readable scales "at the intended sizes" and
the plan puts the master VU pair in the Console room at roughly the width of
two channel strips; the ladder is a secondary indicator a strip wide.

**Decision.** Each component is one SVG scaled as a whole from a
host-settable width, like the fader: the VU meter is drawn at 120 × 84
units and shown at 7.5rem (120 px) by default, where the numerals are
6.6 px and still separate; the ladder is 48 units wide and
`4 + 16·7.5 − 2.5 + 2·3 + 4 = 131.5` tall for 16 segments (it grows with
the count) at 3rem. The playground shows the VU meter at 1×, 1.5×, 2× and
2.5× and the ladder at 1.25×, 1.5× and 2.5×; nothing in either is sized in
px by the page.

**Reversible.** Yes — two custom properties.

### D1.5.7 — The ladder's printed numerals are unsigned, by owner direction (review round 1)

**Context.** The first review build printed the ladder's scale as tick,
sign, number (`– −3`, `– +4`); the owner read the sign as a second tick and
asked for the −/+ signs to be removed from the print.

**Decision.** The printed scale is tick, number: `40 20 10 6 3 0 4`
(`printed(db) = |db|`). The sign is kept where it carries meaning rather
than ink: the spoken `aria-valuetext` ("−3 dB, 11 of 16 segments lit,
amber") and the playground captions ("simulated −20 dB → 4 of 16 lit").
`check:meter` asserts both halves.

**Reversible.** Yes — one function.

## Task 1.6 — Engraved label and lamp-glow indicator

### D1.6.1 — The engraving's light falls the other way from the approved print's shadow

**Context.** The five approved components print their legends with the
family stack `text-shadow: 0 1px 0 rgba(0,0,0,.9), 0 -0.5px 0
rgba(255,255,255,.06)` — a dark copy *below* the glyph and a faint light
copy *above*. Under the family's top-left key light that is the shading of
something standing proud of the panel (its top edge catches the light, it
casts down). Plan §4 asks for lettering "engraved or machined into the
panel". A groove under the same light has its *upper* wall in shadow and
its *lower* wall lit.

**Decision.** `EngravedLabel` casts the dark copy up (`0 -depth 0
rgba(0,0,0,.85)`) and the lit copy down (`0 +depth 0
--al-text-engraved-highlight`), with `depth = max(1px, 0.07em)`, and adds
a floor copy whose paint darkens along the top of every stroke. The paint
itself is unchanged (`--al-text-secondary`, label face, bold, engraved
tracking), so beside an approved component the lettering is the same ink at
the same size; only the one-pixel walls differ. The approved components are
not modified in this task; migrating their prints (and the switch's lamp,
D1.4.3) to the shared components is recorded as remaining work for the
Phase 1 review to decide.

**Reversible.** Yes — the two shadow lines and one span.

### D1.6.2 — The Task 1.1 engraving tokens are an unpainted "cut" finish for titles only

**Context.** `--al-text-engraved #16150f` / `--al-text-engraved-highlight
#4a4d45` were defined in Task 1.1 as "dark fill + 1px lighter edge" and
never used; the Task 1.2 report noted the dark fill is invisible on the
dark panel (1.14 : 1 against `--al-material-panel`). Every approved
component prints light paint instead.

**Decision.** The default finish is `filled` — paint in the groove — and it
is the only finish for anything small. The token pair is offered as
`finish="cut"`: no paint, the engraved fill with its lit lower wall, the way
the tokens describe it. It is legible only by its highlight edge (L* 32
against the panel's 13), so it is restricted by convention to `lg` / `xl`
module titles and shown once in the playground above the filled cut of the
same words, for the owner to keep or drop. The highlight token is used by
every label, as the lit wall.

**Reversible.** Yes — one modifier class.

### D1.6.3 — The lamp's layout box is its housing, sized from the glass

**Context.** The switch sizes its lamp as 0.36 × the switch; a shared lamp
needs one length of its own that a legend can centre on.

**Decision.** `--lamp-size` is the glass diameter (0.625rem = 10 px at 1×,
the switch's lamp); the recess is 0.1 × and the ring 0.16 × of it, never
under 1 px; the component's box is glass + 2 × (recess + ring) so the
painted housing is exactly where the box is (first build had the housing
overflowing its box by recess + ring to the right and down; measured and
fixed before review). The ring is the housing's *padding* under a 135°
metal gradient, not a border, because Chromium snaps border widths to whole
device pixels and would shift the glass.

**Reversible.** Yes — a custom property and two proportions.

### D1.6.4 — Red is the same lamp, one step stronger; nothing else is a lamp colour

**Context.** Spec §5 reserves red for warnings and peaks; the brief forbids
new semantic colours.

**Decision.** `color` is `"amber" | "red"`, typed, nothing else. Both use
one set of layers; red differs only in its family tokens
(`--al-function-red-{hi,base,lo}`), a spill at 0.62 opacity instead of
0.50 and a near glow 1.3 × wider — a warning lamp is seen from further
away. Measured on the panel at 16 px glass: amber lights the panel +15 L*
at 6 px from its housing, red +9 but its spill reaches as far; the red
glass is darker (centre L* 71 against amber's 88) because the red family
is darker, so red reads as red, not as a brighter amber. Lit and unlit
differ by ≥ 45 L* at the glass centre in both colours and the lit lamp
adds a glow and a spill, so the state never rests on hue alone; the state
is also in the accessible name.

**Reversible.** Yes.

### D1.6.5 — The floor copy is a real span, so a filled label's `textContent` holds the text twice

**Context.** The shaded floor needs a second copy of the text with a
gradient clipped to the glyphs. A `::after` with `content: attr(...)` would
keep the DOM clean, but generated content is exposed to some assistive
technologies and cannot be reliably hidden from all of them.

**Decision.** The floor is `<span class="label__floor" aria-hidden="true">`
inside the label: hidden from assistive technology by attribute, not
selectable, no pointer events. The cost is that `element.textContent` of a
filled label is the text twice; tests and any future code that reads a
legend from the DOM must read the element's first text node, its
`aria`/`title`, or the component's `text` prop. The `cut` finish renders no
floor.

**Reversible.** Yes.

### D1.6.6 — The lamps are re-shaded in four layers lit from the top-left; the glow is the panel spill alone

**Context.** After the Task 1.6 commit the owner directed a re-shading of
the round lamp indicators — the shared `Lamp` and, by explicit instruction,
the approved `TactileSwitch`'s built-in lamp — changing only shading and
glow: no size, colour, label, position or on/off logic. The old look had
light from several directions at once (a bezel lit top-left, a drop shadow
below, a glass specular at 36% 30%, a hot core at 48% 44%, an inset shadow
from the top, and a second "near" glow ring-shadowed round the glass). On
the switch the spill was also painted *over* the lens and bezel: the lamp
has a `transform`, so its `::after` spill sat above the lens in tree
order, tinting the glass and hiding the ring.

**Decision.** Both lamps are the same four layers, bottom to top, lit from
the top-left: (1) **bezel** — the existing metal tokens as a 135° gradient,
metal warmed to white at the top-left edge, metal-shadow deepened to black
at the bottom-right; no drop shadow, no hairline; (2) **recess** — the
existing full gap ring, exactly its old size and place, filled with a 135°
gradient of the recess token: darkest top-left under the bezel's lip,
slightly lighter bottom-right (70% recess/black → recess → 86%
recess/white); (3) **dome** — one radial gradient at 34% 30%: lit, the
family's core → body → edge; unlit, a 22% trace of the body colour into
the recess tone; no shadow or line on the glass edge; (4) **highlight** —
one small soft white ellipse on the top-left of the dome, 44% × 26% of the
lens, tilted −40°, blurred by 4% of the lens, opacity 0.22 off / 0.42 lit.
The ON glow is the existing panel spill, unchanged in reach, down-right
bias, blur and opacity; the near glow and its `--lp-near` factor are
removed, so D1.6.4's "red is a step stronger" now rests on the spill
opacity alone (0.62 vs 0.5). There is no `box-shadow` anywhere in either
lamp. On the switch the bezel and recess moved into `::before` (a 1px
transparent border round the unchanged padding box, ring as border-box
gradient, recess as padding-box gradient) so the spill can take
`z-index: -1` and lie under the bezel and glass as the shared Lamp's does;
the layout box is identical (12.078 px, lens at +1, +1). Every offset,
blur and gradient tone is derived from the indicator's own size (`--lp-size`
/ `--sw-lamp`, percentages of the lens) and its own family tokens.

**Reversible.** Yes — CSS only; the markup, props, hooks and accessible
names are untouched. Guards `check:label-lamp` (74) and `check:switch` (65)
now encode this look.

### D1.6.7 — The lamps are vintage pilot lamps: seven layers, a screen-blended bloom, the knob's nickel repeated

**Context.** After D1.6.6 the owner re-briefed the indicator lamps as
vintage pilot/jewel lamps — "a hot object behind glass, not a flat dot" —
with a fixed layer order: bloom halo (lit only, ~2.5× bezel radius,
`mix-blend-mode: screen`), nickel bezel, 1px recess wall, glass dome (off:
tinted dead glass, maroon for red), a zigzag filament seen only when off, a
hot core (lit only), and a specular dot in both states; light constant from
the top-left; no pure white or flat saturated fills; an optional 3–4%
breathe. The referenced SVG never arrived; the owner chose to build from
the written brief. Three points were put to the owner because the brief
could not be followed literally: there is no shared nickel token (the
knob's nickel is five hex values local to `Knob.svelte`; the fader has no
nickel); the switch's built-in lamp is a CSS copy of the shared Lamp; and
the existing panel spill would make a second glow.

**Decision (owner's answers).** (1) The bezel uses the knob's five nickel
values repeated locally in each lamp (`--lp-nickel-*` / `--f-nickel-*`); no
token is added and the knob is untouched; both guards assert the values
equal `Knob.svelte`'s. (2) The switch's lamp is restyled in place with the
same seven layers; it does not migrate to the shared component. (3) The
bloom replaces the spill — one glow — and the breathe is included: 3.5%
of opacity over 4 s, alternate, composed onto the bloom's opacity with
`animation-composition: add` inside `@supports`, so the 90 ms rise is kept
and an older browser shows a still bloom; off under reduced motion.
Consequences recorded here: the recess is now a fixed 1px wall at every
size, so D1.6.3's "recess 0.1× the glass" is withdrawn — the default 10 px
lamp's box is unchanged (15.2 px) but the review-sheet 16 px and 30 px
lamps shrink (24.3 → 23.1, 45.6 → 41.6 px); D1.6.4's "red one step
stronger" is now the bloom opacity (0.9 vs 0.8) and a more tinted dead
glass (36% vs 30% body in recess) — red's bloom stains the panel less in
luminance (+9 vs +14 L\*) because the red token is darker; the switch
lamp's lift is a relative `top` offset instead of a transform, so the lamp
forms no stacking context and its bloom can blend with the panel; the
filament is an inline-SVG zigzag used as a CSS mask on a lens pseudo-
element (no markup change in either component); the reduced-motion rules
now name the lit/engaged selectors too — the Task 1.6 rules lost on
specificity to the lit rules and never disabled a lit lamp's transitions.

**Reversible.** Yes — CSS and review-sheet copy only; props, hooks and
accessible names are unchanged. `check:label-lamp` (76) and `check:switch`
(68) encode the look.

**Approved.** By the owner on 2026-10-30, as committed and pushed at
`1ba67c1`; the red-stain and 10 px filament notes stand as accepted.

## Phase 1 — approved

On 2026-10-30 the owner approved the whole Phase 1 component set as it
stands at `1ba67c1` (Tasks 1.1–1.6: tokens, knob, fader, tactile switch,
VU meter and LED ladder, engraved label and lamp), closing the Phase 1
review. The items that were held open for that review — D1.6.1's engraving
light direction against the approved prints, the unpainted `cut` finish
(D1.6.2), the lamp notes under D1.6.7 — stand as accepted. Phase 2 has not
been started; it waits for the owner's explicit instruction.


## Task 2.1 — Console meter bridge

### D2.1.1 — The bridge is one deck of four engraved-outlined modules; at desktop the masters stand at the right end

**Context.** Plan §3 puts "master stereo VU meters, channel meters for the
current bank, stereo correlation display, spectrum ladder, transport, status
and estimated processing time" in the Console's upper section; Task 2.1 skins
the four meter/display parts only, 2.3 adds the rest. The Phase 0 zone was a
grey box whose row took 0.9fr of the room height; real meters have fixed
physical sizes and cannot stretch with the window.

**Decision.** `ConsoleMeterBridge` is a bevelled warm-charcoal deck (the
approved fixture-panel face: panel token, top-left key light, brushed grain,
bevel insets) between two 14 px walnut end-cheeks, with four modules each
outlined by a 1 px engraved groove and titled by an engraved `h3`: MASTER,
CHANNELS 01–08, SPECTRUM, GONIOMETER. The deck is an inline-size container.
From 1150 px of deck content width the modules sit in a named-area grid —
the channel row over the spectrum and goniometer at the left, the master
pair spanning both rows at the right end, and the free panel between them
left empty on purpose for Task 2.3's transport / status / time. The master
pair grows in steps with the deck (12 → 13.5 → 15 → 16.5 → 18 rem at 1150 /
1180 / 1240 / 1290 / 1340 px), the channel meters stay at 4.875 rem (0.65×)
and the ladders at 2.25 rem (0.75×). Below 1150 px the modules wrap in
prominence order (master, spectrum, goniometer, channels; the goniometer
moves up beside the masters under 900 px); the channel row, the spectrum bay
and the master pair each scroll inside their own module when narrower than
their content — never the page. Measured at 1280 × 900: bridge 1248 × 293
px, masters 216 × 151 px, channel windows 78 × 54.6 px, no element outside
the bridge, document `scrollWidth` = `clientWidth` at every width tested.

**Reversible.** Yes — one new component folder and CSS; nothing else in the
room depends on the arrangement.

### D2.1.2 — Eight channel meters, two-digit identifiers (fixture; bank size stays deferred)

**Context.** The plan defers the bank size ("channel-bank/paging system").
The bridge needs a definite number of channel meters to be reviewed.

**Decision (owner's choice, 2026-10-30).** The fixture bank is eight
channels, `01`–`08`, the two-digit codes the Phase 0 bank already uses, each
an approved `VUMeter` at 0.65× with its identifier as the meter's engraved
label. No bank navigation. The real bank size is still a deferred plan
decision; when it is taken, only `BANK_FIXTURE` (and later the project
model) changes. The face numerals at 0.65× are 4.3 px — micro-print like a
real bridge meter's; the identifiers are the legible print at 11 px.

**Reversible.** Yes — one fixture array.

### D2.1.3 — The spectrum is fifteen approved ladders in a recessed bay, on the approved scale, printed the hardware way

**Context.** Spec §4b allows the LED ladder "only where a reference
explicitly calls for a numeric/fast peak ladder display"; plan §3 calls the
Console display a "spectrum ladder". The ladder draws its own dB numerals
beside the column, which fifteen columns cannot each repeat, and its 6.4-unit
numerals would be under 5 px at the column size.

**Decision.** The spectrum display is composed of the approved `LedLadder`,
one per band, inside a shallow recessed bay (recess token 72 % over panel,
shadowed lip). The columns use `LED_LADDER_SCALE` verbatim — the same sixteen
thresholds and green / amber / red bands — with only the `numeral` flags
stripped, so no column prints a scale and no new scale is invented. Fifteen
representative bands: every other ISO 1/3-octave centre from 25 Hz to 16 kHz
(the R10 preferred numbers), printed as hardware analysers print them —
`1k6`, `2k5`, `6k3`, three characters, no decimal point — in the engraved
`value` label at 10 px, with a muted `Hz` after the last column. Columns are
pitched at 26.5 px: the ladder wrapper is the ladder's full width and gives
back its empty 18-unit print area with a negative margin, so each well sits
centred over its label (measured well centre 69.25 px vs label centre 69.24
px). Segments measure 12 × 3.75 px with 1.88 px between them.

**Reversible.** Yes — `SPECTRUM_FIXTURE`, `SPECTRUM_SEGMENTS` and one
component.

### D2.1.4 — Goniometer and correlation strip: an illustrative, provisional treatment

**Context.** The plan names a "stereo correlation display" / "stereo
correlation/goniometer" and nothing more; the measurement is Phase 5.2's
(plan §7, "stereo correlation, channel energy, width/mono compatibility").
Task 2.1 forbids inventing an algorithm or an unspecified scale and asks for
a simple illustrative treatment recorded as provisional.

**Decision (owner's choice among three treatments, 2026-10-30).** A 100 ×
100 px scope — recess-token floor faintly lifted at the centre, a 1 px metal
frame lit along its top edge, a shadowed lip, a weak glass sheen — with a
faint engraved graticule (the L and R diagonals, a ring at r = 42, a centre
pin, `L` / `R` print) and one representative trace drawn three times over
itself in the lamp / amber family (bloom: lamp token, 3.4 wide, 26 %, blurred
1.8; body: lamp token, 1.25 wide, 66 %; core: amber-hi, 0.5 wide, 92 %), so
it reads as a warm phosphor behind glass and never as a cold green VFD
(plan §4). Beside it, a `CORRELATION` strip: a 96 × 8 px recessed slot with
a lit amber index at the reading and the standard `−1 · 0 · +1` print — the
one scale a correlation meter has, not one of ours. The trace is a fixed,
deterministic point list (two sums of sines with non-simple frequency
ratios, mapped mid-vertical / side-horizontal); the reading is the typed-in
`+0.62`. The scope is `role="img"` with a spoken description; the strip is a
`role="meter"` from −1 to +1. Everything about this treatment — the graticule,
the trace, the strip, even whether a goniometer is the right display — is
open until Phase 5.2 says what is measured.

**Reversible.** Yes — one component and two fixture constants.

### D2.1.5 — The fixtures are static

**Decision (owner's choice, 2026-10-30).** No motion of the bridge's own: the
needles, ladders, trace and index rest at their fixture values; the only
animation inside the bridge is the approved VU meter's slow lamp drift
(measured: 20 running animations under normal motion, 0 under
`prefers-reduced-motion: reduce`). No timers, no demo controls.

**Reversible.** Yes.

### D2.1.6 — Housing: walnut end-cheeks, corner screws, and the bridge's own legend in place of the Phase 0 zone header

**Decision (owner's choice, 2026-10-30).** The bridge is bounded by the
deck's bevel and two walnut end-cheeks (wood token with a vertical figured
grain, a lit top edge and a shadowed foot — plan §4's walnut side trim), four
6 px slotted screws in the metal tokens at the deck's corners, and a thin
metal-cream trim line under the top bevel. The grey "Zone 01 / Meter bridge /
…" header is replaced by the bridge's engraved `METER BRIDGE` legend, which
is the zone's `<h2 id="console-meter-title">` so the Console zone keeps its
accessible name. The channel-bank zone keeps its grey header until 2.2.

**Reversible.** Yes — CSS and one heading.

### D2.1.7 — The Console grid rows are `max-content` / `minmax(max-content, 1fr)`, with vertical scroll inside the room as the short-window fallback

**Context.** The Phase 0 rows (`minmax(7rem, 0.9fr)` / `minmax(16rem,
2.4fr)`) shared the room height proportionally. A first build with `auto` /
`minmax(16rem, 1fr)` measured the bridge zone collapsing below its content
when the room was short: at 1024 × 768 and at 360 × 740 the bank zone's top
edge lay above the bridge zone's bottom edge, the overlap hidden behind the
deck because the deck is positioned — nothing visible in a screenshot,
plain in the element geometry.

**Decision.** `.console-layout` rows are `max-content` (the bridge) and
`minmax(max-content, 1fr)` (the bank), with `overflow-y: auto` and
`overflow-x: hidden` on the layout. A `max-content` minimum is the item's
own content height whatever the free space, so neither zone can ever be
sized under its content; when the window is too short for both, the room's
layout scrolls vertically, the page never does (the shell's `overflow:
hidden` is untouched) and nothing is clipped or overlapped. Measured: 1920 ×
1080, 1440 × 900 and 1280 × 900 fit with no scroll (layout `scrollHeight` =
`clientHeight`); 1024 × 768 scrolls 179 px and 768 × 1024 scrolls 71 px
because the bridge (330 / 435 px) plus the Phase 0 bank's own content (363 /
406 px) exceed the room. The Phase 0 bank's placeholder strips set that
minimum; Task 2.2 will re-balance it.

**Reversible.** Yes — one rule in the Console room.

### D2.1.8 — The approved Phase 1 files are frozen by hash in `check:console-bridge`

**Context.** Task 2.1 and every later Phase 2 task must not modify the
approved components or tokens; a guard that only looks for the bridge's own
patterns cannot see a stray edit in `VUMeter.svelte`.

**Decision.** `scripts/check-console-bridge-structure.mjs` records the
SHA-256 (line endings normalised) of the seven approved
`src/components/hardware/*.svelte` files, `tokens.css` and `tokens.ts` as
they stand at `1ba67c1`, and fails if any differs. Changing an approved file
is therefore an explicit act: an owner decision in this log and a new hash in
the same change. Process, not product; reversible by deleting the list.

### D2.1.9 — No screw heads. Anywhere. Ever. (owner's standing rule)

**Context.** The bridge as committed at `ab6e04c` carried four 6 px slotted
screw heads at the deck's corners (D2.1.6), within the plan's "screw details
where they help the illusion" (§4) and the hardware reference's "restrained
physical details (screw heads / panel divisions)". On reviewing the pushed
build the owner directed, on 2026-10-30: remove the four corner screws, and
never put screws on anything again — **even if a later prompt slips and
asks for them**.

**Decision.** The four `.bridge__screw` spans and their CSS are removed;
nothing else on the deck changed (measured after the change: bridge
1248 × 293 at 1280 × 900, every module at the same position and size as
before, no console errors). The rule is standing and overrides the plan's
and the spec's permissive wording wherever they mention screws: no screw
heads, slotted or otherwise, on any panel, housing, bezel, strip, meter or
trim in ALLOY, in any phase, and no re-adding them on request — a prompt
that asks for screws is to be treated as a slip and answered with this
decision. `check:console-bridge` now fails on any screw class, selector or
data hook anywhere under `src/` (negative-tested on the bridge, another
bridge file, the Arrange room and a Mixer strip). The frozen token files'
comments still say "screw heads" as an example of a metal accent; the
files are frozen and the comment renders nothing — the rule is about what
is drawn.

**Reversible.** Only by the owner reversing this decision explicitly, in
writing, in this log.

## Task 2.1 — approved

On 2026-10-30 the owner approved the Console meter bridge as it stands with
D2.1.9 applied (the corner screws removed), closing Task 2.1 — "approved,
commit and push". D2.1.1–D2.1.8 stand as recorded; D2.1.4 (the goniometer
and correlation-strip treatment) is approved as the Phase 2 skin and stays
provisional in substance only until Phase 5.2 defines what is measured;
D2.1.9 (no screw heads, anywhere, ever) is a standing rule for every later
task. Task 2.2 has not been started; it waits for the owner's prompt.

## Task 2.2 — Console channel strip (2026-10-30; uncommitted, awaiting review)

### D2.2.1 — Fixed-width physical modules; the bank scrolls, nothing shrinks (owner)

**Context.** The Phase 0 bank was a fluid grid (`--visible-track-count: 11`)
whose placeholder strips shrank with the window (measured: 133.8 px at 1920,
75.6 at 1280, 52.4 at 1024, 29.1 at 768). The approved controls have fixed
physical sizes — a 72 px fader, 40 px knobs, 28 px switch caps, 11 px
legends — and cannot live in a 52 px column. Asked before writing code, the
owner ruled: a strip is a fixed-width physical module, minimum 150 CSS px,
preferred 150–165, never scaled down to fit; as many complete strips as fit
are visible and the remainder scroll horizontally inside the regular
track-bank region only; the pinned Bus / Return section stays fixed at the
right, outside the scroller; identical widths and alignment; the app never
overflows; test 1920, 1280, 1024, 768.

**Decision.** `TrackStrip` is `10rem` = 160 px wide (`flex: 0 0`, `min-` and
`max-width` all the same variable), inside the band. The rail is a
`max-content` flex row inside the tracks region, the only horizontal
scroller (`overflow-x: auto`, `overscroll-behavior-x: contain`, thin
scrollbar in the bridge's colours). Measured on the build: 20 strips, every
one 160 × 654.4 px at every width; complete strips visible 9 / 5 / 3 / 2 / 1
at 1920 / 1280 / 1024 / 768 / 360; `document.scrollWidth ==
clientWidth` everywhere; the pinned aside 320 px wide at the right (below
the rail only in the Phase 0 ≤ 40rem column mode, unchanged).

**Reversible.** The width is one variable; a bank-paging alternative was
rejected by the prompt (no paging) and is not implemented.

### D2.2.2 — Vertical: full-size controls, ≈ 630 px accepted, the room scrolls; the Knob gains a host-settable size (owner)

**Context.** Full-size approved controls stacked in the plan's order come to
far more than the Phase 0 row height (454 px at 1920 × 1080). The owner
chose, asked before code: keep every control at its approved size — the
fader at its 160 px travel, the knobs at ≈ 40 px, the value windows kept
(no "no-value-window" option on Knob or Fader) — in the order trim / pan /
REV + DLY side by side / fader / mute · solo · peak; accept a strip of
≈ 630 px; let the room scroll vertically (D2.1.7's in-room scroller), never
clip or compress; the vertical scroll must not break the bank's horizontal
scroll. To place the approved Knob at 40 px without touching its artwork
the owner approved exactly one API change: the component reads a
host-settable `--knob-size` into an internal `--_knob-size` with the
approved `7.5rem` as the fallback.

**Decision.** `Knob.svelte` lines 1096–1099 and 1150 only: `--knob-size:
7.5rem;` → `--_knob-size: var(--knob-size, 7.5rem);` (with a two-line
comment) and `.knob__dial { width: var(--knob-size) }` → `var(--_knob-size)`.
Nothing else in the file. Verified: the eleven playground knobs measure a
120 px dial before and after, the knob's box 121.4 × 162.3 before and after,
and element screenshots of the first three are pixel-identical
(`evidence/strip/knob-default-{before,after}-{0,1,2}.png`, PIL difference
bbox `None`); with a host `--knob-size: 2.5rem` the dial measures 40 px. The
frozen Knob hash in `check:console-bridge` is updated
(`ff33be91…` → `df6c5157…`) and the knob guard's geometry lock now asserts
the new declaration. The strip sets `--knob-size: 2.5rem`, `--fader-width:
4.5rem` (the fader's 1×), `--switch-size: 1.75rem` (the switch's 1×),
`--lamp-size: 0.75rem`.

The strip measures **654.4 px**, not ≈ 630: head 38.6 + trim 87.3 + pan
87.3 + sends bay 93.3 + fader 273.3 + footer 66.6 + face padding 8. The
≈ 630 was my estimate and under-counted the section rules and paddings
(each section is separated by a 1 px engraved groove and 2 px of air; the
sends sit in a recessed bay with its own padding); the controls themselves
are exactly their approved sizes (knob block 82.3, fader block 264.3,
switch 59.6). The paddings are already at the smallest spacing tokens; the
remaining 24 px would have to come out of the approved components, which
is out of scope. The room scrolls **166 px at 1920 × 1080 and 346 px at
1280 × 900** (estimates were ≈ 140 / ≈ 320). Vertical wheel over the bank
scrolls the room (layout `scrollTop` 0 → 240, bank `scrollLeft` unchanged);
horizontal wheel scrolls the bank only (`scrollLeft` 0 → 320, room
unchanged, window never scrolls); ArrowRight on the focused tracks region
scrolls it 40 px.

**Reversible.** Yes; if the owner wants ≈ 630 back it means a decision on
which approved component shrinks.

### D2.2.3 — Switches panel-labelled; footer order MUTE · SOLO · PEAK; lamp colours (owner + provisional)

**Context.** The approved TactileSwitch has two variants (D1.4.x): the
printed cap, and the panel variant with the function engraved on the panel
above a plain cap in a well, its lamp to the right. The owner chose the
panel variant for the strip. The prompt's wording "an adjacent lamp" is
satisfied by the switch's own engaged lamp (Task 1.4 standing note); no
second lamp is added. Colours follow Task 1.6's standing rule — amber /
gold = engaged / active, red = warning — and the owner's "red / amber,
restrained" for PEAK.

**Decision.** MUTE: panel switch, red lamp (a muted channel is a warning
state on a console). SOLO: panel switch, amber lamp (an engaged function).
PEAK: the approved Lamp, red, 0.75rem glass, legend engraved above it like
the switches' function prints, the lamp centred on the caps' line (measured
lamp centre 1137.7 vs cap centre 1138.8 at 1280). Order left to right MUTE ·
SOLO · PEAK — the owner's own order ("mute-solo-peak") — which also keeps
the PEAK legend clear of the MUTE print (the three fit in 144 of the 148 px
inner width). The red-for-MUTE choice is provisional until Phase 9's
rulebooks name the semantic set; it uses no new semantic colour.

**Reversible.** Yes: one `lamp=` attribute each.

### D2.2.4 — Control ranges and readouts (provisional)

**Context.** Plan §4 / §8a name the strip's controls but fix no scales; the
project model (Phase 3) and the rulebooks (Phase 9) own the real ones.

**Decision.** TRIM ±20 dB, step 0.5, unity under the reference mark, signed
readout ("+3.5 dB", "0.0 dB", "−2.0 dB"), extremes "−20" / "+20". PAN
−100 … +100, step 1, centre under the mark, readout "L 35" / "C" / "R 100",
extremes "L" / "R". REV SEND and DLY SEND −60 … +6 dB, step 1, the minimum
reads "OFF" (extreme "OFF" / "+6"); fixtures include off and non-zero sends
on both. LEVEL: the approved Fader exactly as approved (−60 … +10 dB,
console taper, 160 px travel, label "Level"). All in
`track-strip-fixtures.ts`; the strip takes them from there, not from
literals.

**Reversible.** Yes: constants in one file.

### D2.2.5 — The bank is a second bridge-style housing; the pinned strips stay Phase 0 inside it (owner)

**Context.** Zone 02 was a grey Phase 0 frame (eyebrow "Zone 02", a grey
header, a dashed inner frame) round a `#f1f1f1` scroller. Asked, the owner
chose to replace the header and frame with a housing that matches the
approved bridge, with the pinned grey placeholders untouched inside it
(they are Task 2.4's subject).

**Decision.** `ChannelBank.svelte` is rewritten as a housing: the bridge's
walnut end-cheeks and charcoal deck (its CSS values copied — the bridge
file is neither imported nor changed; its hash is unchanged and
`check:channel-strip` pins it), an engraved `h2#console-channels-title`
"Channel bank" legend with "Tracks 01–20" at the right, a recessed rail
holding the strips, and a pinned module at the right with an engraved
"Bus / Returns" legend and the three Phase 0 `ChannelStrip` placeholders
exactly as before (96 px wide, grey, same markup; they stretch to the
row's height, as they did in Phase 0). `ConsoleRoom.svelte` keeps its two
zones and hooks; zone 02 is now a bare labelled wrapper like zone 01 and
the Phase 0 header CSS is gone. Measured: bridge and bank share x = 16 and
the same width at every viewport, 16 px apart.

**Reversible.** Yes.

### D2.2.6 — Identity head: engraved number, "TRK", name; the org colour is a 6 × 16 px tab (spec §7)

**Decision.** Top row: channel number (EngravedLabel `sm`, `kind="value"`,
`tone="bright"`) left, type "TRK" (`xs`, muted) right. Second row: a 0.375 ×
1rem glossy plastic tab in a slot, filled with `var(--al-org-N)` /
`--al-org-neutral` through a `--org` variable (the only place the swatch is
used), then the name engraved `sm` `kind="value"`, truncating with an
ellipsis rather than wrapping (the fixtures include "Snare Bottom",
"Rhythm Gtr L", "Vocal Double"). The tab is `aria-hidden`; the strip is a
`role="group"` named by the name label ("Kick"), each control is named
per track ("Mute Kick", "Peak, Kick", "Sends, Kick").

### D2.2.7 — Guard-list updates (process)

`check:tokens` §7 no longer lists `ChannelBank.svelte` as "no tokens yet";
`check:label-lamp`'s scope list no longer forbids the bank from using the
label and lamp; `check:console-bridge` replaces the "Phase 0 bank zone
untouched" assertion with the new zone-02 markup, asserts the bank renders
the zone's h2, and carries the new Knob hash; `check:knob`'s geometry lock
asserts the new size declaration. A new `check:channel-strip` (82 checks)
pins the bridge and the Phase 0 `ChannelStrip` by hash, the composition,
the owner's geometry rules, fixture honesty and the no-screw rule;
negative-tested with seven mutations, all detected, files restored
byte-identical.

### D2.2.8 — The fader's printed scale is unsigned (owner, 2026-10-31)

**Context.** Reviewing the pushed strips (`bd53eae`) the owner pointed at
the "−10" and "+10" numerals of the fader scale and directed: remove the
signs. The approved Fader (D1.3.x) printed a signed bipolar scale (+10 · +5 ·
0 · −5 · −10 · −20 · −30 · −40 · −60).

**Decision.** The panel print is unsigned, as a console fader scale is and
as the meters' ladders already are (D1.5.7): **10 · 5 · 0 · 5 · 10 · 20 · 30
· 40 · 60**, the sign read from the side of 0. Only the print changes: the
value window keeps its sign ("−12.0 dB"), the typed-entry error keeps its
signed bounds ("Enter a number between −60 and +10."), the knobs' extreme
numerals ("−20" / "+20") are not touched. Implementation: `Fader.svelte`
gains `printNumeral = (v) => trim(Math.abs(v))` and `majorMarks` uses it;
`numeral()` (signed) stays for the error text — 5 insertions, 2 deletions,
nothing else in the file. Measured on the build: every one of the 20 strips
prints "60 40 30 20 10 5 0 5 10", numerals right-aligned at the same edge
(two-digit 9.7 px wide at x 429.6, one-digit 5 px at x 434.3), readout
"−12.0 dB", error text signed, no console errors. The playground fader is
the same component and prints the same. Frozen Fader hash in
`check:console-bridge`: `505bf5b8…` → `b46e55ec…`.

**Reversible.** Yes: one function.

### D2.2.9 — Configurable send slots: two fixed positions, side by side (owner, 2026-10-31)

**Context.** The re-issued Task 2.2 prompt replaced the two fixed, pre-named
sends (REV / DLY, D2.2.4) with *configurable* send slots: an unassigned slot
prints SEND, clicking its label opens a compact menu of fixture returns,
selecting assigns the slot to that return and the adjacent knob shows that
return's send level; a slot can be changed or removed; each slot feeds one
return; a track may carry several slots. Asked before code, the owner chose
**two fixed slot positions side by side** (not a 2 × 2 grid, not a variable
count).

**Decision.** `SEND_SLOT_COUNT = 2` in the fixture module; `TrackStrip`
always renders two `SendSlot`s in the existing sends bay (same place in the
trim / pan / sends / fader / mute-solo-peak order; D2.2.1 geometry). The
slot list is the strip's own UI state (`$state`), seeded once from
`track.sends`, bound into each slot; nothing is shared, stored or
persisted. The fixture return list `EFFECT_RETURNS` (Room Reverb, Plate
Reverb, Delay 1 — the three returns the plan §8a names) is typed
(`ReturnId`) and carries a short panel print per return, so that a later
task can populate it from real Return buses without touching the strip.
A return already fed by the other slot is offered in the menu but disabled
("used"), which is how "each slot feeds exactly one return" and "the other
slot's return is unavailable" are both met. Removing a slot's return sets
the slot back to SEND / OFF; assigning takes the fixture's level for that
return on that track if it has one, otherwise `DEFAULT_SEND_LEVEL` (−20 dB);
changing the return keeps a non-OFF level (the operator re-points the send,
the level is theirs). No effect processing, no return management, no
routing — UI state only.

**Measured.** The sends bay grows from 93.3 to 113.3 px (the 18-px window
row plus its gap); the strip is 674.4 px tall at every viewport (was
654.4); width 160 px unchanged.

**Reversible.** Yes: one component, one fixture field, no approved file
touched.

### D2.2.10 — Fixtures pre-assign sends on some tracks, not all (owner, 2026-10-31)

**Context.** Starting every strip empty would hide the assigned state and
the level display from a review of the loaded room; filling every slot
would hide the SEND state. The owner chose **pre-assigned on some tracks**.

**Decision.** The twenty fixture rows carry 0, 1 or 2 sends chosen to read
like a session: 01 Kick, 04, 07, 08, 09 none; 02 Snare → Plate −18; 03 →
Plate −24; 05 / 06 → Room −30; 10 / 11 → Room −15 + Delay 1 −28; 12 →
Plate −12 + Delay 1 −9; 13 → Room −10 + Delay 1 −20; 14 → Plate −6 +
Delay 1 −20; 15 → Plate −14 + Delay 1 −16; 16 → Plate −14; 17 / 18 → Room
−8; 19 → Room −26; 20 → Delay 1 −3. Every return appears, no row exceeds
two sends or names a return outside the list (guarded).

**Reversible.** Yes: fixture data.

### D2.2.11 — Knob legend SEND 1 / SEND 2; the window is a separate clickable label (owner + builder, 2026-10-31)

**Context.** The knob under each slot needs a legend. Options offered: AUX
n, LEVEL, SEND n. The owner chose **SEND 1 / SEND 2**. Separately, the
prompt wants the *label* of the slot to be the thing you click to open the
menu, printing SEND when unassigned and the return name when assigned.

**Decision.** The approved Knob always prints its own engraved legend and
has no "hide label" or "interactive label" API, and the Knob is frozen
(D2.2.2 opened only `--knob-size`). So the slot is two stacked parts: a
**scribble window** — a `<button>` drawn with the knob's own value-window
recess recipe (tokens only), 71 × 18 px, printing "SEND ▾" in the muted ink
when unassigned and the return's short print ("PLATE ▾", "ROOM ▾", "DELAY
1 ▾") in the green function ink when assigned, with the full return name in
its `title` and accessible name — and, beneath it, the green Knob with
`label="Send 1"` / `"Send 2"` (engraved uppercase → SEND 1 / SEND 2),
disabled at OFF while unassigned. The window is `aria-haspopup="menu"` /
`aria-expanded`; the menu is `role="menu"` with one `menuitemradio` per
return (`aria-checked` on the current one) and a "Remove send" item when
assigned; ArrowUp/Down walk the items, Enter/Space select, Escape closes
and returns focus to the window, Tab and a press outside close it. The menu
is absolutely positioned and spans the whole sends bay (144 px) rather than
the 71-px slot, so that the full return names fit and nothing is ever
drawn outside the strip — important because the tracks rail is the only
horizontal scroller and clips vertically (`overflow-y: hidden`), so a menu
hanging below a strip would be cut. Measured: menu box 144 × 71.4 px,
inside the strip and the rail at 1920 and 1280; `elementFromPoint` at its
centre returns the menu (it paints over the knobs and the fader); no return
name is truncated ("used" note chosen over "in use" after a measured
truncation of "Plate Reverb" at the 12-px item size).

**Reversible.** Yes: `SendSlot.svelte` only.

### D2.2.12 — Channel-strip guard revised for local UI state (builder, 2026-10-31)

**Context.** `check:channel-strip` (D2.2.7) forbade `$state`, `$effect`,
`writable`, `onToggle` and `bind:` anywhere in the strip files, because the
base strip was a pure fixture renderer. Configurable slots need strip-local
state and a two-way binding into the slot.

**Decision.** The honesty rule now distinguishes *local UI state* from
*shared or persistent state*: `$state` and `bind:` are allowed, counted and
located (exactly one `$state` in the strip — the slot list — and four in
the slot — `open` and three element refs; none in the fixtures or the
bank); still forbidden everywhere: `$effect`, `svelte/store`, `writable(` /
`readable(`, `getContext` / `setContext`, `localStorage` /
`sessionStorage`, `fetch(`, audio and metering APIs, timers, randomness,
`lib/mixer` / `lib/arrange` / `lib/rooms`. Twenty-three new assertions pin
the slot design of D2.2.9–D2.2.11 (count = 2, seeding from the fixture,
`bind:slot`, `taken`, green Knob `label={legend}` with OFF / +6 extremes,
`disabled` while unassigned, SEND print, menu button semantics,
`menuitemradio` list from `EFFECT_RETURNS`, Remove only when assigned,
disabled "used" return, fixture-level-or-default on assign and OFF on
remove, Escape / Tab / outside-press closing, absolute menu above later
content spanning the bay, no svg / canvas / input, hooks, two-field
`SlotState`, no Knob override, no combobox / select, fixture variety and
bounds, typed return list, default level, green tokens, hex-free slot
style). 82 → 105 checks; negative-tested with 20 mutations across the
slot, the strip and the fixtures — every one detected — files restored
byte-identical.

**Reversible.** Yes: one script.

### D2.2.13 — The org-colour tab is flat (owner, 2026-10-31)

**Context.** Reviewing the pushed strips (`1c094a9`) the owner marked the
organisational colour tabs beside the track names and directed: remove
the shadow / light effect from them. The tab had been drawn as a small
glossy plastic tab (a top-light gradient, a side gradient, an inset
highlight, a 1-px dark seam ring and a 1-px drop shadow).

**Decision.** The tab is a **flat fill of the swatch token** and nothing
else: `background-color: var(--org)` on the same 0.375 × 1 rem,
1-px-radius box, beside the name, decorative (`aria-hidden`). Removed: both
gradients, the inset highlight, the seam ring and the drop shadow — the
whole light/shadow treatment, not only part of it, so the tab reads as a
printed colour mark rather than a lit object. Nothing else in the head
changes; the colour still never touches the panel (spec §7). Measured on
the build: every tab 6 × 16 px, `background-image: none`,
`box-shadow: none`, swatch colour unchanged (track 01–03:
`rgb(192, 74, 58)`).

**Reversible.** Yes: one CSS rule.

## Task 2.2 — approved

On 2026-10-31 the owner wrote "everything up until this point is
approved", closing Task 2.2 as it stands at `b3df4f0` on `main`: the base
strips (`bd53eae`, D2.2.1–D2.2.7), the unsigned fader print (`69f53a6`,
D2.2.8), the configurable send slots (`1c094a9`, D2.2.9–D2.2.12) and the
flat org-colour tab (`b3df4f0`, D2.2.13). The earlier approvals (Phase 0,
Phase 1 at `1ba67c1`, Task 2.1 at `08bc7aa`) are reconfirmed by the same
sentence. The approval covers, in particular: the one Knob API change
(`--knob-size`, D2.2.2) as the only change to an approved Phase 1
component in this task besides D2.2.8's print; the fixed 160-px modules
with the tracks rail as the only horizontal scroller and the room scrolling
vertically; the send slot as a separate scribble window above a green Knob
legended SEND 1 / SEND 2 (D2.2.11); the fixture pre-assignments (D2.2.10).
The deviations and known issues listed in the report stand as accepted:
the strip at 674.4 px (room scroll on every tested viewport), the 4.3-px
knob numerals at 40 px, the PEAK legend 1 px shorter than MUTE / SOLO, the
stretched pinned placeholders until Task 2.4, the bridge's eight channel
meters against twenty tracks, and the empty reserved bridge panel until
Task 2.3.

Approved files as they stand (SHA-256, first 16 hex, for the next task's
guard to pin the way D2.1.8 pinned Phase 1 and D2.2.7 pinned the bridge):
`TrackStrip.svelte` `17059869a037d575`, `SendSlot.svelte`
`8009eaf5ba033509`, `track-strip-fixtures.ts` `c76e8c14b7c9794b`,
`ChannelBank.svelte` `a6031e29ac2f8d22`, `ConsoleRoom.svelte`
`bf04568d82ca2a02`; `Knob.svelte` `df6c51572f28d00c` and `Fader.svelte`
`b46e55ec95f4ddbe` as already frozen in `check:console-bridge`. Standing
rules carried into every later task: no screw heads (D2.1.9); printed
scales unsigned (D1.5.7, D2.2.8); approved controls are never scaled down,
only placed (D2.2.1 / D2.2.2); the org colour is a flat tab beside the
name, never a strip tint (D2.2.13, spec §7).

Task 2.3 has not been started; it waits for the owner's prompt. This note
is the only change after `b3df4f0`; it is uncommitted until instructed.

## Task 2.3 — Console transport, status, time display & MIX button (2026-10-31)

### D2.3.1 — The transport is its own full-width deck between the bridge and the bank (owner, 2026-10-31)

**Context.** The plan's Console room puts "transport, status and estimated
processing time" and the "large illuminated MIX button" in the "upper
section", but the approved meter bridge (Task 2.1, `08bc7aa`) fills that
section edge to edge; its reserved right-hand panel is 549 px wide at 1920,
69 at 1440, 53 at 1280 and absent below (measured, D2.1 notes). Four keys,
two displays and a dominant button do not fit a 53-px panel, and the owner's
rule is that approved components are never shrunk and the bridge is not to
be redesigned. The builder stopped and asked rather than invent.

**Decision (owner).** The control area is a **third zone of the Console: a
full-width deck between the meter bridge and the channel bank**, the same
at every width; the bridge is untouched (its reserved panel stays bare until
a later task gives it something). The deck wears the bridge's housing
recipe — walnut cheeks, bevelled warm-charcoal panel — exactly as the bank
does, so the room reads as one desk of three modules. `ConsoleRoom` grid
rows become `max-content max-content minmax(max-content, 1fr)`; the new
zone (`data-console-zone="transport"`, labelled by the deck's own engraved
`h2#console-transport-title`) joins the no-placeholder-frame rule.
Measured cost: the bank's top moves from 487 px to 628 px at ≥1280 (deck
125 px + 16 px gap), to 666 at 1024 and 854 at 768 (deck 209 px, two rows);
the room's vertical scroll grows by the same amount. The Phase 0 guards
that asserted "exactly two zones" (`check:transport`, `check:console-bridge`,
`check:channel-strip`) now assert the three zones in order.

**Reversible.** Yes: the zone and the component are additive; nothing in
the bridge or the bank changed (both pinned by hash in
`check:console-transport`).

### D2.3.2 — Transport keys PREVIOUS · PLAY · STOP · NEXT; the listening source is text, not a selector (owner, 2026-10-31)

**Context.** Phase 0 (Task 0.6) fixed the product's transport conventions as
Previous / Play / Stop / Next; plan §6 names three listening modes (raw stem
playback, lightweight live preview, full rendered mix) and says MIX is
separate from Play. The builder offered a RAW / PREVIEW / RENDER source
selector as an option.

**Decision (owner).** The deck's keys are exactly the four Phase 0 keys —
**PREVIOUS · PLAY · STOP · NEXT** — each the approved `TactileSwitch`
(cap-labelled, spec §2 variant A) printing its symbol on the cap
(|◀ ▶ ■ ▶|) with its word engraved beneath; no record, loop, rewind or mode
keys. The **listening source is printed as text in the status display**
("Source RAW / PREVIEW / RENDER") and selected nowhere: no source switches
exist in Task 2.3. PLAY and STOP are one exclusive latching pair (the
engaged one's own lamp is lit; pressing the engaged key again changes
nothing); PREVIOUS and NEXT are momentary and release themselves. This is
the keys' own local UI state, seeded once from the fixture; it drives
nothing (plan §14: playback is Phase 3).

**Reversible.** Yes: a selector can be added to the deck later without
touching the keys.

### D2.3.3 — Time display: dark glass, amber lamp-lit digits, H:MM:SS large with bar · beat small (owner, 2026-10-31)

**Context.** The plan sets no time format; the Phase 0 mini transport prints
a placeholder `00:00:00.000`; plan §4 asks for warm lamp glow and forbids
the cold VFD look.

**Decision (owner).** The time display is a **dark glass window with amber
lamp-lit digits**: `H:MM:SS` large (no leading zero on the hour — `0:02:17`,
`0:37:11`), with `Bar N · Beat N` small beneath. Monospaced tabular digits
(`--al-font-mono`, 1.75 rem) in the incandescent token
(`--al-material-lamp` family) with a soft text-glow; the glass breathes 4 s
like the family's lamps and is still under reduced motion. No milliseconds,
no SMPTE frames, no sync or position tracking — the numbers are fixture
values.

**Reversible.** Yes: `formatClock` and the window's two lines.

### D2.3.4 — Room default state READY; every state in the playground; the MIX states (owner, 2026-10-31)

**Decision (owner).** The Console renders the deck in **READY**: stopped,
`0:02:17` bar 12 beat 3, status `READY · Source RAW · BALANCED · Est. mix
1:40`, MIX lit steady. The other snapshots live in the playground only
(`#/dev/components`, section "Console — Transport deck and MIX button"):
PLAYING (`0:37:11`, bar 186, PLAY lit, source PREVIEW), PROCESSING (stage 3
of 7 "Analysing spectrum", 42 %, 0:58 left, profile LITE, one warning in
red, MIX pulsing and ignoring presses) and COMPLETE ("MIXED at 14:02 · 2
manual edits since · Rerun available · Source RENDER"). The MIX button's
fixture states are `ready` (lit steady), `processing` (slow 1.8-s pulse,
`aria-disabled`, still under reduced motion) and `complete` (lit steady —
the status window, not the button, tells the two apart); an unlit "dead
cap" exists for the playground only and is never shown in the room.

**Reversible.** Yes: fixture data.

### D2.3.5 — One `LampDisplay` component for both windows (builder, 2026-10-31)

**Decision.** Instead of a `TimeDisplay` and a `StatusDisplay`, one
`LampDisplay` (`kind="clock" | "status"`) draws the dark glass window: an
engraved legend above, the glass (layered gradients and inset shadows,
never flat — spec §6), a primary line, an optional progress slot (a 4-px
groove with the lamp along it, shown only while processing) and a
secondary line of dot-separated details whose last part may be printed in
the red family as a warning (D1.6: amber = active, red = warning; no third
colour). The clock kind sets the mono tabular numerals; the status kind sets
the uppercase label face. The two windows level to one height in the deck
(`flex: 1 1 auto`). Rationale: one glass recipe, one breathe animation, one
reduced-motion rule, one accessible-name pattern (`aria-label` carrying the
printed values and the word "simulated").

**Reversible.** Yes.

### D2.3.6 — `MixButton`: a lit rectangular lens, not a switch (builder, 2026-10-31; plan §3/§10)

**Decision.** The MIX button is its own component, deliberately unlike the
keys: a wide rectangular translucent amber cap (deck: 120 × 56 px against
the keys' 40 × 40 caps; default 8 × 4.5 rem) in a dark bezelled well, lit
from a bulb behind the glass with a warm spill onto the panel around it,
the word MIX printed dark on the lit lens, "AUTOMATIC MIX" engraved
beneath. It stands 3 px proud and sinks under the finger (`:active`), has a
visible focus ring, is named "MIX — start the full mix" and described by the
status window and the SIMULATED note. It has **no click handler**: pressing
it starts nothing (plan §14: the automatic mix is Phase 5). While
`processing` it is `aria-disabled` (kept in the tab order) and pulses; the
pulse lives inside `prefers-reduced-motion: no-preference` only.

**Reversible.** Yes.

### D2.3.7 — Keys at 40 px; the deck never shrinks; the body wraps instead (builder, 2026-10-31; owner's standing rule)

**Decision.** The four keys use the approved switch at `--switch-size:
2.5rem` (40-px caps, the size the switch was approved at — the strips'
MUTE / SOLO sit at 28 px because the strip is narrow, the deck is not).
Keys, time window and MIX are `flex: 0 0 auto`; only the status window
flexes, from a 16-rem floor to a 28-rem ceiling, and the body is
`flex-wrap: wrap`, so a narrow deck grows a second row rather than
compressing a control: one row at 1920 / 1280 / 1024 (deck 125 px), two
rows at 768 (keys + time, then status + MIX; deck 209 px). No media or
container query in the deck.

**Reversible.** Yes.

### D2.3.8 — The deck's copy says it is simulated (builder, 2026-10-31)

**Decision.** The deck prints "SIMULATED — NO ENGINE CONNECTED" engraved at
the right of its legend row, carries `data-simulated="simulated"` and names
every window with ", simulated"; the keys' group and the MIX button are
`aria-describedby` that note. The fixture file owns its own `SIMULATED`
constant (never imported from the bridge or the strips).

**Reversible.** Yes.

### D2.3.9 — Earlier guards' Console-room snapshots revised for the third zone (builder, 2026-10-31)

**Decision.** Three existing guards asserted the Console's zone list or
grid as a snapshot of the room at their time: `check:transport` (0.6,
"exactly its two zones" and a `console-transport` string ban that was aimed
at the 0.3 scroll-reveal placeholder), `check:console-bridge` (2.1, two
zones, two grid rows, the two-zone no-frame rule) and `check:channel-strip`
(2.2, two zones). Each now asserts the three zones in order and the
three-row grid; the 0.6 ban is narrowed to the placeholder's own markers
(`transportVisible`, `data-transport-visible`, `is-visible`,
`class="console-zone console-transport"`). No approved component file was
touched (all pinned by hash in `check:console-transport`); these are test
scripts, revised the way D2.1 revised Phase 0's and D2.2 revised 2.1's.

**Reversible.** Yes.

### D2.3.10 — Review change: the Time / Status windows become segment-display screens, centred on the key caps (owner, 2026-11-01)

**Decision.** Two changes to the transport deck's TIME and STATUS boxes
only, after the pushed checkpoint `ab31d04` (an earlier hand-drawn SVG
segment attempt on 2026-10-31 was withdrawn by the owner before any record
— "return to the last checkpoint" — and is not in the repository).

*Vertical alignment.* The boxes' vertical centre is to equal the key caps'
(the caps only, not the words beneath), by the project's flex method and
no hand offsets. Each window column is now built like a key column — a
seat the caps' height (`--switch-size`, hoisted from `.transport__keys` to
`.transport__body` so both read it; the value is unchanged) with the glass
centred on it, the keys' gap, then a hidden label line mirroring the keys'
words — so `.transport__body`'s existing `align-items: center` lands the
seat where the switches' seats are. The windows no longer stretch; the
legend is absolutely positioned above the frame and moves with it.
Because the glass no longer takes its height from the row, its height is
written down once in the deck: `--window-height: 4.53125rem` (72.5 px —
exactly what the frames measured at the checkpoint; owner's choice over
reusing `--mix-height`, which at 56 px could not hold the two-line
PROCESSING / COMPLETE details). The approved switch raises its cap 3 px
above its seat (its internal `--sw-lift`), so flex-only centring lands the
box centre **1.5 px below** the cap centre at every width (measured
551.44 vs 549.94 at 1920). The owner chose this over copying the lift and
seat clearance into the deck and asked for the offset to be reported, not
corrected.

*Old Casio negative-LCD look.* The faces are the open-source DSEG fonts
(keshikan, v0.46, SIL OFL 1.1), kept in `src/assets/fonts/dseg/` with the
licence and a README, loaded by `@font-face` with relative `url()`s and
inlined into the single-file build (`vite.config.ts` gains an
`assetsInlineLimit` callback for `.woff2`; no dependency change). "DSEG7
Classic" sets the clock digits; "DSEG14 Classic" sets the status word, the
details and the clock's bar / beat line (seven-segment has no letters).
Lit segments keep the colours the window always printed in (`--dp-ink`
amber-hi, `--dp-dim`, `--dp-warn`) with one faint glow in the segment's
own colour (`0 0 6px`, 40 %); behind every live line a ghost of the same
text, same font, size and position, at opacity 0.1 with no glow, every
letter and digit replaced by the all-segments glyph ("8" / "~"), spaces,
colons and punctuation kept — measured per character, the ghost and live
glyph boxes coincide to 0.00 px in every state. The screen is flat and
matte (`--dp-screen`, the recess token darkened, no gradient), recessed
with one inset shadow offset to the top-left (`inset 2px 2px 3px`, the
checkpoint's own values), no bright bottom-right edge, a very faint
reflection across the top-left corner (the checkpoint's room-light stops
at 135°), no wash, no breathing, no scan lines. The frame is a flat dark
ring. The middle-dot separator is replaced by "-" (the face has no "·");
at the owner's acceptance of the builder's recommendation, segment text
uses the font's own spacing (`--al-letter-spacing-normal`) in place of the
engraved / label tracking, and the regular weight.

**Deviation from the hardware spec, by owner instruction.** Spec §6
("layered gradients, never flat") and plan §4 ("warm lamp glow") are set
aside for these two screens only: the owner asked for a flat matte screen
and a subtle backlight glow. The guard's "layered, never flat" and
"breathe" checks for the window were replaced accordingly; nothing else in
the family changes.

**Consequences reported, not fixed (owner's rule for this change).** At
1920 / 1280 / 1024 nothing outside the two boxes moved (every key, cap,
word, lamp, the MIX column, title, note, bank and bridge rectangles are
identical before and after). At 768 the first row is no longer propped up
by the stretched time column, so the deck is 12.9 px shorter (208.9 →
196.0), the keys / MIX / bank move up with it, the TIME legend stands
3.9 px above the deck's top edge, the TIME box's top edge crosses the
"SIMULATED — NO ENGINE CONNECTED" note by 4.4 px, and the STATUS legend
overlaps the PREV word. On the playground page at 1024 (narrower fixture
frame) the STATUS legend overlaps the note. DSEG's space is a quarter cell
(0.2 em), so word gaps read narrow; its diagonal-segment letters (Y, X, K,
M, N, V, W, Z) anti-alias dimmer than straight ones at 18 / 11 px on a 1×
display (the Bold face does not cure it).

**Reversible.** Yes — the checkpoint is `ab31d04`.

### D2.3.11 — Review change: the screens take the VU meters' card, black print, a hint of the bulb, no glow on text ever (owner, 2026-11-01)

**Decision.** Following D2.3.10 the owner asked that the TIME and STATUS
boxes have the same background as the VU meters, that their text and
numbers be black, that the boxes carry a little hint of lamp effect, and
that the text and numbers never have any glow. `LampDisplay.svelte` now
takes the approved `VUMeter.svelte`'s card value for value: the cream card
in shadow (`cream 46 % black`) as the base, the lit card (`cream 80 % lamp`)
washed over it at 0.8, the bezel lip's shadow along the top (0.4 over
10 px), left (0.3 over 7 px) and right (0.14 over 4 px), the meter's
off-centre vignette (78 % at 50 % 70 %; 0 → 0.14 → 0.4), and its one
diagonal glass sheen (0.07 → 0.03 → 0) over the print. The hint of the
bulb is the meter's three lights — the pool and the faint upper-right lift
in the lamp token, the hot core in the amber-hi-and-white mix — placed as
on the meter (lower centre, a little left; upper right) but at roughly a
quarter of its strength (28 %, 10 %, 22 % alpha), static. The print is
the VU face's ink, `--al-text-on-cream`, on every line; the hierarchy is
by size alone. A warning stays red — the standing rule (Task 1.6, plan §10)
— in the VU face's own red (`red-base 85 % red-lo`). `text-shadow` is
`none` on the live print and the ghost; the glow variable is gone and the
guard refuses any other `text-shadow` in the window. The earlier recess
shadow and faint reflection are replaced by the meter's lip and sheen; the
ghost layer (0.1 of the live colour, now black) and everything in D2.3.10
about fonts, alignment and height are unchanged. No geometry moved
(rectangles identical to D2.3.10 at every width). No approved component
was touched.

**Reversible.** Yes.

### D2.3.12 — Review change: MIX in the keys' cream with a mixing lamp beside it; Segment16A (CC0) for words and numbers; no ghost print (owner, 2026-11-01)

**Decision.** The owner's third review of the deck asked for three things.
(1) *"The mix knob should be coloured just like the other transport
knobs."* `MixButton.svelte` drops its amber glass lens, its lamp-behind-the-
cap and its spill on the panel, and wears the transport keys' cap instead:
the approved `TactileSwitch.svelte` variant-A cap recipe value for value —
the function-cream tokens (`hi` / `base` / `lo`), the 46 % dim, the 135°
convex ramp (hi 0–10 %, base 48 %, dim 100 %), the same edge lights and
shades, the same gloss bloom (62 % × 46 % at 30 % 20 %) over the same faint
second sheen, the 70 % / 42 % cream wall and foot, the keys' press (the
bloom dims to 0.35, the inner shade deepens, the cap sinks to a 1 px wall),
and the legend in the keys' ink `--al-text-on-cream` with the keys' faint
lit edge under it. Geometry, legend typography, the well, the lift, the
focus ring and the accessibility contract are unchanged; `lit` (the
playground's dead cap) no longer exists, so the prop and its playground
entry are gone. Asked how the mixing state should then show, the owner
answered: *"add a little lamp next to it, it should be lighted at mixing
state."* The approved `Lamp.svelte` (Task 1.6) now sits beside the cap where
a key's lamp sits — the keys' gap (`--al-space-xs`), level with the resting
cap's face, at the Lamp's own default size (10 px glass, the switch's lamp)
— lit only while `state === "processing"`, off for `ready` and `complete`.
It is presentation (no name): the button's `aria-describedby` and
`aria-disabled` carry the state as before. MIX has no animation of its own
any more; the lit Lamp breathes as approved (not under reduced motion). The
MIX column grows by the lamp and its gap, 136 → 157.2 px, so to keep the
deck on one row at 1024 (as reported for Task 2.3) the status window's
floor comes down from 16 rem to 14.5 rem (the one number changed in the
deck; it bites only at 1024, where the status window is 235.8 px instead of
256.9). (2) *"Try Segment16A on the text and the numbers, if it is totally
free."* It is: the Segment16 families are CC0 Public Domain (Daniel
Wikholm, 2017 — "No rights reserved. No attribution required.", the
designer's note shipped with the font). The Regular face is kept in the
project (`src/assets/fonts/segment16/`: the original TTF, a 3 148-byte
Latin subset as woff2 that the screens load, the designer's note, a README
with the provenance and the subset command) and replaces both DSEG faces
for the clock, the words and the small print alike, at the sizes the window
always had, regular weight, the font's own spacing. The DSEG folder is left
in place but is referenced nowhere (not bundled; can be deleted on
instruction). Because the face has the middle dot, the detail separator is
the owner's original `·` again (the D2.3.10 substitution `-` is undone);
no other character is substituted — the face draws `:` as two short
segments and `.` as a zero-width point on the preceding cell, and both are
shown as the font draws them. (3) *"Without this ghost of the same text —
it should be clean."* The ghost layer of D2.3.10 (`ghostOf()`, the
`display__ghost` spans, `--dp-ghost`, the line/cell wrappers) is removed
entirely; the screens carry the live print alone. The guard now refuses any
ghost (no function, markup, class, variable or all-segments glyph), pins
the Segment16A files, licence and single `@font-face`, the `·` separator
and the keys' recipe on MIX, and checks the Lamp beside it.

**Reversible.** Yes.

### D2.3.13 — Review change: Orbitron for the text and the numbers in the Time / Status windows (owner, 2026-11-01)

**Decision.** Asked what to continue with, the owner answered: *"change
only the text and the numbers inside the time and status bar to this one"*
— Orbitron (1001fonts.com). Orbitron (Matt McInerney, 2009, The League of
Moveable Type) is under the SIL Open Font License 1.1 with the reserved
name "Orbitron": free for personal and commercial use, embedding and
bundling allowed, the font may not be sold on its own — the licence text
from the download is kept beside the font. The release has four weights
(Light 300, Medium 500, Bold 700, Black 900); Medium — the weight its own
name table calls "Regular" — is used for every line, through the existing
`--al-font-weight-medium` token, at the sizes the windows always had, the
font's own spacing and kerning. The Medium TTF, a Latin subset as woff2
(5 032 B, kerning kept, the stylistic-alternate and small-cap features
dropped), the OFL and a README live in `src/assets/fonts/orbitron/`;
`LampDisplay.svelte` loads it with one `@font-face` and uses it for the
clock, the state word and the small print. Nothing else in the windows
changed (card, lamp hint, ink, red warning, no glow, no ghost, height,
seats, legends). The Segment16A and DSEG folders, now referenced nowhere,
are taken out of the tree (copies in `evidence/transport/fonts-tried/`,
outside the repository) so the project carries only the face it uses.
Properties of this face that the owner should know, all measured: it is
proportional with no tabular-figures feature (`1` is 391/1000 em against
826–834 for the other digits), so the clock's width changes with its
digits — 98.8 px for `0:37:11` against 128.8 px for `0:00:00` at 28 px; it
has no middle dot, so the `·` separator is drawn by the next family in the
stack (4 px wide at 11 px); and it is wide — at the deck's narrowest
single-row width (1024, status glass 234 px) the processing state's word
"ANALYSING SPECTRUM" (242.7 px at 18 px) is clipped by 21 px at the right
and the complete state's four-line details are clipped by 6 px at the
bottom; every state fits at 1280, 1920 and 768. Not fixed (the owner's
standing rule: report, do not fix); options are listed in the report.

**Reversible.** Yes.

## Task 2.3 — approved

On 2026-11-01 the owner wrote "approved, commit and push", closing Task 2.3
as it stands after the four review changes of that day: the deck itself
(`9b6e614` carried the Task 2.2 approval note; `ab31d04`, D2.3.1–D2.3.9)
and the review commit `102d1dc` (D2.3.10–D2.3.13). The approval covers, in
particular: the full-width deck between the bridge and the bank with four
approved tactile switches as PREVIOUS · PLAY · STOP · NEXT; the Time and
Status windows on the VU meter's lamp-lit cream card, 72.5 px tall, centred
on the key caps by flex (centre +1.55 px below the caps, accepted), black
print in Orbitron Medium (SIL OFL, kept in the project) with the `·`
separator, a red warning, no glow, no ghost; the MIX button in the keys'
cream with the approved Lamp beside it, lit only while processing; the
status floor at 14.5 rem; the listening source as status text; H:MM:SS with
bar · beat; READY as the room's default. The deviations and known issues
listed in the report stand as accepted: the 768 legend overlaps (Time
legend 3.9 px above the deck's top, Status legend over the PREV word), the
1024 clipping in the processing and complete states (state word by 21 px,
four-line details by 6 px — font width), the clock's width changing with
its digits (no tabular figures in the face), `complete` and `ready`
reading alike on MIX (lamp off), the warning kept red, and the bare
reserved bridge panel at 1920 until later tasks.

Approved files as they stand (SHA-256, first 16 hex, for the next task's
guard to pin the way D2.2.7 pinned the bridge and this task's guard pinned
the strips): `ConsoleTransport.svelte` `b5bd2efed4f4e19f`,
`LampDisplay.svelte` `19634fdde214a7d5`, `MixButton.svelte`
`5b08e6e8f505c478`, `transport-fixtures.ts` `0333ddc273f3cd1e`,
`ConsoleRoom.svelte` `ab8450a981b9ef4a`, `TransportFixture.svelte`
`f9ff5f4a4c75a204`, `Orbitron-Medium.subset.woff2` `655276db0bafd8fe`,
`Orbitron-Medium.ttf` `826f71504dfc50c8`. Standing rules carried into
every later task: no screw heads (D2.1.9); no glow on display text or
numbers, ever, and nothing drawn behind the live print (D2.3.11–12); fonts
live in the project with their licences, never on a CDN (D2.3.10); the
transport's controls are the approved components placed, never scaled or
modified (D2.3.1–2).

Task 2.4 has not been started; it waits for the owner's prompt.

## Task 2.4 — Console bus-master and Return-bus strips (2026-11-01; uncommitted, awaiting review)

### D2.4.1 — The pinned Returns are derived from the shared return list, not a Reverb / Delay pair (owner, 2026-11-01)

**Context.** Phase 0.3 drew two pinned placeholders, "Reverb Return" and
"Delay Return", beside the bus master. The Task 2.2 send slots already
name three returns (`EFFECT_RETURNS`: Room Reverb, Plate Reverb, Delay 1),
and the Task 2.4 prompt forbids hard-coding one reverb and one delay. The
builder asked which Returns the Console pins.

**Decision (owner).** The three the send menu names — and derived from
that list: `RETURN_STRIPS = EFFECT_RETURNS.map(…)` gives one Return strip
per listed return, numbered R1, R2, … in list order, named by
`effectReturn(id).name`, with per-return settings keyed by `ReturnId` (the
type checker refuses a return without settings). A return added to the
shared list grows a strip; a send assigned on a track always has a visible
Return at the end of the bank. The bus master is a list too (`BUS_MASTERS`,
one entry). The guard asserts the derivation and the absence of the words
"Reverb Return" / "Delay Return" outside comments.

**Reversible.** Yes — fixture data; the pinned area renders whatever the
lists hold.

### D2.4.2 — Column mode under 68.75 rem (1100 px): the pinned block drops under the track rail (owner, 2026-11-01)

**Context.** A real strip is 160 px; three Returns and the bus master make
a 664-px pinned rail (4 × 160 + 3 × 4 + 12 padding), against the Phase 0
placeholders' 320. Beside the rail at 1024 there would be room for one
complete track; at 768 none. Phase 0 already had a column mode (its break
at 40 rem). The builder asked what to do where the pinned block no longer
fits beside at least two complete tracks.

**Decision (owner).** Keep Phase 0's column mode and raise its threshold:
below 68.75 rem = 1100 px the deck stacks legend / tracks / pinned legend /
pinned; the pinned rail gets `overflow-x: auto; overscroll-behavior-x:
contain` there only, so it scrolls sideways on its own if it must (at 768
it has 684 px for 664 and does not). Above the threshold the tracks rail
is the only horizontal scroller and the pinned rail sits beside ≥ 2
complete tracks (2 at 1100, 3 at 1280, 4 at 1440, 7 at 1920). The number
is the sum of the parts and is written in the source: pinned rail 668 +
gap 12 + two strips and their rail 336 = 1016 px of deck, plus the deck's
and the cheeks' 84 px = 1100. Measured at 1100 (row) and 1099 (column).

**Reversible.** Yes — one media query.

### D2.4.3 — The Return strip's controls; TONE under the character window, the second control in the knob section (owner + builder, 2026-11-01)

**Context.** Plan §8a lists a Return's processing controls (character /
algorithm, decay or delay time, pre-delay, tone / damping, delay feedback,
output level, bypass); the Console strip is to stay legible and simple
(plan §3). The builder offered the owner three sets; the owner chose the
aligned full set: DECAY / TIME knob, TONE knob, bay with CHARACTER window
over the PRE-DELAY / FEEDBACK knob and a BYPASS switch, RETURN fader,
MUTE · SOLO · PEAK.

**Decision (owner, with one builder deviation).** The chosen set is
built, all in the green family (spec §5: sends / reverb / delay), with the
character as a plain print in the send window's recipe and green ink and
BYPASS the approved panel switch with an amber lamp lit while bypassed.
**Deviation:** measured in the browser, the bay's half-width knob slot is
71 px and the approved Knob's legend ellipsises past it — "PRE-DELAY" is
76.4 px, "FEEDBACK" 73.4, "TONE" 36.5; the knob's label width is not a
prop and the knob is never modified. Rather than abbreviate the plan's
words, the two knobs trade places: the second control (PRE-DELAY /
FEEDBACK) takes the full-width second knob section and TONE sits under the
character window. Same controls, same geometry; eleven pinned legends
measured, none overflows. Parameter ranges are provisional (DECAY 0.2–10 s,
PRE-DELAY 0–200 ms, TIME 20–2000 ms, FEEDBACK 0–90 %, TONE −10…+10 with
FLAT at 0) until the model (Task 3.1) and the Mixer chain detail (Task
2.9) settle them. Rule for later bay knobs: legends ≤ ~70 px.

**Reversible.** Yes — swapping `knobB` and the bay knob back is a
one-line change if the owner prefers the original order with "PRE-DLY" /
"FDBK".

### D2.4.4 — The bus master: BUS TRIM (orange), BALANCE, a blank bay, the MASTER fader (owner, 2026-11-01)

**Context.** The plan names no bus-master control set for the Console;
the strip must align with the tracks and the Returns. The builder asked
which controls the bus master carries.

**Decision (owner).** The same skeleton as a track: BUS TRIM in the orange
family the spec reserves for bus / group masters, on the tracks' ±20 dB
TRIM range and readout; BALANCE in blue-grey on the tracks' PAN range (L /
R, "C"); where a track has its sends bay, a **blank panel** of the bay's
exact height (113.3 px, `data-blank-panel`) — an unpopulated slot, not a
decoration — so the MASTER fader and the footer stay on the tracks' lines;
MUTE · SOLO · PEAK. Farthest right, as Phase 0.3 placed it. The ranges and
formatters are re-exported from the track fixtures, not copied.

**Reversible.** Yes.

### D2.4.5 — One shared chassis, `StripModule`, copied value for value from the track strip; `TrackStrip` untouched (builder, 2026-11-01)

**Context.** The prompt asks the pinned strips to match the track strips'
styling, sizing, spacing and control alignment, and to modify shared
components only where required for correct reuse; `TrackStrip` is approved
and hash-pinned (D2.2.7's rule applied by the 2.3 guard).

**Decision (builder).** The pinned strips are built on a new
`StripModule.svelte`: the track strip's housing, head, six sections,
approved Fader and MUTE · SOLO · PEAK footer, with the two knob sections and
the bay supplied as snippets by `ReturnStrip` / `BusMasterStrip`, and a
blank panel when no bay is given. Its CSS is the track strip's value for
value — the way the bank copied the bridge's housing (D2.2.5) — and the new
guard asserts fifteen rule bodies **equal** the track strip's (`.strip` ↔
`.module`, face, sections, seams, head, ident, name row, tab, knob
sections, bay, fader, switches, peak) so the two cannot drift. Measured:
pinned modules 160 × 674.4 with sections 38.6 / 87.3 / 87.3 / 113.3 /
273.3 / 66.6, fader / caps / peak at the tracks' y at every width. No
approved component changed (all hash-pinned).

**Reversible.** Yes; folding `TrackStrip` onto the module is a candidate
for Task 3.1, when the track strip is reopened for the model.

### D2.4.6 — The bank's deck is a two-column grid with a shared legend row; the track strips do not move (builder, 2026-11-01)

**Context.** The first 2.4 layout gave the pinned column its own legend
row inside the column, which pushed the track strips down 18 px against
the 2.2 baseline — a regression of an approved zone.

**Decision (builder).** The deck is a grid: `grid-template-columns:
minmax(0, 1fr) auto`, areas `"legend pinned-legend" / "tracks pinned"`.
The pinned legend ("Bus / Returns · R1–B1", derived from the lists) stands
over its own rail in the legend row; both rails start on one line; the two
rails share the recess recipe. Measured: track 01 at the baseline's x / y
at every width (48 / 657.1 at ≥ 1280, 48 / 694.4 at 1024, 48 / 869.6 at
768); the bank's height unchanged in row mode (719 px).

**Reversible.** Yes.

### D2.4.7 — Fewer complete track strips are visible beside the pinned rail; stated, not hidden (builder, 2026-11-01)

**Context.** The pinned rail grew from 320 to 664 px.

**Decision (builder).** Under the owner's standing rules (strips are
fixed 160-px modules, never shrunk; the pinned area never scrolls away;
the app never overflows) the visible count of complete tracks falls from
Phase 0's 9 / 6 / 5 to 7 / 4 / 3 at 1920 / 1440 / 1280; at 1024 and 768,
now column mode, it rises from 3 / 2 to 5 / 4 and the Console grows taller
(bank 1433 px, reached by the room's vertical scroll). Recorded in the
report's viewport matrix with the Phase 0 baseline measured on `d2e2e6d`
before any change.

**Reversible.** Not without breaking a standing rule or pinning fewer
Returns (fixture data, owner's call).

### D2.4.8 — Guards: `check:bus-return` added; the Task 2.3 bank pin re-pinned; `ChannelStrip.svelte` kept, unused (builder, 2026-11-01)

**Context.** `check-console-transport` pinned `ChannelBank.svelte` by hash
as an approved file in Task 2.3; `check-channel-strip` asserted the Phase 0
placeholders in the pinned area; the Phase 0 `ChannelStrip.svelte` is
pinned by the 2.3 guard and listed by the tokens guard.

**Decision (builder).** New `scripts/check-bus-return-structure.mjs`
(`npm run check:bus-return`, 103 checks, 14-mutation negative test):
composition, the chassis equality of D2.4.5, the fixture derivation of
D2.4.1, materials, the column mode of D2.4.2, no screws, seventeen
approved-file hashes including `ConsoleRoom`, the bridge, the transport
files and the Phase 0 placeholder, no dependency change. The transport
guard's bank pin is updated to the bank's new hash with a comment (the
bank is 2.4's to change; the deck above it is untouched). The channel-strip
guard's five placeholder checks become checks of the new pinned area (107).
`ChannelStrip.svelte` stays in the tree byte-identical and unused;
deleting it is a one-file removal plus two guard lines, left to the owner.

**Reversible.** Yes.

### D2.4.9 — A Return is identified by existing Console elements only (builder, 2026-11-01)

**Context.** The prompt asks that a Return be visually identifiable as a
Return without introducing a new visual language.

**Decision (builder).** The identification is carried by elements that
already exist in these roles: the type print `RET` beside the number (as
`TRK` on a track, `BUS` on the master); the green knob family already
meaning "sends / reverb / delay" on the track send knobs; the character
window in the send slot's window recipe and green ink, so a Return's window
and the sends that feed it read as one family; the fader legend RETURN
where a track reads LEVEL; the engraved name from the shared list. No new
colour, shape, texture or print; the only new CSS is the window and two
flex wrappers; no hex, no glow, nothing behind print, no screws.

**Reversible.** Yes.

## Task 2.4 — approved for now

On 2026-11-01 the owner wrote "commit and push, approved for now", closing
Task 2.4 as delivered in `2b36389` (D2.4.1–D2.4.9). The approval covers:
the Return strips derived from the shared return list (three today) and
the bus master farthest right, all on the track strip's chassis
(`StripModule`, copied value for value, the track strip untouched); the
Return's green DECAY / TIME and PRE-DELAY / FEEDBACK knobs, the character
window over the TONE knob, BYPASS with an amber lamp and the RETURN fader —
including the TONE-in-the-bay swap made for legend fit; the bus master's
orange BUS TRIM, blue-grey BALANCE, blank bay and MASTER fader; the bank's
grid deck with the pinned rail outside the scroller; column mode under
68.75 rem; the stated cost in visible track strips (7 / 4 / 3 at 1920 /
1440 / 1280). The deviations and known issues in the report stand as
accepted for now, the parameter ranges as provisional.

"For now" — two questions the owner raised at review are **recorded as
open, not decided**, for the model (Task 3.1) and the Mixer chain detail
(Task 2.9); the builder's explanation was given, no change was directed:

- **BALANCE on the mix bus.** The owner's reading — a balance control
  changes the relative levels of the bus's existing left and right
  channels (attenuating one side, no cross-feed, the image does not move),
  which is not a stereo panner that moves the whole image — is the sense
  in which the strip is labelled BALANCE and not PAN. The build is visual
  only: the legend, the blue-grey family and the tracks' ±100 L / C / R
  readout reused for printing; the DSP meaning is to be fixed in the model
  as balance, not pan. Whether the readout stays `L 100 / C / R 100` or
  prints attenuation in dB is open. The related question — what PAN means
  on a genuinely stereo *track* (balance, or a stereo panner with width;
  plan §9 flags mono files duplicated to L / R) — belongs to 3.1, not to
  this task.
- **TONE on the Returns.** Plan §8a names the control "tone / damping": a
  single bipolar control, not an EQ section and not a hi-cut with a
  frequency readout. Built as −10 … +10 with FLAT at centre, darker below,
  brighter above; the intended sense is wet-path damping / tilt (reverb
  high-frequency damping of the tail; the delay's feedback-path filter).
  The exact mapping is provisional (D2.4.3); precise filters, if wanted,
  belong in the Mixer's chain view (2.9). Changing the Console knob to an
  explicit HI-CUT with a kHz readout remains an option (a fixture-level
  change to `TONE_PARAM`; legend to be measured against the 71-px slot).

Approved files as they stand (SHA-256, first 16 hex, for the next task's
guard to pin as D2.2.7 / the 2.3 and 2.4 guards did): `StripModule.svelte`
`d7fab0ed97b0c78d`, `ReturnStrip.svelte` `5f50749a6e1aba35`,
`BusMasterStrip.svelte` `e3d4f49f39979d2c`, `bus-return-fixtures.ts`
`551fa3fc978362f3`, `ChannelBank.svelte` `d8079a833c0b8a4b`,
`PinnedStripFixture.svelte` `a7798e353712b1dc`. Standing rules carried
forward: no screw heads (D2.1.9); approved components placed, never scaled
or modified; strips are fixed 160-px modules; the tracks rail is the only
horizontal scroller in row mode; bay knob legends ≤ ~70 px (D2.4.3);
Returns are data derived from the shared list (D2.4.1).

Task 2.5 has not been started; it waits for the owner's prompt.

## Task 2.5 — Arrange track-list rows (2026-11-01; uncommitted, awaiting review)

### D2.5.1 — Three Prominence Tiers, default Supporting (owner, 2026-11-01)

**Context.** The Task 2.5 prompt says "Prominence Tier control (e.g.
primary / secondary)"; the plan §5a defines three tiers — Primary,
Supporting, Background — backed by a Priority 1–10 and defaulting to
Supporting. The builder asked which to build.

**Decision (owner).** Three tiers, `primary | supporting | background`,
as the plan has them; the fixture default is Supporting. The Priority
number behind a tier is not shown in Task 2.5 (plan §5a shows it only
"when the user asks for finer control"). The "needs confirmation" state a
defaulted tier carries until confirmed (plan §5a) is not drawn yet —
follow-up, see the report.

### D2.5.2 — The tier control is a scribble-window select, the same recipe as the instrument combobox (owner, 2026-11-01)

**Context.** Three tiers could be a three-position switch (TactileSwitch
pair / trio) or a select window. A switch trio costs ~90 px of width per
row at 28 px caps; the row has 176 px at the 1024 / 768 widths.

**Decision (owner).** One control recipe for both choices in the row: the
Task 2.2 send slot's scribble window + raised plate, lifted into a shared
hardware component `ScribbleSelect.svelte` (xs = the strips' 18 px window
for the tier, sm = a 22 px window with 11 px print for the instrument).
The send slot itself is untouched (byte-pinned); its rules were copied
value for value, the guard compares them.

### D2.5.3 — The list column's floor is raised from 10rem to 12rem (owner, 2026-11-01)

**Context.** Phase 0 gave the list `clamp(10rem, 16vw, 15rem)` = 163.8 px
at 1024 and 160 px at 768. Three lines of identity, an instrument window
and a role print beside an 88 px tier window do not fit 144 px of content.

**Decision (owner).** `clamp(12rem, 16vw, 15rem)` — 240 / 230.4 / 204.8 /
192 / 192 px at 1920 / 1440 / 1280 / 1024 / 768 (1920–1280 unchanged). The
≤ 40rem override also becomes 12rem (was 8.5rem). The timeline loses 28 px
at 1024 and 32 px at 768 (measured 836 → 806, 584 → 550 px visible). The
row height stays 5rem (4.25rem ≤ 40rem). The Mixer's `--track-column-width`
in `app.css` is unchanged (the Mixer is out of scope); the two columns now
differ below 1200 px — the Mixer skin task re-aligns them.

### D2.5.4 — The org marker is the Console's flat 6 × 16 tab beside the code (owner, 2026-11-01)

**Decision (owner).** The same mark in every room: `.row__tab` is the
TrackStrip's `.strip__tab` rule, value for value (the guard compares the
rule bodies) — `background-color: var(--org)` only, no gloss, no shadow
(D2.2.13). Nothing else in the row reads `--org`; the row's face is the
approved panel. Never a row tint (prompt; guard).

### D2.5.5 — The row's three lines; the legends live in the corner, over their fields (builder, 2026-11-01)

**Context.** The prompt asks for compact rows with concise labels and no
redundant text. Inline "ROLE" / "TIER" legends on line 3 cost ~54 px and
overflow the 176 px line at the 12rem floor.

**Decision (builder).** Line 1: tab · code (EngravedLabel sm, muted) ·
name (EngravedLabel md, bright, truncating with its title). Line 2: the
instrument window, full width. Line 3: the role as an engraved print at
the left, the tier window (fixed 5.5rem = 88 px, so it keeps one width
whatever it prints) at the right. No legends in the row: the corner cell —
which sits directly above row 01, sticky — prints TRACK LIST, then
INSTRUMENT over the instrument windows, then ROLE at the left and TIER
centred over the 88 px tier column (measured: legend x/width 148.4/88 =
tier window x/width at 1440). Role and tier read as two kinds of thing —
one a print, one a window — and the tooltips name each ("Role: Rhythm —
the track's musical function"; "Prominence tier, Kick: Primary — how the
track is treated in mix conflicts"). Budget: 4 + 18 + 4 + 22 + 4 + 18 + 4 =
74 px in the 80 px row, centred (3 px slack top and bottom); at ≤ 40rem the
gaps close to 1 px and the three lines fit the 68 px row exactly
(measured 68, no overflow).

### D2.5.6 — The row's instrument and tier are local `$state`, seeded from the fixture (builder, 2026-11-01)

**Decision.** As the Console strip's send slots (Task 2.2): `let
instrumentId = $state(track.instrument)`, `let tier = $state(track.tier)`,
bound to the two windows; exposed as `data-track-instrument` /
`data-track-tier` for tests. Nothing is written back, stored, routed or
played. A change in one row touches no other row (verified: row 03 → Toms
left 02 and 04 unchanged). Task 3.1's project model replaces this.

### D2.5.7 — The track rows derive their names and colours from the Console's `TRACK_STRIPS` (builder, 2026-11-01)

**Context.** Phase 0's Arrange rows were "Track NN". The plan §5 wants one
session across rooms; the Console already names twenty tracks with
organisational colours (Task 2.2).

**Decision.** `lib/arrange.ts` imports `TRACK_STRIPS` and builds each row
from it (`code = strip.id`, `name`, `org`), adding a typed-in
instrument / role / tier per track id (`SESSION_SETTINGS`, twenty
entries); rows beyond the list are neutral "Track NN" with the plan's
defaults (Other / Rhythm / Supporting). The Task 0.4 contract survives:
`createArrangeTracks(count)`, `PLACEHOLDER_TRACK_COUNT = 20`,
`ARRANGE_TRACKS = createArrangeTracks(ARRANGE_TRACK_COUNT)`; the old type
name `ArrangeTrackPlaceholder` is kept as an alias. The Mixer still prints
"Track NN" from `lib/mixer.ts` (out of scope; open item).

### D2.5.8 — Mixer typography parity with the Arrange row is suspended until the Mixer skin (builder, 2026-11-01)

**Context.** `check-mixer-structure.mjs` asserted the Phase 0 Arrange
row's literal `0.6875rem` code, `0.875rem` name and `0.375rem` identity
gap equal the Mixer's `--track-header-*` tokens. The Arrange row now prints
with EngravedLabel: the code at sm (= 0.6875rem, still equal), the name at
md (0.8125rem — the label has no 0.875rem step).

**Decision.** The guard keeps the box parity (row height 5rem; padding
4 px / 8 px, now `--al-space-2xs` / `--al-space-sm`, equal to the Mixer
tokens), keeps the code-size equality, and pins the Mixer's name-size and
gap tokens at their Phase 0 values instead of comparing them with the row.
`app.css` and the Mixer files are byte-pinned by the new guard. The Mixer
skin task re-establishes typography parity by using the same labels.

### D2.5.9 — `ScribbleSelect`: select-only combobox semantics, a scrolling plate, drop-up (builder, 2026-11-01)

**Decision.** `button role="combobox" aria-haspopup="listbox"
aria-expanded aria-controls`, accessible name "<Instrument | Prominence
tier>, <track>: <current>. Choose"; the plate `role="listbox"` of
`role="option" aria-selected`, roving focus, ArrowUp / Down (wrapping),
Home / End, Enter / Space, Escape (back to the window), Tab (leaves),
first-letter type-ahead, outside press closes. The plate is at least as
wide as its window, at most 16rem, scrolls inside itself past
`min(16rem, 60vh)` (the 19-instrument list is 256 px tall and scrolls),
and drops upward when the nearest scrolling ancestor has more room above
the window than below (verified on row 20). The selected option's dot is
amber (engaged), not the send slot's green (that green says "routed").
`overflow-y: auto` lives in the component, not in the row or lane (the
Arrange guard's rule). A row with an open plate is lifted to `z-index: 3`
(`.row:has([aria-expanded="true"])`) because sticky siblings paint in DOM
order; the Phase 0 `overflow: hidden` left the row for that reason.

### D2.5.10 — Guards: `check:arrange-rows` added (91 checks); three guards edited (builder, 2026-11-01)

**Decision.** New `scripts/check-arrange-rows-structure.mjs` (wired as
`check:arrange-rows`): the Task 0.4 cell contract, composition, the
select's recipe parity with the send slot and its ARIA / keyboard, Role ≠
Tier, three tiers, fixture derivation, local state, flat tab / no tint,
the corner's legends, the 12rem floor, Phase 0 timeline untouched, no
screws, 29 byte-pins (timeline lane, Mixer trio + `lib/mixer.ts`,
`app.css`, Console room, bank, strips, slot, fixtures, hardware
components, tokens, bridge, transport, shell), no dependency change, the
playground section. Negative-tested: 28 single-line mutations each
produce a FAIL and the tree is restored byte-identically. Edited:
`check-mixer-structure.mjs` (D2.5.8; 41 → 40 checks),
`check-tokens-structure.mjs` §7 (ArrangeRoom + ArrangeTrackRow leave the
"no Phase 2 skinning" list; 60 → 58), `check-label-lamp-structure.mjs`
(ArrangeRoom leaves the no-EngravedLabel list; the corner prints with it;
precedent ChannelBank, Task 2.2). `check-arrange-structure.mjs` is
unchanged and still passes 30/30.

## Task 2.5 — approved

**Owner, 2026-11-01:** "Task 2.5 is already implemented and approved."
Approved as delivered in `task-reports/2.5-report.md`, uncommitted (the
owner's follow-up prompt says "do not commit or tag"; the commit waits for
the owner's commit signal). Approved file hashes (sha256, first 16):
`ScribbleSelect.svelte` `8b3e4a28c84e24ea`, `ArrangeTrackRow.svelte`
`32e4738a25963ff0`, `ArrangeRoom.svelte` `8ed43c6b234862dd`,
`lib/arrange.ts` `afdf5753db1019ce`, `ArrangeRowFixture.svelte`
`1a394a32d4c75c0b`, `check-arrange-rows-structure.mjs` `d416b0d23cb205b2`.
The follow-up below (instrument family + name selectors) changes the row,
the data file, the corner's legends, the playground block and the guard
on top of this state; D2.5.1–D2.5.10 stand.

## Task 2.5 follow-up — Instrument family and name selectors (2026-11-01; uncommitted, awaiting review)

### D2.5.11 — Two windows on line 2: the instrument NAME at the left (flexible), the FAMILY at the right in the tier window's column (builder, 2026-11-01)

**Context.** The owner's follow-up replaces the single instrument list
with a FAMILY selector (ten broad categories) and a dependent NAME
selector, in the approved 80 px row and the approved column widths. Line
2 is the only line with room for two windows (a fourth line does not fit
the 72 px of content).

**Decision (builder).** Line 2 = the name window (ScribbleSelect sm,
`flex: 1 1 auto`) + the family window (ScribbleSelect sm, `flex: 0 0
5.5rem`, the tier window's exact width and x — measured equal at all five
widths). The name gets the flexible width because it is the longer print;
the two fixed windows stack as one 88 px column at the right (FAMILY over
TIER), the identity prints (name, instrument, role) align at the left.
The corner's legends follow: INSTRUMENT · FAMILY / ROLE · TIER. The row's
height, padding, tab, name line, role print and tier window are unchanged.
Cost: the name window is 82 px at the 12rem floor (192 px column), so the
longer fixture names truncate with an ellipsis (full name in the tooltip)
— 10 of 20 rows at 1024 / 768 ("Electric guitar", "Electric bass", "Lead
vocal", "Backing vocal", "Percussion"), 7 at 1280, 3 at 1440 ("Electric
guitar"), none at 1920. The names stay standalone (as the owner's
examples: "Analog synth", not "Analog"); shortening the in-family names
("Electric" under GUITAR) would cut the truncation and is offered as an
option, not done.

### D2.5.12 — The family is derived from the instrument; a family change prints the family's first name only when the current name does not belong (builder, 2026-11-01)

**Decision.** One piece of instrument state per row, `instrumentId`; the
family shown is `familyOf(instrumentId)`, the name list
`instrumentsOf(family)` — so the name can never be outside the family
shown and nothing has to be reconciled. Choosing a family the current
name already belongs to changes nothing; choosing another sets the
family's fixture default, its first name in list order (Drums → Kick,
Keys → Piano, Strings → Violin, Brass → Trumpet, Woodwinds → Flute,
Synths → Analog synth, FX → Riser, Guitar → Electric guitar, Bass →
Electric bass, Vocals → Lead vocal). That is a fixture default on a user
action, not a classification. Neither choice reads or writes role or
tier (guarded; verified in the browser both ways). A track with no
instrument (rows beyond the session) now carries `instrument: null` —
both windows print a dash and the name window is disabled until a family
is chosen; the Task 2.5 "Other" instrument is gone with the owner's
family list (no "Other" family). Session tracks 08 / 09 become
`electric-bass`, 20 becomes `riser`; the rest keep their ids. The tier
list, its Supporting default and the role list are untouched; the plan's
"needs confirmation" state is still not drawn (as reported in 2.5) —
nothing here changes that.

### D2.5.13 — `ScribbleSelect`: focus after the plate is placed (bug fix in the shared component, builder, 2026-11-01)

**Context.** Opening a plate that must drop upward (a row in the lower
half of the room) focused the current option in the same microtask that
decided the flip, before Svelte had moved the plate — the browser
scrolled the room to the still-downward plate, then the plate flipped up
under the sticky header. The ten-family plate on row 08 at 1440 × 900
showed it (Task 2.5's row-20 check did not: the room was already at its
scroll end).

**Decision.** The one change to the shared component in this follow-up:
`openList` awaits `tick()` after opening (the plate exists), places it,
awaits `tick()` again (the plate sits where it will stay), then focuses.
Verified: row 08 family at 1440 × 900 — room scroll unchanged (0), plate
upward, inside the scroller, clear of the header, top and bottom visible;
rows 03 / 08 / 10 / 20 likewise. Nothing else in the component changed.

## Task 2.5 follow-up (family + name selectors) — approved

**Owner, 2026-11-01:** "Task 2.5 and its Instrument Family / Instrument
Name follow-up are already implemented and approved." Approved as
delivered in the report's first follow-up section, uncommitted (the next
prompt says "do not commit or tag"). Approved hashes (sha256, first 16):
`ScribbleSelect.svelte` `4974f298c86b07a1`, `ArrangeTrackRow.svelte`
`71565b0250120fae`, `ArrangeRoom.svelte` `c145b0e68b5caff8`,
`lib/arrange.ts` `34bac8b967af8b24`, `DevComponentsPage.svelte`
`9f117373ad437b1f`, `ArrangeRowFixture.svelte` `1a394a32d4c75c0b`,
`check-arrange-rows-structure.mjs` `84c848ddeedfb879`. The second
follow-up below (Family / Source Type, stable ids) changes the data file,
the row, the corner's legend, the playground and the guard on top of this
state; D2.5.1–D2.5.13 stand except where D2.5.14–D2.5.18 say otherwise.

## Task 2.5 second follow-up — Family and Source Type, stable ids (2026-11-01; uncommitted, awaiting review)

### D2.5.14 — Family and Source Type are two states with one invariant; sources are a local catalog of stable snake_case ids (builder, 2026-11-01)

**Context.** The owner's second follow-up aligns the row's metadata with
the planned rule-based auto-mix engine: the engine will look rules up by
a stable source identity, never by a label or a track name.

**Decision.** `src/lib/arrange.ts` replaces the instrument list with a
catalog local to Task 2.5: `FAMILIES` (eleven, owner's order, Percussion
its own family) and `SOURCE_TYPES` — 54 entries, each
`{ sourceTypeId, label, familyId }` with a snake_case id (`kick`,
`synth_bass`, `lead_vocal`, `sub_808_bass`, `spoken_rap_vocal`…) that is
the canonical identity; the label is display only and may change without
touching the id. The owner's conventions are encoded in the data, not in
code: Synth Bass and Sub / 808 Bass under Bass; Synth Lead / Pad / Pluck /
Arp / Texture / Other under Synths; Overheads and Room under Drums (drum
recordings); FX = source material (Impact, Riser / Sweep, Atmosphere,
Other FX), not returns. "Unspecified" is not a catalog entry: it is
`sourceTypeId: null`, offered as the empty option id (`UNSPECIFIED_ID`)
first in every family's list by `sourceOptionsOf`. The row holds two
states, `familyId` and `sourceTypeId` (D2.5.12's single derived state is
withdrawn — a family with no source is now a legal, common state), with
the invariant "a source is null or belongs to the family shown", kept by
`isValidSource` in `chooseFamily`. `ArrangeTrack` carries
`familyId: FamilyId | null` and `sourceTypeId: string | null`; the twenty
session tracks are explicitly assigned valid pairs (19 Shaker →
percussion / shaker, 20 Riser FX → fx / riser_sweep, 08 / 09 bass /
electric_bass, 10 / 11 guitar / distorted_electric_guitar, 12 guitar /
clean_electric_guitar, 16 vocals / vocal_double…); a track beyond the
session has neither. No other catalog in the project fits (the Console's
`TRACK_STRIPS` are names and colours, not identities), so nothing shared
was touched.

### D2.5.15 — A family change clears an incompatible source to Unspecified — never a default (owner, 2026-11-01; supersedes D2.5.12's default-first rule)

**Decision.** `chooseFamily`: the same family is a no-op; another family
is set, and the source is kept only if `isValidSource` says it belongs
(in practice: only when it is already null), otherwise cleared to
`null` — the window prints UNSPECIFIED and the row's
`data-track-source-type` attribute is absent. Nothing picks the family's
first or a "suitable" source; the user chooses. `chooseSource` sets the
id or clears it (the Unspecified option). Neither handler reads or
writes `tier`, `track.role` or `track.name` (guarded by text; verified in
the browser: a walk through all eleven families on row 01 left PRIMARY /
RHYTHM, and tier → source → tier round trips left each other alone).
Initial fixture pairs stay explicitly assigned (D2.5.14).

### D2.5.16 — The family / tier column is 5.75rem (92 px), from 5.5rem (builder, 2026-11-01)

**Context.** PERCUSSION is the longest family word; at the sm 11 px
window print it needs 70.5 px of text room and the 5.5rem window offered
70 (88 − 2 border − 8 padding − 6 chevron − 2 gap).

**Decision.** `.row__family`, `.row__tier` and the corner's
`.arrange-corner__tier-legend` are `flex: 0 0 5.75rem` — one column,
still stacked, still the same recipe. Cost: the source window at the
12rem list floor is 78 px (was 82), so the long catalog labels truncate
one character sooner (measured: 13 of 20 rows at 1024 / 768, 9 at 1280,
3 at 1440 / 1920 — the two guitar labels and Distorted Electric Guitar's
neighbours; the full label is in the tooltip and the plate). PERCUSSION
is whole at every width (measured, not truncated). Rejected: the xs
print on line 2 (changes the approved compact styling); a ragged family
window (breaks the stack over the tier window).

### D2.5.17 — The corner legend over the source windows prints SOURCE; the selector is labelled "Source type" (builder, 2026-11-01)

**Context.** The owner renamed the selector "Source Type". The corner
legend is a column header beside the FAMILY legend; the full print SOURCE
TYPE at xs measures 87.1 px, and the legend's room at the 12rem floor is
176 − 92 − 6 = 78 px — it pushed the FAMILY legend 9 px right of its
window at 1024 and 768 (measured before the change: span at 115.1 vs the
window at 106). Narrower column, smaller print or a clipped legend were
all worse than a shorter word; the pinned `EngravedLabel` cannot be
re-tracked.

**Decision.** The corner prints SOURCE (51.2 px) over the source windows
— the precedent is the approved first follow-up, whose corner printed
INSTRUMENT over a selector labelled "Instrument name". The selector's
accessible name, the tooltip and the report all say "Source type"; the
glossary term is unchanged. Measured after the change: both right-hand
legends sit exactly over the 92 px windows at 1920 / 1440 / 1280 /
1024 / 768. If the owner prefers the full print at every width, the
options are a 12.5rem list floor (owner decision D2.5.3 would move) or a
smaller legend size — flagged, not done.

### D2.5.18 — The display name is a prop the row never writes; a review-only rename harness in the playground (builder, 2026-11-01)

**Decision.** `track.name` stays a read-only prop of the row (no `name`
state, no handler touches it, no name matching anywhere — guarded), so
renaming and source assignment cannot interfere by construction. Because
the room has no rename control yet (naming is not this task), the
playground's `rename` block gives `ArrangeRowFixture` a `renameTo` config:
a plain page button (`data-dev-rename`, deliberately not hardware) swaps
the first row's `name` prop "Kick" ↔ "Big Kick"; the row is keyed by code
so its state persists across the swap. Verified: rename leaves
`sourceTypeId` kick; choosing Clap afterwards leaves the name "Big Kick";
a family change afterwards leaves the name and the tier. No auto-naming,
no name recognition, nothing in the product UI.

## Task 2.5 second follow-up (Family / Source Type, stable ids) — approved for now

**Owner, 2026-11-01:** "approved for now." Approved as delivered in the
report's "Follow-up 2" section, with its two noted deviations (the SOURCE
corner legend, D2.5.17; the 5.75rem column, D2.5.16) accepted for now.
Still uncommitted and untagged by instruction (no commit signal given).
Approved hashes (sha256, first 16): `lib/arrange.ts` `c46be59b874e70c7`,
`ArrangeTrackRow.svelte` `439d1889603ef908`, `ArrangeRoom.svelte`
`68b0b784831e10ab`, `DevComponentsPage.svelte` `871c99dfb891cb9a`,
`ArrangeRowFixture.svelte` `facc39b60df21345`,
`check-arrange-rows-structure.mjs` `a4f74216021b5570`,
`ScribbleSelect.svelte` `4974f298c86b07a1` (unchanged); build
`dist/index.html` `fa124c6e44f3ccda` (402.11 kB). D2.5.1–D2.5.18 stand.
Open, carried forward: the "needs confirmation" state is not drawn; the
full SOURCE TYPE legend print would need a wider list floor or a smaller
legend size.

## Task 2.6 — Arrange timeline, waveform placeholders, tempo markers (2026-11-01; uncommitted, awaiting review)

### D2.6.1 — Owner design answers taken before code (owner, 2026-11-01)

**Decision.** One `ask_user` round before any code, as the prompt requires
when something is open: (1) lanes are the **dark grey-green work surface**
(`--al-material-surface`) with **cream waveforms** (`--al-material-cream`,
flat, no glow — D2.3); (2) the track's org colour appears on the timeline
as **the same flat 6 × 16 tab at each clip head** (D2.2.13; never a clip or
lane tint — no second colour-marker system); (3) **stereo halves only for
stereo sources** (Piano, Synth Pad, Riser FX), mono stems on the midline
(Task 0.4 sized the 80 px lane for the stereo case); (4) the **tempo
fixture has a few changes** and the time signature **4/4 is printed once**,
beside the first marker.

### D2.6.2 — One bar width: 2.75rem (44 px); the timeline is 56 × 44 = 2464 px (builder, 2026-11-01)

**Decision.** The room defines `--arrange-bar-width: 2.75rem` once and
derives `--arrange-timeline-width: calc(var(--arrange-bar-count) *
var(--arrange-bar-width))`; the bar count reaches CSS as an inline custom
property from `ARRANGE_BAR_COUNT`. Every horizontal position in the head
and the lanes — ruler bar lines, four-bar lines, beat ticks, numerals, tempo
flags, structure spans, lane grid, clip left and width — is a bar-unit
`calc()` on that property, so the ruler's lines, the lanes' lines and the
clips' edges are the same lines by construction (guarded; measured
`dx = 0` for every clip, numeral, tempo and section mark at all five
widths). 44 px was chosen over Task 0.4's 2400 px / 42.86 px per bar so a
bar is a whole number of pixels and a beat (11 px) is too; the timeline
grows from 2400 to 2464 px (+64 px, inside the same single scroller — no
other geometry changes). The list column (`clamp(12rem, 16vw, 15rem)`) and
the 5rem row are untouched (guarded, pinned).

### D2.6.3 — The ruler is a console scale: metal marks, three weights, numerals every four bars (builder, 2026-11-01)

**Decision.** The ruler band (1.375rem) prints musical time the way the
fader prints its scale (Task 1.3): four-bar lines the band's full height,
bar lines 9 px, beat ticks 4 px, all from the bottom edge; majors from 90 %
of `--al-material-metal`, minors from 45 % (`color-mix`), no colour of its
own. The numerals are the approved `ARRANGE_RULER_LABELS` (every four bars,
`ARRANGE_RULER_LABEL_INTERVAL` untouched) as `EngravedLabel xs value muted`
set 4 px right of their bar line. The seam between the ruler and the tempo
track is the owner's Task 0.4 "heavier, darker" line, cut as a groove:
`--al-bevel-shadow` over `--al-bevel-light`. The head keeps the Task 0.4
band order ruler → tempo → structure and its 82 px (22 + 36 + 22 + 2 px
baseline), equal to the list corner, so the first row and the first lane
share one top edge (measured 0 at all widths).

### D2.6.4 — The tempo track is a track: fixture markers as cream flags with value print, a held-tempo step trace (builder, 2026-11-01)

**Decision.** The tempo band (2.25rem) is the same work surface and bar
grid as the lanes, so a marker reads against the lines the clips sit on.
Each fixture marker is a 1 px cream flag at its exact bar plus
`"NNN BPM"` (`EngravedLabel xs value`) — the first also prints `4/4`
(muted) once. Below the print a 1.5 px cream step trace
(`tempoTracePath`, `vector-effect="non-scaling-stroke"`) holds each tempo
to the next marker and steps at it, drawn against a fixed 96–128 BPM
band, so a change is seen as a step and its size can be compared. Fixture:
**120 @ bar 1 (4/4) · 112 @ 41 (Bridge) · 120 @ 45 (Solo) · 104 @ 53
(Outro)** — each change on a section start of the approved structure
(guarded). Nothing detects, analyses or edits tempo: no inputs, buttons or
handlers in the head (guarded). A tooltip on the marker spells the held
tempo out; that is the only explanatory text.

### D2.6.5 — Clips are raised plates in bar units; the waveform placeholder is drawn, deterministic and local (builder, 2026-11-01)

**Decision.** `lib/arrange-timeline.ts` (new, beside the approved
`arrange.ts`, which stays byte-identical) holds the clip fixture — **20
tracks, 53 clips**, every clip inside bars 1–56, sorted and
non-overlapping per track (guarded) — and a small generator: a seeded
mulberry32 hash (no `Math.random`, no clock) and sixteen "kind" recipes
(kick, snare, snare bottom, hat, overheads, room, bass, rhythm / lead
guitar, piano, pad, vocal, vocal double, harmony, shaker, riser) that place
hits in the bar, decay them, vary density and phrase, scaled by the
section's dynamics (Intro .72 … Chorus 1 … Outro .7). The result is a
16-peaks-per-bar envelope rendered once as an SVG path (mono: centre 50,
half 44; stereo: two halves at 26 / 74, half 21) stretched to the plate.
Each clip is a plate on the surface (`--al-material-surface-raised`, 1 px
dark edge, 2 px radius, lit top edge), `left = (startBar − 1) × bar width`,
`width = bars × bar width − 1 px` (a seam between touching clips), 4 px in
from the lane's top and bottom; the drawing is two layers of the one path —
peaks at .42, body (`<use>`, 60 % height) at .78 — the overview look of a
tape editor without a second drawing. Nothing is read from audio; the
fixture is kept outside `arrange.ts` because the Task 0.4 guard sums every
`barCount:` in that file to 56.

### D2.6.6 — The lane carries no print; one tooltip per clip; no interaction (builder, 2026-11-01)

**Decision.** The lane prints nothing permanent (no labels, no bar
numbers, no track name — the list row says who it is, the ruler says
where); the only text is the clip's `title` ("Kick · bars 5–40 · mono").
The lane's boundary is one dark hair line below; the bar grid is a hair
line per bar and a slightly firmer one per four bars, no beat lines (the
ruler carries those). The lane and the head have no handlers, drag,
focus, inputs or buttons (guarded): Task 2.6 is the skin of the workspace,
not the editor. The lane's new props (`name`, `org`, `clips`) are optional
with safe defaults, so the Task 0.4 call shape still renders (guarded).

### D2.6.7 — The scroller becomes the work surface; the head component owns the three bands (builder, 2026-11-01)

**Decision.** The Phase 0 dashed frame and white field are gone: the one
scroller is the work surface in a 1 px `--al-bevel-shadow` frame with an
inset shadow and `color-scheme: dark` for the browser's scrollbars. The
head's three bands moved from the room into `ArrangeTimelineHeader.svelte`
(rendered once, sticky, `z-index 3` under the corner's 4) so the room file
stays the layout and the head is reviewable on its own in the playground;
the Task 0.4 guard now reads the band regions from that component (same
names, same order) and checks the room renders it exactly once. Verified by
measurement: after `scrollLeft 600 / scrollTop 400` the head stays at the
scroller's top and the corner at its left, head and lanes shift by the same
−600 px, rows and lanes by the same −400 px, all 20 pairs aligned at 80 px.

### D2.6.8 — Guards: new `check:arrange-timeline`; three existing guards edited as planned hand-overs (builder, 2026-11-01)

**Decision.** `scripts/check-arrange-timeline-structure.mjs` (68 checks,
negative-tested with 51 mutations — all caught after the "no permanent
text in the lane" check was strengthened to strip tags and blocks and
require an empty remainder; sha256-verified restores)
pins the contract above. Three existing guards changed, each the hand-over
their own text anticipated: `check-arrange-structure.mjs` (Task 0.4) reads
the head regions from the header component and adds two checks (head
rendered once; head scrolls nothing) — 32 checks (was 30); `check-arrange-rows-structure.mjs`
(Task 2.5) drops the lane pin (now the 2.6 file) and replaces its "Phase 0
colours stay until Task 2.6" and "2400px" checks with the new recipes —
106 checks; `check-tokens-structure.mjs` takes the lane off its "no tokens
yet" list ("the timeline lane stays Phase 0 until Task 2.6") — 57 checks.
The rows guard's approved hash `a4f74216021b5570` therefore changes; the
row, row fixture, select, strip, strip fixtures, EngravedLabel, tokens,
app.css, Mixer and Console are pinned by the new guard and are byte-
identical to their approved files.

## Task 2.6 — approved

**Owner, 2026-11-01:** "approved, commit." Approved as delivered in
`task-reports/2.6-report.md`; D2.6.1–D2.6.8 stand. Committed on this
signal — commit only, no push, no tag. Approved hashes (sha256, first 16):
`ArrangeRoom.svelte` `f1438bc03b63822a`, `ArrangeTimelineLane.svelte`
`39b736fe00c61fd0`, `ArrangeTimelineHeader.svelte` `8f696f7ec9f07d6e`,
`lib/arrange-timeline.ts` `2a9eafb1fab0a3ca`,
`ArrangeTimelineFixture.svelte` `952ba9b353851a03`,
`DevComponentsPage.svelte` `272ed2757a8a7f69`,
`check-arrange-timeline-structure.mjs` `7dd9a6c647750b9a`,
`check-arrange-structure.mjs` `b0dfcb14cf9cfca5`,
`check-arrange-rows-structure.mjs` `4d9c9fe463d5d590`,
`check-tokens-structure.mjs` `68a1601ed219abdf`; build `dist/index.html`
`84648e66a95c208d` (418.89 kB). The Task 2.5 work (approved earlier, never
given a commit signal) shares files with 2.6 and its `ArrangeRoom.svelte`
state could not be reconstructed hash-exactly, so 2.5, its two follow-ups
and 2.6 are committed together in one commit (see the 2.6 report's
Approval note). Open, carried forward: the push (needs a PAT and the push
signal); the design calls flagged for possible reversal — no beat lines in
the lanes, the org tab travelling with its clip head.

## Task 2.7 — Mixer channel strips (2026-11-01; uncommitted, awaiting review)

### D2.7.1 — Owner design answers taken before code (owner, 2026-11-01)

**Decision.** Four questions were put to the owner before any code and the
recommendations were accepted: (1) layout **stacked** — the full-width
strip bank on top in the Console's housing, the Task 0.5 detail panel full
width beneath it, the room scrolling vertically inside its bounded shell;
(2) identity = a **FAMILY · SOURCE engraved print plus the Tier
ScribbleSelect**, as one extra section under the strip's name head, through
a backward-compatible optional snippet on the approved strips (the Console
passes nothing); (3) selection = a **cap-labelled SEL TactileSwitch** on
every strip, lamp lit on the selected channel, radio behaviour; (4) needs
confirmation = an **amber Lamp beside the tier window**, lit until
confirmed; confirming = choosing any tier, re-choosing Supporting included,
via a small optional `onchoose` callback on ScribbleSelect; the fixture
starts 09 Bass Amp and 16 Vocal Double unconfirmed. Working assumptions
stated with the questions and not objected to: the Mixer reads the same
session as the Console and Arrange (names, colours and control values from
`TRACK_STRIPS`, classification from `ARRANGE_TRACKS` by code, Returns and
the bus from the Task 2.4 fixtures), retiring the Phase 0 "Track NN"
placeholders; tier and selection are local UI state per room (no store, no
cross-room synchronisation — the project-model task's); the numeric
Priority override is not in scope.

### D2.7.2 — The identity extension: one optional section, three rows, 81 px; family and source printed on two lines (builder, 2026-11-01)

**Decision.** `TrackStrip` and `StripModule` take an optional `identity`
snippet (`ReturnStrip` / `BusMasterStrip` forward it, default null),
rendered only when given as a seventh section `data-strip-section="identity"`
between the head and the first knob section, divided by the same machined
rule, with the head's paddings (2xs / 3xs). Without the prop the markup and
CSS are the approved files' — the Console bank passes nothing and was
measured identical before and after (bank, rails, strips 01 / 20 / R1 / B1
with every section, cap, knob and lamp at 1440 and 1024; a pixel
comparison of the bank differs only inside three lit breathing lamps, max
2 / 255). The Mixer fills the section with `MixerIdentity`: row 1 the
muted family print beside SEL (the cap switch's 34.1 px sets the row), row
2 the bright source-type print (16 px), row 3 the tier window and its lamp
(18 px); 2 px gaps, 4 px paddings — 80.1 px plus the rule, 81.1 px in all,
the same on tracks, Returns and the bus so every control stays on one line
across the bank. **Deviation from the ≈ 56 px estimate given with the
questions:** the one-line "FAMILY · SOURCE" print was measured in the
strip's own type (Roboto Condensed, xs: "GUITARS · ELECTRIC GUITAR" 178 px,
"VOCALS · VOCAL DOUBLE" 160 px, "PERCUSSION · SHAKER" 144 px) against the
144 px available inside the strip — it would have truncated the primary
identity on four tracks; splitting it over two lines costs 25 px and
truncates nothing but the catalog's longest label ("Distorted Electric
Guitar", 10 and 11, tooltip holds the full name). The strip grows from
674.4 to 755.5 px. Family and source are prints, not windows: editing
stays in Arrange (owner, D2.7.1); the role is in the source print's
tooltip; Returns print RETURN and their effect (Reverb / Delay), the bus
prints BUS MASTER and keeps blank lines (D2.4.4's blank panel, the same
idea).

### D2.7.3 — SEL: the approved cap switch, bound and put back (builder, 2026-11-01)

**Decision.** SEL is `TactileSwitch variant="cap" label="Sel" lamp="amber"`
named "Select <channel>", its `engaged` bound to the strip's own `sel`
state, which an effect resyncs to the room's `selectedId`; a press that
would disengage the lit SEL is put back (`else sel = true`) — a desk's
SELECT does not unselect, the detail panel always shows one channel. The
switch itself is unchanged: it still toggles and reports; the wrapper
decides. Verified in the browser: pressing SEL on 03 moves the lamp and the
detail panel; pressing the lit SEL keeps it; Space on R1's SEL and Enter on
B1's select them (Return bus, Bus in the panel); exactly one lamp lit at
any time. `selectedId` stays `$state` in `MixerRoom.svelte`, the bank only
passes it down and reports up.

### D2.7.4 — Needs confirmation: `tierConfirmed?` on the fixture, the Lamp, and `onchoose` on the select (builder, 2026-11-01)

**Decision.** `ArrangeTrack.tierConfirmed?: boolean` (optional; absent =
confirmed — no existing fixture or consumer changes); `SESSION_SETTINGS`
09 and 16 carry `tierConfirmed: false`. The Mixer track strip seeds
`tier` and `confirmed` from the fixture into its own `$state`, draws
`Lamp lit={!confirmed} color="amber"` named "Needs confirmation, <track>"
beside the tier window, and confirms on the select's new `onchoose` —
which fires on EVERY choice, the current option included, after an
unchanged `onchange` (the only change to the approved ScribbleSelect; the
value and `onchange` behave exactly as before). Verified: re-choosing
Supporting on 09 puts its lamp out with the tier unchanged; choosing
Background on 16 by keyboard changes the tier and puts its lamp out. The
Arrange row still does not draw the flag (D2.5.1) and the two rooms' tier
copies are independent — the shared project model is a later task.

### D2.7.5 — One session: `lib/mixer.ts` derives its channels (builder, 2026-11-01)

**Decision.** `MIXER_TRACKS` = `TRACK_STRIPS` joined to `ARRANGE_TRACKS`
by code (`track-01 … track-20`); `MIXER_RETURNS` = `RETURN_STRIPS`
(`return-room`, `return-plate`, `return-delay1`, codes R1–R3);
`MIXER_BUSES` = `BUS_MASTERS` (`bus-B1`); `MIXER_CHANNELS` in the
Console bank's order, tracks then Returns then the bus master. The
`MixerChannel {id, code, name, kind}` interface, `channelKindLabel`,
`findChannel`, `PROCESSING_CHAIN_STEPS` and `DEFAULT_MIXER_SELECTION`
are kept for the untouched detail panel; `createTrackChannels`,
`MIXER_BUS_AND_RETURN_CHANNELS` and the "Track NN" / "Reverb Return" /
"Delay Return" / "Bus master" placeholders are gone. No name, colour,
value or classification is re-declared anywhere in the Mixer.

### D2.7.6 — The Mixer bank is the Console bank's housing, value for value; the room scrolls vertically (builder, 2026-11-01)

**Decision.** `MixerBank.svelte` copies the Console `ChannelBank`'s style
block value for value (the guard compares the two blocks after renaming the
classes), so the Mixer reads as a desk of the same make and the same rules
hold unchanged: fixed 10rem modules, the tracks' rail the only horizontal
scroller, the pinned block fixed outside it, column mode under 68.75rem.
Measured: 7 / 4 / 3 complete track strips at 1920 / 1440 / 1280, column
mode at 1024 and 768 with the pinned row not scrolling, strips 160 px and
755.5 px everywhere, no overlap, no page overflow. `MixerRoom` stacks the
bank over the detail panel in a one-column grid (`max-content` /
`minmax(24rem, 1fr)`) that scrolls vertically inside the bounded room,
`overflow-x: hidden` (the `.console-layout` rule). Consequence to note: at
a 1000 px-tall window the detail panel starts below the fold (the layout
is 1200 px in row mode, 1995 px in column mode) and is reached by
scrolling — inherent in the stacked choice; Task 2.9 (detail panel) may
revisit the split.

### D2.7.7 — Guards: `check:mixer` rewritten for the 2.7 contract; six guards edited as hand-overs (builder, 2026-11-01)

**Decision.** `scripts/check-mixer-structure.mjs` (87 checks, was 40; 15
mutations, all caught, copy-verified restores) pins: the stacked room; the
reuse of the three approved strips rendered once each and no recreated
control; the optional extension's backward compatibility (the Console bank
passing nothing, byte-identical ChannelBank / ConsoleRoom / detail panel /
Arrange row and room); the derived channels and the three kinds; the
prints, SEL and its radio behaviour; the tier select, lamp, `tierConfirmed`
fixture and the exact `onchoose` addition; local selection state; the
layout rules; scope (no screws, audio, persistence, automatic
classification, numeric priority, dependency change). Six existing guards
changed, each the hand-over its own text anticipated: `check-tokens` takes
MixerRoom off its "no tokens yet" list and drops the deleted strip (55
checks, was 57); `check-channel-strip` allows the optional seventh section
and the new prop (108, was 107); `check-bus-return` allows the forwarded
prop and takes the Mixer off the "does not import the pinned strips" list
(103); `check-arrange-rows` allows `tierConfirmed: false` in the session
parse, narrows its "no select / Arrange data" check to the Console files,
drops the deleted pin and re-pins the 2.7 files (105, was 106);
`check-arrange-timeline` and `check-console-transport` re-pin the changed
files (68, 102). Re-pinned at their 2.7 state: TrackStrip
`1e06056cd61e307e`, StripModule `07c4b872de43f712`, ReturnStrip
`40fa6988990c4226`, BusMasterStrip `58cf7fac0d685dc8`, ScribbleSelect
`f0803769f208bca9`, arrange.ts `6b497f6d878362b5`, MixerRoom
`20b70cfef7ede76c`, lib/mixer.ts `f0721db5dc50e223`, app.css
`71bc0966dbdbad08` (two comment blocks brought up to date, no rule
changed). 15 guards, 1181 checks, all passing.

## Task 2.7 — approved for now

**Owner, 2026-11-01:** "commit, approved for now." Approved as delivered in
`task-reports/2.7-report.md`; D2.7.1–D2.7.7 stand. Committed on this
signal — commit only, no push, no tag. The approval covers: the stacked
room (bank over the Task 0.5 detail panel, scrolling vertically inside the
bounded shell); the three approved strips reused through the optional
`identity` snippet (the Console passing nothing, measured identical); the
81 px identity section — family print beside SEL, source print, tier
window and amber "needs confirmation" lamp — on every channel kind; SEL's
radio behaviour; confirmation by any tier choice through ScribbleSelect's
optional `onchoose`; the optional `tierConfirmed?` fixture flag with 09
and 16 unconfirmed; the channels derived from the shared session; the
Console bank's housing value for value; the measured matrix (7 / 4 / 3
complete track strips at 1920 / 1440 / 1280, column mode under 1100 px).
The deviations and follow-ups in the report stand as accepted for now —
in particular the 81 px section (not the ≈ 56 px estimate) and the detail
panel starting below the fold at 1000 px-tall windows, left to Task 2.9;
the Return / bus identity wording is the builder's call and may be
re-lettered. Approved hashes (sha256, first 16): `MixerBank.svelte`
`cf220c4e4a92a6f4`, `MixerIdentity.svelte` `d6165febdfb805db`,
`MixerTrackStrip.svelte` `ee4caa157ef1dbff`, `MixerReturnStrip.svelte`
`c131f60b71904578`, `MixerBusStrip.svelte` `523718675e6d34ba`,
`MixerRoom.svelte` `20b70cfef7ede76c`, `lib/mixer.ts` `f0721db5dc50e223`,
`TrackStrip.svelte` `1e06056cd61e307e`, `StripModule.svelte`
`07c4b872de43f712`, `ReturnStrip.svelte` `40fa6988990c4226`,
`BusMasterStrip.svelte` `58cf7fac0d685dc8`, `ScribbleSelect.svelte`
`f0803769f208bca9`, `lib/arrange.ts` `6b497f6d878362b5`, `app.css`
`71bc0966dbdbad08`, `check-mixer-structure.mjs` `3f7bb379d6a05d21`; build
`dist/index.html` `60cde15a89ab2615` (427.85 kB). Open, carried forward:
the push of `2b36389`, `0939cb1`, `bc7f5c5` and this commit (needs a PAT
and the push signal); the tier / selection state shared across rooms
(Task 3.1); the numeric Priority override; the detail panel split (2.9).

## Task 2.8 — Mixer processing-chain detail for standard tracks (2026-11-02; uncommitted, awaiting review)

Second build. The first 2.8 build was undone and purged on the owner's
instruction (2026-11-01: "return to the last checkpoint — `8a9aec2`, and
drop every 2.8 trace"); nothing of it was restored or consulted as a
spec. Direction for this build (owner, 2026-11-01): **"closer to the
documents"** — the plan and the hardware reference implemented as
written, the owner's twelve clarifications applied only where the
documents are silent. Report: `task-reports/2.8-report.md`.

### D2.8.1 — The owner's clarifications, as applied (owner, 2026-11-01)

Auto / Manual is parameter OWNERSHIP (Auto = open to future engine
updates; Manual = user-owned, protected); bypass is a separate state.
Turning a knob makes only that parameter Manual; the compressor character
gets the same ownership. A module shows AUTO / MIXED / MANUAL with ALL
Auto and ALL Manual actions — never a binary lamp that could misrepresent
Mixed. Returning a parameter to Auto changes ownership only: no value is
reset, nothing is recommended, there is no engine. The gain-reduction
meter uses the approved VU housing with a DEDICATED GR scale (0 at the
right, reduction increasing leftward), fixed illustrative readings. The
EQ graph: solid = the current response from the local control values,
dotted = the loaded response; neither is a spectrum; dynamic-EQ shading is
an illustrative range with no controls. Character is a fixture selection
with no emulation claim and never overwrites Manual values. The chain
rail is fixture state only. Unsupported channel kinds get an explicit
empty state. The explanation card is clearly authored fixture text and
never implies audio was analysed. No DSP, analysis, automatic mixing or
persistence.

### D2.8.2 — One branch, on the existing kind; the room and the session model untouched (builder, 2026-11-02)

`MixerDetailPanel` keeps its one prop (the room's selected
`MixerChannelEntry`); `MixerRoom.svelte` and `lib/mixer.ts` are
byte-identical to 2.7 (pinned). The panel branches once —
`supportsChainDetail` = `kind === "track"` — between the chain and an
explicit `role="status"` empty state naming the kind ("Processing detail
for return bus / bus channels is not available in this build"); no
selection has its own message. The identity header is read from the
shared session (code, name, the strip's org tab via `orgToken`, Arrange
family / source / role / tier). The housing copies `MixerBank`'s cheek,
radius, wood tones and trim value for value (the guard compares them).

### D2.8.3 — The chain model: `lib/mixer-chain.ts`, fixtures only (builder, 2026-11-02)

The eight blocks are the existing `PROCESSING_CHAIN_STEPS` (plan §8) in
order, each with a "home" (strip / panel / fixture) for its tooltip and
`blockEngaged` from fixture state plus the two bypass switches. Each
parameter is `{ spec, value, original, mode }`; `setParamValue` snaps /
clamps and sets Manual; `setMode` touches the mode only; `setAllModes`
touches modes only; `setCharacter` sets the selection Manual and nothing
else. One `ChainState` per standard track is created when the room
mounts and edited in place (room lifetime; no persistence by design).
Specs: FREQ 20 Hz–20 kHz log · GAIN ±15 dB / 0.5 · Q 0.3–10 log (bells) ·
THRESH −40…0 / 1 · RATIO list 1 … 20 : 1 · ATTACK 0.1–100 ms log · RELEASE
10–1000 ms log · MAKEUP 0…+20 / 0.5. Twenty fixtures, 2–4 authored notes
each, with the representative states listed in the report.

### D2.8.4 — EQ: four bands on the approved Knob; the response graph draws the settings (builder, 2026-11-02)

The plan gives no band count; four bands — LF low shelf, LMF / HMF bells
with Q, HF high shelf — are the console form (assumption 1 in the
report). Knobs are the approved Knob at the strips' 40 px
(`--knob-size: 2.5rem`, the one approved API), amber family, with a MODE
switch (approved panel TactileSwitch, "Mode" / Auto · Manual, amber lamp
= Manual) and a tooltip carrying parameter, value, "loaded as" and
ownership. The graph (`EqGraph`, SVG `role="img"` with a spoken
description): log 20 Hz–20 kHz, ±15 dB (the gain range); the current
curve and the loaded curve come from shelf / bell maths applied to the
control values — drawing only, nothing measured, no animation; the loaded
curve is dotted cream and appears only once a value differs; a dynamic
band shades its illustrative depth with a hatch and is marked DYN on its
plate. BYPASS (approved switch, amber lamp = bypassed, the ReturnStrip
precedent) dims the traces to 0.4 and darkens blocks 03 / 04 on the rail.
The band plates fold from one row to two under a 632 px bay by container
query (`39.5rem`); no knob is ever shrunk.

### D2.8.5 — Compressor: character, five controls, the GR face on the approved meter (builder, 2026-11-02)

CHARACTER is the approved ScribbleSelect over VCA · Opto · FET · Vari-Mu
(plan §8), function-bound to `setCharacter`, with its own MODE switch and
a "was <loaded>" print once changed. THRESH · RATIO · ATTACK · RELEASE ·
MAKEUP (assumption 2) are red-family ChainKnobs. Gain reduction is the
approved `VUMeter` with the new optional `face="gr"`: same movement, a
card printed 20 · 10 · 5 · 3 · 1 · 0 left to right, no red band, legend
"GR", aria 0–20 "n dB gain reduction"; the reading is the fixture's fixed
value and 0 while bypassed. The `face` prop defaults to `"vu"`; the VU
face, law, marks and exports are unchanged; no Console or dev file passes
it; the Console fingerprint is identical to the 2.7 baseline.

### D2.8.6 — Ghosts outside the artwork; Knob.svelte untouched (builder, 2026-11-02)

The ghost is a dashed pointer in a separate 400 × 400 overlay in
`ChainKnob`, at −135° + 270° × the loaded value's sweep fraction (the
Knob's own law), inert (`pointer-events: none`, `aria-hidden`), drawn
only once the value differs from the loaded one — and kept after the
parameter returns to Auto because the value still differs. The dotted
curve and "was <X>" are the other two ghosts (plan §10).

### D2.8.7 — "What changed and why": authored fixture text, stamped (builder, 2026-11-02)

A cream card (`--al-material-cream`) of the fixture's notes, each tagged
EQ / DYN EQ / COMP / CLEANUP, under the plan's own title, stamped FIXTURE
TEXT with a tooltip stating no audio was analysed and no engine has run.
The card does not react to edits (there is no engine to explain a
change); the knob tooltips carry the "loaded as" fact.

### D2.8.8 — Layout: bays side by side from 1280, stacked below; plates their own height (builder, 2026-11-02)

The EQ bay is `flex: 1 1 36rem`, the compressor bay its content's 568 px;
they share a row from 1280 up and stack beneath it; `align-items:
flex-start`, so a plate is never stretched over panel it has nothing to
put on (the deck shows under the compressor plate at ≥ 1280). The panel
keeps 2.7's `align-self: flex-start; min-height: 100%` so it may grow
past its grid row and the room scrolls. Bank, pinned block, strips and
identity are unchanged at every width (measured identical to the 2.7
matrix).

### D2.8.9 — Guards: `check:mixer-detail` added; five guards amended as hand-overs (builder, 2026-11-02)

New `scripts/check-mixer-detail-structure.mjs` (100 checks; ten mutations
caught). Amendments: `check:mixer` — the placeholder's `sends` /
`auto-manual` / `ghost-indicator` regions replaced by the five 2.8
regions, "does not branch by kind" → "branches only to an explicit empty
state, no Return / bus chain", "placeholder not skinned" → "panel is
skinned", the `MixerChannel` import check accepts `MixerChannelEntry`,
`MixerDetailPanel` re-pinned; `check:meter` — three VU-face checks scoped
to the VU face and the GR legend / aria name allowed; `check:tokens` and
`check:label-lamp` — `MixerDetailPanel.svelte` leaves their "not yet
skinned" lists; `check:arrange-rows`, `check:console-bridge`,
`check:console-transport` — `VUMeter.svelte` (and the panel) re-pinned.
Totals: 16 guards, 1277 / 1277; `npm run check` 0 / 0; build
`dist/index.html` `206dc01456dd6e60` (469.68 kB).

## Task 2.8 — approved

Owner, 2026-11-02: **"commit and push, approved."** Task 2.8 is closed as
built and reported in `task-reports/2.8-report.md`; D2.8.1–D2.8.9 stand.
The approval covers the processing-chain panel for standard tracks on the
Task 2.7 bank (identity header from the shared session; the eight-block
rail; the four-band EQ with its response graph; the compressor with
character, five controls and the GR face on the approved VU meter;
Auto / Manual as ownership with AUTO / MIXED / MANUAL and ALL switches;
the three ghosts; the authored, stamped "What changed and why"; the
explicit empty state for Return / bus), the one shared-component change
(`VUMeter` optional `face`, VU face unchanged), the eleven documented
assumptions where the documents are silent, and the deviations listed in
the report. Approved hashes: `MixerDetailPanel.svelte`
`0e596aba090663fe`, `VUMeter.svelte` `c3d850c80d9d53c7`,
`mixer-chain.ts` `ca552319984ac217`, `ChainKnob.svelte`
`251284ad9c971058`, `AutoManualControls.svelte` `a66b99885b9a4594`,
`ProcessingChain.svelte` `d58f3d2542d84efb`, `EqGraph.svelte`
`66f5a008df82bd27`, `EqSection.svelte` `1618e2fcf2f2f32a`,
`CompressorSection.svelte` `00d46e4e9990e6e1`, `WhatChanged.svelte`
`07ae383c56611fdf`, `check-mixer-detail-structure.mjs`
`2a42bf41fabdbf63`; build `dist/index.html` `206dc01456dd6e60`
(469.68 kB). Committed on this signal; pushed with `8a9aec2`, `bc7f5c5`,
`0939cb1` and `2b36389` once the owner's PAT is supplied inline (never
stored; to be revoked after the push). Open, carried forward: Task 2.9
(Return / bus detail), Task 3.1 (shared tier / selection state), the
numeric Priority override, a Knob `parse` prop, PAT revocation.

## Task 2.9 — Mixer chain-type-aware detail for bus and Return channels (2026-11-02; uncommitted, awaiting review)

Direction: the Task 2.8 panel extended to the other two channel kinds as
plan §3 (L151) requires — "the detail panel must render differently
depending on whether the selected channel is a track, a regular bus, or a
Return bus. Never a universal layout." The owner's four decisions
(ask_user, 2026-11-02) were taken before any code was written and are
recorded in D2.9.1. Report: `task-reports/2.9-report.md`.

### D2.9.1 — The owner's decisions, as applied (owner, 2026-11-02)

(1) **Return detail = the full effect module in the panel, sharing ONE
state per Return with the Mixer's Return strip.** Character, decay /
time, pre-delay / feedback, tone, Auto / Manual and bypass live once per
Return (`src/lib/return-chain.svelte.ts`); the Mixer's strip is bound to
that state through a new OPTIONAL `ReturnStrip` prop, `live`, default
null; the Console passes nothing and behaves exactly as approved
(measured: Console fingerprint identical; the Console's R1 strip keeps
ROOM · 1.4 s · 12 ms after the Mixer's R1 was changed to Hall · 1.6 s ·
15 ms). (2) **Bus B1 "Mix Bus" = the 2.8 EQ and compressor bays reused**
(gentle bus fixtures, no dynamic band, no cleanup, no sends) **plus a
status-only "Peak protection" rail block** — plan §8's final output stage
("only transparent peak protection if needed … must not perform loudness
maximization or mastering") shown as a dark lamp with the text "not
engaged (the mix leaves headroom)"; no limiter, ceiling, loudness or
mastering control exists anywhere. (3) **Return input = a read-only list
of the tracks sending to the selected Return** (code · name · send level
in the green send print), read from the track fixtures' send slots;
sends are still edited only on the track strips. (4) **CHARACTER lists:
Reverb Room · Hall · Plate; Delay Tape · Analogue · Digital** — fixture
selections with no algorithm claim; choosing one makes the character
Manual and never touches another value.

### D2.9.2 — The panel branches three ways on the existing kind; the room and the strips' identity are untouched (builder, 2026-11-02)

`MixerDetailPanel.svelte` keeps its 2.8 track branch unchanged and adds
`{:else if theReturn}` → `ReturnDetail` and `{:else if bus}` →
`BusDetail`; the explicit empty state remains for no selection (and,
defensively, for any kind without a chain). `data-detail-supported` is
true for all three kinds. The shared identity header gains kind-specific
facts only: a Return prints "Reverb · <live character>", "Input: n
sends" and "Chain: In circuit / Bypassed"; a bus prints "Output → Master"
and "Peak protection: Not engaged". `MixerRoom.svelte`, `lib/mixer.ts`,
`MixerBank`, `MixerIdentity`, `MixerTrackStrip`, `MixerBusStrip` and
every hardware component are unchanged (pinned). Bus chains are
panel-local `$state` like the track chains; Return chains are the shared
module's, so strip and panel are one state by construction rather than
by synchronisation.

### D2.9.3 — `ReturnStrip` gains one optional prop, backward-compatibly; the Mixer's Return channel binds it (builder, 2026-11-02)

The approved 2.4 strip drew its two knobs, TONE and BYPASS one-way from
the fixture, each control keeping its own interaction state. It now
holds those four settings itself (`own`, a `$state` seeded once from the
fixture — the same values, the same local behaviour) unless a caller
hands it `live`; the template binds to `model = live ?? own` with
function bindings on the approved Knob and TactileSwitch (no
geometry, artwork or API change to either). The pitfall avoided: a
getter-only `live` with a no-op setter would make the Knob snap back.
`MixerReturnStrip.svelte` (2.7) passes `live={returnLive(channel.ret)}`
and its identity tooltip follows the live character. Writes through
`returnLive` go through `setParamValue` (a turned knob is Manual) and
ignore same-value writes (a click without movement is not a turn).
Impact: Console unchanged (measured); `check:bus-return` amended
(D2.9.7).

### D2.9.4 — The Return's module: plan §8a's controls, green, with the 2.8 ownership rules (builder, 2026-11-02)

`EffectSection.svelte` is the compressor bay's layout with the Return's
controls: CHARACTER on the approved ScribbleSelect (the effect's own
list) with MODE and "was …"; DECAY + PRE-DELAY (reverb) or TIME +
FEEDBACK (delay) and TONE on green `ChainKnob`s (spec §5: sends,
auxiliary paths, reverb / delay) with MODE and the loaded-value ghost;
module status AUTO / MIXED / MANUAL with ALL AUTO · ALL MANUAL; BYPASS.
The knobs' ranges are the strip's own (`RETURN_SPECS` built from
`bus-return-fixtures.ts`), so strip and panel agree step for step. The
Return's output level is not duplicated: it is the strip's fader (the
2.8 rule), and the rail says so ("04 Return level — controls on the
channel strip"). Fixture ownership: R1 all Auto; R2 TONE Manual, loaded
+2; R3 TIME Manual, loaded 350 ms, bypassed. Three authored notes per
Return (EFFECT / TONE / OUTPUT tags) on the 2.8 card.

### D2.9.5 — The bus's chain: the track modules reused, the output stage a status (builder, 2026-11-02)

`src/lib/bus-chain.ts` builds `EqState` / `CompState` with the 2.8 specs
and constructor (`chainParam`, exported for the purpose); `BusDetail`
renders `EqSection` and `CompressorSection` unchanged. B1 fixtures: LF
80 Hz +0.5, LMF 300 Hz −1 (Q 1), HMF 3 kHz 0, HF 12 kHz +1; Vari-Mu
1.5:1, −20 dB, 30 ms, 300 ms, +0.5 make-up, 1 dB reduction; all Auto;
four notes (EQ ×2, COMP, PEAK). Rail: 01 Bus trim (strip) · 02 Static
multiband EQ · 03 Compressor · 04 Balance (strip) · 05 Bus fader (strip)
· 06 Output → Master · 07 Peak protection (status). An unknown bus falls
back to flat (plan §5: a new bus starts untouched until MIX).

### D2.9.6 — The rail takes blocks from each chain model (builder, 2026-11-02)

`ProcessingChain.svelte` now takes `blocks: RailBlock[]` ({id, step,
label, engaged, home, status?}); the track panel passes
`trackRailBlocks(chain)` (the plan §8 blocks through `blockEngaged`, as
before), the Return `returnRailBlocks` (01 Sends in · 02 Reverb/Delay ·
03 Tone / damping · 04 Return level · 05 Output → Master; 02 and 03 dark
while bypassed), the bus `busRailBlocks`. A block with a `status` speaks
it instead of "in circuit / bypassed" ("routed to Master"; "not engaged
(the mix leaves headroom)"). Lamps from state only; nothing reorders or
routes. `mixer-chain.ts` extensions are additive: `CharacterParam<Id
extends string = string>` (the compressor keeps `CharacterId`),
`NoteModule` + EFFECT / TONE / OUTPUT / PEAK, `RailBlock`,
`trackRailBlocks`, `chainParam`; every 2.8 signature is unchanged.

### D2.9.7 — Guards: `check:mixer-chain-types` added (109); four guards amended as hand-overs (builder, 2026-11-02)

New `scripts/check-mixer-chain-types-structure.mjs` (109 checks; six
mutations caught). Amendments, each because the 2.9 change supersedes
what the older check asserted: `check:mixer` — "branches only to an
explicit empty state, no Return / bus chain (Task 2.9)" → "branches to
the track chain, ReturnDetail, BusDetail and an empty state for no
selection"; the Return channel check accepts `<ReturnStrip
ret={channel.ret} {live}>`; the props check accepts the optional `live`;
`MixerDetailPanel` re-pinned. `check:mixer-detail` — the Return / bus
empty-state check → the 2.9 branches; `data-detail-supported` →
`supported`; the rail checks → `blocks` / `trackRailBlocks`; header
comment updated; `MixerReturnStrip` and `MixerDetailPanel` re-pinned.
`check:bus-return` — the Return strip's one-way `value={ret.*}` /
`engaged={ret.bypass}` shapes → the `model` bindings; the props check →
the three props; "no `$state` / `bind:` in any new file" split into "no
audio / timers / stores anywhere" + "only the Return strip's own seeded
state, bound to its approved controls"; three 2.9 checks added (106).
`check:arrange-rows` — `MixerDetailPanel` and `ReturnStrip` re-pinned.
Totals: 17 guards, 1389 / 1389; `npm run check` 0 / 0; build
`dist/index.html` `4146ee2de87530bd` (489.30 kB, gzip 128.90 kB).

## Task 2.9 — approved

Owner, 2026-11-02: **"approved, commit."** Task 2.9 is closed as built
and reported in `task-reports/2.9-report.md`; D2.9.1–D2.9.7 stand. The
approval covers the chain-type-aware detail panel (track / Return / bus
branches on the existing kind; the Return's effect module on green knobs
with the 2.8 ownership rules, its read-only sends-in list and five-block
rail; the bus's reused EQ + compressor with the status-only peak-
protection block and seven-block rail; the shared per-Return state bound
to the Mixer's Return strip through `ReturnStrip`'s optional `live`
prop, the Console unchanged), the three backward-compatible shared
changes (`ReturnStrip` `live`, `ProcessingChain` `blocks`, additive
`mixer-chain.ts` exports) and the guard hand-overs (D2.9.7). Committed
only — not pushed (the owner said "commit").

## Task 3.1 — Shared project model and stores (2026-11-02; uncommitted, awaiting review)

Direction: the state foundation of Phase 3 — one typed project model, one
authoritative store, the three rooms reading it instead of their own
fixture copies (plan §5, §14, §16, §18). No routing behaviour, undo,
autosave, persistence, new UI or dependency. The owner's four decisions
(ask_user, 2026-11-02) were taken before any code was written and are
recorded in D3.1.1. Report: `task-reports/3.1-report.md`; the model is
described in `data-model.md` (new).

### D3.1.1 — The owner's decisions, as applied (owner, 2026-11-02)

1. **Tier and Priority:** the Priority (1–10, plan §5) is the stored
   value; the Prominence Tier is derived from it in bands (Primary 8–10,
   Supporting 4–7, Background 1–3); choosing a tier sets an anchor
   priority (see D3.1.2).
2. **Ids:** kind-prefixed — `track-01` … `track-20`, `return-room` /
   `return-plate` / `return-delay1`, `bus-B1`. The printed codes (`01`,
   `R1`, `B1`) stay display fields. Sends reference Return ids.
3. **Scope of the write operations:** every editable control the approved
   UI has writes to the store (Console strip controls, send slot and
   level, Arrange family / source / tier, the Mixer's tier, the Return's
   level / mute / solo / bypass and effect knobs, the bus strip).
4. **Confirmation:** any tier choice — from Arrange or the Mixer —
   confirms the track (clears "needs confirming").

### D3.1.2 — Tier anchors 9 · 5 · 2; a tier choice moves the priority only when the tier changes (builder, 2026-11-02; changeable)

The owner chose "priority stored, tier derived" without naming the
anchors. Chosen: the middle of each band, biased to the band's centre of
use — Primary **9**, Supporting **5**, Background **2** (`TIER_ANCHOR`).
Re-choosing the tier a track already has does not move its priority (a
future numeric override inside the band must survive a confirming click).
The fixture session seeds each track with its fixture tier's anchor, so
the Arrange rows and the Mixer identities print exactly what they printed
before. The numbers are a convenience, not a semantic: changing them later
changes nothing but the seeded values.

### D3.1.3 — One `$state` tree in `store.svelte.ts`; reads, narrow writes, memoised views (builder, 2026-11-02)

`const state: Project = $state(createSessionProject())` is the only
project state in `src/`. `project` exposes reads and live selectors
(`sendsInto`, `sendReturns`, `tierOf`, `outputLabel`); `ops` exposes one
typed operation per editable control, each validating its id (unknown ids
throw — a programming error, never a silent no-op), clamping to the
control's approved range and skipping same-value writes (a Knob assigns on
every pointer move; a same-value write must not count as a "turn" for the
2.8 ownership rule). Views (`trackStrip`, `trackMeta`, `arrangeTrackOf`,
`returnLive`, `returnStripOf`, `busStripOf`, `busLive`) are getter objects
over the entity, memoised per id in `Map`s, so a strip in the Console and
the same strip in the Mixer bind the very same object — derived display
data, never a second mutable copy. The 2.8 chain helpers (`setParamValue`,
`setMode`, …) stay the write path for chain parameters: they are already
narrow and typed, and wrapping them would duplicate the ownership rules.

### D3.1.4 — Typed routing references, data only (builder, 2026-11-02)

`OutputRef = BusId | "master"` on tracks, Returns and buses; `SendSlot.to:
ReturnBusId | null`. Seeded with the Task 2.4 reading (every track → the
one bus master `bus-B1` → Master; Returns → Master). `ops.setSendTo`
accepts only a Return the project has. No UI edits an output and nothing
validates a graph — that is Task 3.2, which will add the rules on top of
these references rather than change them.

### D3.1.5 — The Return and bus chains move into the entities; the Console and the Mixer now share them (builder, 2026-11-02)

Task 2.9 kept one chain per Return in a module-level `Map`
(`return-chain.svelte.ts`) and the bus chains as panel-local `$state`,
with the Console's Return strip deliberately *not* bound ("the Console
passes nothing"). In 3.1 the chain is a pure value under `ReturnBus.chain`
/ `Bus.chain`, `return-chain.ts` has no state, and the Console binds
`live={returnLive(id)}` / `live={busLive(id)}` like the Mixer. This is
the task's objective (one state source for all rooms); it supersedes that
one 2.9 phrase and nothing else of 2.9. Visible consequence: a Return
knob turned in the Mixer now reads the same in the Console (measured:
R1 decay 1.9 s in both; B1 MUTE in both). The chain's identity fields
(`returnId`, `name`, bus `output`) left the chain for the entity.

### D3.1.6 — Optional bindings; strips keep a seeded fallback for unbound use (builder, 2026-11-02)

`ReturnStrip`, `BusMasterStrip` and `ArrangeTrackRow` keep one `own`
`$state` behind `model = live ?? own` so the `#/dev/components` playground
and any future fixture use still work with plain objects (a plain fixture
object is not reactive; without the fallback an unbound knob would not
move). `TrackStrip` binds whatever `track` it is given (the rooms give it
the store view) and holds no state. `StripModule` gained bindable
`faderValue` / `mute` / `solo` with defaults so every approved call site
is unchanged. `SendSlot` is id-agnostic (`SlotState { to: string | null;
level }`) and lists whatever Returns it is handed (default: the fixture
list). All backward-compatible; dimensions and styles untouched (0-diff
regressions at every established width).

### D3.1.7 — DOM hook values that named a Return or bus now carry its id (builder, 2026-11-02; documented equivalent)

`data-send-to`, `data-send-option`, `data-detail-return`, `data-detail-bus`
and `data-mixer-channel` carry kind-prefixed ids (`return-plate`,
`bus-B1`, `track-01`) instead of the 2.x keys / codes. The prompt allows a
documented equivalent where a model conversion requires one; the printed
text is unchanged. The measurement scripts were updated accordingly.

### D3.1.8 — Guards: `check:project` added (122); eight guards amended as hand-overs (builder, 2026-11-02)

New `scripts/check-project-store-structure.mjs` (122 checks; four
mutations caught: a second `$state` in the store, a send without Return
validation, a bank keeping a `$state` copy, a room reading a fixture
array). Amendments, each because the 3.1 change supersedes what the older
check asserted (architecture statements rewritten to the 3.1 truth, intent
kept — no store import in the Arrange row's children, no automatic
classification, no Priority UI, no screws): `check:arrange`,
`check:arrange-rows`, `check:arrange-timeline`, `check:bus-return`,
`check:channel-strip`, `check:mixer`, `check:mixer-detail`,
`check:mixer-chain-types` (+1 check; the 2.9 "Console passes nothing" →
"Console passes no `identity`; both rooms bind `live`"), and re-pins in
`check:console-transport`. Totals: 18 guards, 1513 / 1513; `npm run check`
0 / 0; build `dist/index.html` `8cda56b0a62d4ff9` (498.69 kB, gzip
131.07 kB).

## Task 3.1 — approved

Owner, 2026-11-02: **"approved, commit and push."** Task 3.1 is closed as
built and reported in `task-reports/3.1-report.md`; D3.1.1–D3.1.8 stand,
including the tier anchors 9 · 5 · 2 (D3.1.2) until the owner names
others. The approval covers the typed project model (`model.ts`), the one
authoritative store (`store.svelte.ts`: one `$state` tree, `project` reads,
20 narrow `ops`, seven memoised views), the fixture session
(`session.ts`), the three rooms reading the store through views with the
approved UI measured pixel-identical, the backward-compatible component
bindings (D3.1.6), the id-carrying DOM hooks (D3.1.7), the Console ↔ Mixer
sharing of the Return / bus strip state (D3.1.5, superseding the 2.9
"Console passes nothing"), the new `data-model.md` and the guard hand-overs
(D3.1.8: 18 guards, 1513 / 1513). Committed on top of `55e0c5b` and pushed
to `main` together with it on the owner's signal (PAT inline, not stored).
Task 3.2 (routing) has not been started.

## Task 3.2 — Routing graph and Auto / Manual state plumbing (2026-11-02; uncommitted, awaiting review)

Direction: the second Phase 3 state task — the track–bus–Return
relationships become a validated routing graph with cycle detection, and
the Auto / Manual ownership the approved UI already shows is plumbed through
the one store so a Manual value survives rooms and unrelated edits (plan §5,
§8, §8a, §16, §14 roadmap "3.2"). No routing UI, no undo / autosave /
persistence, no audio, no sidechain, no new dependency, no visual change.
The owner's four decisions (ask_user, 2026-11-02) were taken before any code
was written and are recorded in D3.2.1. Report:
`task-reports/3.2-report.md`; the graph and the ownership rules are
described in `data-model.md` §7–§8.

**Correction to the "Task 3.1 — approved" entry above (builder,
2026-11-02):** Task 3.1 was committed as `6f99909` on top of `55e0c5b`, but
**neither has been pushed** — the push needs the owner's PAT, which was not
supplied in that session. The entry's "pushed to `main` together with it" is
wrong; remote `main` is still `5daada5` (Task 2.8). The push stays open
until the owner provides a token (inline, never stored; revoke afterwards).

### D3.2.1 — The owner's decisions, as applied (owner, 2026-11-02)

1. **No routing UI control in this build** — the store, the validation and
   the tests only; the existing prints (the Mixer's bus detail "Output →
   Master", the Return's incoming-send list) follow the store. A later task
   adds the field.
2. **Rejection feedback is an API, both forms:** `destinationsFor(id)`
   returns every candidate destination with the verdict routing there would
   get (filter on `ok` to offer only valid destinations) and every rejected
   verdict carries a plain-language `message` for the field to print.
3. **Return-to-Auto stays D2.8 ownership-only** — the prompt's "restore the
   baseline" bullet is overridden by the owner; the value stays, `original`
   still records the baseline.
4. **A Return's output is fixed at Master** — the validator rejects any
   other destination, a Return is never a destination, and there is no
   Return output op or control. Returns keep their id, kind, incoming sends
   and chain untouched by routing edits.

### D3.2.2 — The routing graph is a pure module over a structural project (builder, 2026-11-02)

`src/lib/project/routing.ts` has no Svelte, no state, no DOM and **no
writes**: `validateRoute`, `validateGraph`, `destinationsFor`, `routeOf`,
`routingEdges`, `isRoutable`, `routingName` take a `RoutingProject` —
`{ tracks, returns, buses }` with `id`, `name`, `output` (and
`channel.sends[].to` on tracks) — which the real `Project` satisfies
structurally and so does a three-line test fixture. Nodes are the channels
plus Master; edges are every channel's one *output* edge and the tracks'
*send* edges into Returns (`RoutingEdgeKind = "output" | "send"`). Rules, in
the order reported: source exists → destination is Master or an existing bus
(a track or Return id is "not a bus", a missing bus id is dangling) →
no self-route → a Return routes to Master only → the destination's output
chain reaches Master without meeting the source (direct and indirect
cycles; a graph that already loops elsewhere is reported as "already loops",
never walked forever). Verdicts are values: `{ ok, reason, message, path }`
with six reason codes (`unknown-source`, `unknown-destination`,
`destination-not-a-bus`, `self-route`, `return-output-fixed`, `cycle`) and
messages such as "Routed: Kick → Master", "Unchanged: Mix Bus → Master",
"Rejected: Bus B2 → Bus B1 → Bus B2 would loop". Sidechains (plan §8, Phase
7) are a documented future third edge kind validated by the same walk —
reserved in the shape, not modelled.

### D3.2.3 — The store validates first and writes second; routing ops return the verdict (builder, 2026-11-02)

`ops.setTrackOutput(id, to)` and `ops.setBusOutput(id, to)` call
`validateRoute(state, id, to)` on the untouched project, write `output` only
when the verdict is `ok` **and** the reference changes, and return the
verdict in every case — so a rejected route leaves the project exactly as
it was (tested by JSON snapshot), with no trial mutation and no rollback.
An unknown *source* throws, like every other op (a programming error); an
unknown *destination* is a verdict, because it is a thing a user could
pick. There is no `setReturnOutput` (D3.2.1 §4). The reads
`project.routeOf`, `project.destinationsFor`, `project.validateRouting`
delegate to the module over the live state. These are the only two writes
of an output reference in `src/`; no component imports the routing module
(guarded).

### D3.2.4 — Each send keeps its own Auto / Manual ownership (builder, 2026-11-02; plan §5)

`SendSlot` gains `mode: Mode` (the Task 2.8 type), seeded `"auto"` for
every slot by the session — a loaded send level is the engine's value until
a hand moves it. `ops.setSendLevel` on an **assigned** slot makes that send
Manual (a same-value write is not a turn; an unassigned slot has no send to
own); `ops.setSendMode` writes the mode only (D2.8). `ops.setSendTo`
assigns and decides ownership from the level already in the slot — Auto
when it equals the baseline for that Return (`loadedSendLevels[to]`, else
`DEFAULT_SEND_LEVEL`), Manual when a hand had already moved it — because
the approved `SendSlot.svelte` (D2.2.9–12, unchanged) writes the level
first and the destination second; clearing a slot is OFF and Auto. **No
print of the send's mode exists** — the approved strips have no lamp for
it and 3.2 adds no UI — so the rule is proven by tests and is ready for the
day the strips show it. No change to the chain rules of 2.8 (`setParamValue`
→ that parameter Manual; `setMode` / `setAllModes` write modes only).

### D3.2.5 — A node test harness with no new dependency (builder, 2026-11-02)

`npm test` = `node --import ./tests/register.mjs --test
tests/routing.test.mjs tests/store.test.mjs`. `tests/loader.mjs` is a
`module.register` hook that transpiles the project's TypeScript with the
`typescript` already in devDependencies and compiles `.svelte.ts` modules
(the store's runes) with `svelte/compiler`'s `compileModule` — so the
**real** store module is exercised in Node, not a copy. Thirty-three tests,
every title a required behaviour of the prompt (the routing guard checks
the titles are present). Alternatives rejected: vitest (a new dependency,
out of scope), testing a hand-rolled store double (would not prove the
store).

### D3.2.6 — The fixture has one bus, so bus chains and cycles are proven in Node, not in the browser (builder, 2026-11-02)

The approved session has a single bus (B1 "Mix Bus"), and 3.2 may neither
change fixtures nor add a routing control. Bus → Bus → Master and the
direct / indirect cycle rejections therefore run on small test projects in
`tests/routing.test.mjs`; the browser evidence is limited to what the store
prints today (bus output, Return sends) plus the Auto / Manual persistence
walk (`tools/measure/manual-persist-3.2.js`). A browser-level routing
demonstration arrives with the control.

### D3.2.7 — Guards: `check:routing` added (90); `check:project` and `check:channel-strip` amended; 19 guards 1603 / 1603 (builder, 2026-11-02)

`scripts/check-routing-structure.mjs` (90 checks; five mutations caught:
a write inside the routing module, a store write before validation, a
`sidechain` edge kind, a component importing the routing module, a
return-to-Auto that resets the value) pins the routing module, the tests,
the harness, the store / model / session and the unchanged prints.
`check:project` amended to the 3.2 truth (23 ops incl. `setSendMode`,
`setTrackOutput`, `setBusOutput`; `SendSlot.mode`; `validateRoute` import
required; the old "no graph / cycle words in the store" negative dropped
because the store now legitimately imports the validator — the routing
words still may not appear in `model.ts`); `check:channel-strip`'s
session-seeding check now accepts `mode: "auto"`. Re-pinned (content
changed by 3.2): `model.ts`, `session.ts`, `store.svelte.ts`. Totals: 19
guards, 1603 / 1603; `npm run check` 0 / 0; `npm test` 33 / 33; build
`dist/index.html` `d9f9aee32f4335f1` (502.47 kB, gzip 132.46 kB; 240
modules — +1, the routing module).

### D3.2.8 — `data-model.md` correction: two send slots, not four (builder, 2026-11-02)

The 3.1 text said "Four fixed slots per track (D2.2.9)"; D2.2.9 and the
code (`SEND_SLOT_COUNT = 2`) say two. Corrected in the 3.2 revision of the
document, as its own status line requires ("say so in the next task
report").

## Task 3.2 — approved

Owner, 2026-11-02: **"approve, commit."** Task 3.2 is closed as built and
reported in `task-reports/3.2-report.md`; D3.2.1–D3.2.8 stand. The approval
covers the pure routing module (`routing.ts`: graph, rule order, verdicts
with reason codes and plain-language messages, `destinationsFor` as the
feedback API, `validateGraph`), the validate-first routing ops that return
the verdict (D3.2.3), the per-send Auto / Manual ownership (D3.2.4), the
node test harness and its 33 tests (D3.2.5), the guard hand-overs (D3.2.7:
19 guards, 1603 / 1603) and the `data-model.md` revision (§7–§8, D3.2.8
correction). Committed on top of `6f99909`; **not pushed** — the signal was
"commit" only, and the push of the three local commits (`55e0c5b`,
`6f99909`, this one) still needs the owner's PAT (inline, never stored;
revoke afterwards). Task 3.3 has not been started.

## Task 3.3 — Undo / redo, autosave foundations, channel-settings copy / paste (2026-11-02; uncommitted, awaiting review — the owner handles Git)

Direction: the last Phase 3 state task — a history over the one store
(undo / redo across rooms), the project manifest and a save lifecycle
(autosave foundations), and channel settings copied between compatible
channels as one undoable edit (plan §4 "undo / redo", "copy / paste",
"keyboard shortcuts"; §11 autosave and the manifest; L565 a separate
persistence module; §14 roadmap "3.3 — then stop for the Phase 3 review").
No UI redesign, no new control, no new dependency, no backend, no load /
multi-project / cloud, no routing UI, no audio; D2.8 return-to-Auto and the
3.2 routing / Return rules unchanged. The owner's four decisions (ask_user,
2026-11-02) were taken before any code was written — D3.3.1. Report:
`task-reports/3.3-report.md`; the editing layer is described in
`data-model.md` §10. **Not committed, not tagged, not pushed** (owner's
instruction); the build stops here for the full Phase 3 review.

### D3.3.1 — The owner's decisions, as applied (owner, 2026-11-02)

1. **Undo / redo are keyboard shortcuts only** — Ctrl / Cmd + Z, Ctrl / Cmd +
   Shift + Z, Ctrl + Y; no visible control in any room (the approved UI is
   untouched). A later task may add an Edit menu over the same `history`.
2. **Autosave writes to `localStorage` and never restores on load** — the
   app opens the approved fixture session every time; the saved manifest
   (`alloy.project.<id>`) waits for a load task. Nothing else is persisted.
3. **A pasted parameter takes the source's value AND its Auto / Manual
   mode** — the chain's ownership travels with its settings; `original` on
   the destination is untouched, so return-to-Auto stays D2.8.
4. **`window.alloy` exists only when the URL has `?debug`** — `{project,
   ops, history, clipboard, autosave, fields, flush}` for browser evidence
   and the console; inert otherwise. It is also the only way to copy / paste
   in this build (no UI, by the prompt).

### D3.3.2 — One field registry; history is a diff over it, recorded by one observer (builder, 2026-11-02)

**Alternative rejected:** snapshotting the project on every edit
(`JSON.stringify` of the state: 344 kB and 36 ms per snapshot in the
experiment — too heavy for a fader drag, and it would also capture things
that must never be undone). **Chosen:** `fields.ts` enumerates every
editable leaf once (1 076 `FieldRef`s with stable id-based paths, typed
values, a copyable flag and a get / set pair writing the same properties the
ops write); `history.ts` keeps one baseline per field and `observe()`
records what moved as `{path, before, after}` patches. The store's single
`$effect` (inside `$effect.root`) reads every field and calls `observe()`
untracked, so **no write path changed**: the 23 ops, the Task 2.8 helpers,
the components' direct bypass toggles and the clipboard all land in history
without knowing it exists. Boundaries follow from the registry: room-local
selection, fixture / presentation state, `original` values, the arrangement
and the clipboard are not fields, so they cannot enter an entry; restores
run with observation suspended, so undo / redo never record. Grouping: one
synchronous block = one entry (a knob turn is value + mode in one step);
coalescing only with a clock, into an open entry, within 1 000 ms, for the
same fields (a drag is one step; two controls stay two steps); the store's
paste is a labelled `transaction`. Limit 200 entries (patches are small; no
UI navigates deeper yet). The pure module has no Svelte, DOM, storage or
clock of its own; the shell injects `performance.now`. The cost: the observer
reads 1 076 getters after each writing block — measured in Node (2 000
iterations over the real store): `observe()` 0.12 ms with nothing changed,
0.16 ms after a level write, `undo()` 0.21 ms — against the rejected
snapshot's 36 ms.

### D3.3.3 — The manifest is the registry; autosave is a lifecycle over injected storage and never lies (builder, 2026-11-02)

`persistence.ts` serialises the registry (schema `alloy.project-manifest/1`,
project id + name, `channels[id][rel] = value`; no timestamp, so unchanged
content is byte-identical — 29 646 bytes for the session) and owns one save
lifecycle: `clean | dirty | saving | saved | failed`, `dirty = revision ≠
savedRevision`. Rules that make "saved" trustworthy: the saved revision and
text move only after a successful write (or when the text already equals the
last saved text — then the write is skipped and counted); a failing write
keeps the previous saved point, reports `failed` with the error, and the
project stays dirty until a later write succeeds or the content returns to
the stored copy; edits during an asynchronous write re-arm the timer;
without an adapter nothing is ever "saved" (`storage: null`). Storage and
scheduling are injected (memory + manual scheduler in tests; `localStorage` +
`setTimeout`, 1 000 ms, in the shell behind a try / catch), so the module
has no browser dependency and the store no persistence code. The store
forwards every history event to `autosave.notifyChange()` — one mechanism,
shared by every room, that only reads the state. Write-only by the owner's
decision: `parseManifest` exists for tests and the future load task; nothing
applies a manifest.

### D3.3.4 — The clipboard validates the whole payload first, writes in registry order, and the store makes it one entry (builder, 2026-11-02)

`clipboard.ts` is the application's own clipboard (no `navigator.clipboard`,
no DOM): `copyChannelSettings` takes the copyable fields of a channel — the
documented boundary: `channel/trim`, `channel/pan` | `balance`,
`channel/level`, every `chain/*` field (bypass flags, parameter value and
mode, character value and mode); never identity / classification, `output`,
sends, mute, solo — into a schema'd payload (`alloy.channel-settings/1`,
kind, Return effect, source id / code / name, `settings` by `rel`).
`pasteVerdict` decides in order — `malformed`, `unknown-destination`,
`kind-mismatch`, `effect-mismatch` (reverb ≠ delay Return), `shape-mismatch`
(a key the destination has no copyable field for), `invalid-value` — and only
a fully valid payload yields a plan (differing fields only, registry order);
a rejected paste writes nothing, an unchanged one is `ok` with 0 changes and
writes nothing. The store's `clipboard.paste` wraps `applyPaste` in
`history.transaction("Paste settings → 03 Snare Bottom")` so a paste of up
to 37 settings is one undo step, visible in every room through the same
bound objects; the verdict's plain-language `message` is returned as the API
for a future Edit action (same pattern as the 3.2 routing verdicts). `held`
is a module variable, not project state.

### D3.3.5 — The shell is the one place the browser meets the foundations (builder, 2026-11-02)

`shell.ts` + one call in `main.ts` after mount: the history clock, the
autosave attachment, the `keydown` handler and the `?debug` handle. The
decisions are pure (`shortcutAction`, `isTextEntry`, `wantsDebugHandle`):
shortcuts are ignored with Alt, when another handler already prevented the
event, and when the target is a text-like input / textarea / contenteditable
(the browser's own text undo belongs to a field being typed in — the Knob's
numeric entry is such a field); the handler `preventDefault`s so the
browser's navigation undo never fires. No component or room imports the
shell or any editing module (guarded).

### D3.3.6 — Tests: 43 new node tests (76 total); the loader learned `./store.svelte` (builder, 2026-11-02)

`tests/history.test.mjs` (13), `persistence.test.mjs` (9),
`clipboard.test.mjs` (8, pure project — the registry over a session, the
copyable list pinned by name, every rejection reason), `editing.test.mjs`
(8, the REAL store: the observer through `await tick()`, every op / helper /
direct write path → exactly one entry each and a byte-identical project
after undoing all 33, no-ops and rejections record nothing, cross-room views
under undo / redo, routing validity preserved, paste as one entry, autosave
wired) and `shell.test.mjs` (5, a fake window: clock, debounce, shortcuts,
text-entry exemption, uninstall, `?debug`, disabled storage). `npm test`
runs all seven files (33 + 43 = 76). `tests/loader.mjs` (3.2) treated
`./store.svelte` as a file with an extension and could not resolve the
shell's import; the extensionless rule now stops only at real file
extensions (`.ts / .js / .mjs / .json / .css`) — backward compatible, 3.2
tests unchanged and green.

### D3.3.7 — Guards: `check:editing` added (69); `check:project` and `check:routing` re-scoped; 20 guards 1672 / 1672 (builder, 2026-11-02)

`scripts/check-editing-structure.mjs` (69 checks; ten mutations caught: a
send destination or a mute made copyable, restores recorded as edits, the
limit changed without the document, `written()` not moving the saved
revision, a shortcut without `preventDefault`, the debug handle without
`?debug`, a paste outside the transaction, an undo button in a strip, a paste
skipping value validation) pins the five modules, the store, `main.ts` and
`App.svelte`, requires `data-model.md` §10 and the seven-file test script,
and forbids any undo / redo / clipboard / paste / autosave text or control
in the UI. `check:project`: the ops-body slice now ends at the ops object's
own `} as const;` (the clipboard object follows it), the store negative
drops `undo|redo|history` (delegation to the 3.3 modules is required
instead) and the scope negatives exclude the store, which must still touch
no storage; the "no `$effect`" negative becomes "exactly the observer".
`check:routing`: the 3.2-code negative no longer covers the store (which now
names history / clipboard by delegation but still may not touch storage,
timers or clocks); the test-script check accepts appended test files.
Re-pinned (content changed by 3.3): `store.svelte.ts` (all three guards),
`tests/loader.mjs`. Totals: 20 guards, 1672 / 1672; `npm run check` 0 / 0;
`npm test` 76 / 76; build `dist/index.html` `d6c83402668f4cd3` (517.36 kB,
gzip 137.17 kB; 245 modules — +5, the five editing modules; +14.89 kB /
+4.71 kB gzip over 3.2).

## Task 3.3 — approved

Owner, 2026-11-02: **"approved, commit, and push"** (PAT supplied inline).
Task 3.3 is closed as built and reported in `task-reports/3.3-report.md`;
D3.3.1–D3.3.7 stand (the coalescing window of 1 000 ms, the limit of 200,
identity classification in history, the manifest carrying identity and
routing, the label / rejection wording and Ctrl + Y as redo stand as chosen
unless the owner names others later). The approval covers the field
registry and its copyable boundary (D3.3.2, D3.3.4), the diff history with
the store's single observer (D3.3.2), the manifest and the autosave
lifecycle (D3.3.3), the clipboard with its verdict API and one-transaction
paste (D3.3.4), the shell (D3.3.5), the 43 new node tests (D3.3.6) and the
guard hand-overs (D3.3.7: 20 guards, 1672 / 1672). Committed to local `main`
on top of `d9ee17a` (Task 3.2) and **pushed to remote `main`** together with
the three commits that were waiting for a token — `55e0c5b` (2.9), `6f99909`
(3.1), `d9ee17a` (3.2); remote `main` moves from `5daada5` to this commit.
The token was used inline only and never stored; the owner is reminded to
revoke it. **Phase 3 is complete; the build stops here for the full Phase 3
review. Phase 4 has not been started.**

## Task 4.1 — Home, onboarding, and Settings (2026-11-02; uncommitted, awaiting review — the owner handles Git)

Direction: the Phase 4 foundation on the approved Phase 3 state — a Home
screen that lists the projects this browser has actually stored, a way to
start empty, a skippable first-run guide, and Settings for the preferences
the plan names (hardware profile override, export output types,
accessibility / reduced motion) — plan Phase 4 (L651–653), §11 (hardware
profiles, autosave / recent projects), §12 (export: WAV-only, user-selected
destination folder). No audio, import, DSP, playback or rendering; no
cloud / accounts; no multi-project management beyond recent + start-empty;
no new routing, undo / redo or clipboard behaviour; no room redesign; no
new dependency. The owner's four decisions (ask_user, 2026-11-02) were
taken before any code was written — D4.1.1 / D4.1.2 / D4.1.3 / D4.1.6.
Report: `task-reports/4.1-report.md`; the lifecycle and settings are
described in `data-model.md` §11. **Not committed, not tagged, not pushed**
(owner's instruction); the build stops here for review — Phase 5 is not
started.

### D4.1.1 — Reopen = the template under the saved identity + the saved values; the last project is restored at start (owner, 2026-11-02)

The Task 3.3 manifest holds identity and field values, not channel
structure (D3.3.3). The owner chose, over "list only / reopen nothing" and
"reopen only the fixture", that an entry **reopens as its template with
its saved values applied**, and that the app **restores the last opened
project at start** (falling back to the pristine fixture session when
nothing valid is stored). Applied: `project.template` added to the identity
(additive; the manifest schema is unchanged and a 3.3 manifest of the
fixture's id still opens); `lifecycle.ts` rebuilds the template and applies
the values through the registry's validated setters plus the project-level
reference rules, then `validateGraph`; a value that fails keeps the
template's and is reported as skipped; what cannot be rebuilt is reported
with its reason and never offered as openable (statuses `missing ·
damaged · mismatch · unknown-template · invalid · no-storage`). This
reverses the 3.3 rule "autosave never restores on load" **by the owner's
decision**; the 3.3 write side is unchanged. Boundary, documented rather
than invented: a reopened project cannot carry channel structure — enough
for the two templates that exist; imported projects (Phase 5) will need
the manifest to carry their tracks.

### D4.1.2 — The empty project is Master only, with explicit empty states in every room (owner, 2026-11-02)

Over "the plan's two default Returns" and "Returns + the Mix Bus", the
owner chose **no channels at all**: `tracks · returns · buses` empty, an
empty arrangement, the Master output (not a channel) implied. The plan's
default Returns are created with the audio engine; their parameter values
are not invented. Every room renders `EmptyProjectNotice` instead of its
channel UI (Console: the channel-bank zone — bridge and transport stay;
Arrange: the room; Mixer: the layout), one line and a link back to Home,
in the Mixer detail's empty-state housing. Name `Untitled project`
(then `Untitled project 2`, …); the Home "Start" panel says "A new project
under a new name, with nothing in it: Master only. Stems arrive with the
audio engine."; the rooms' notice says "“<name>” has no tracks, Returns
or buses yet — … Stem import arrives with the audio engine (Phase 5)."

### D4.1.3 — Home at `#/`, Settings at `#/settings`; the wordmark is the way Home; neither is a room (owner, 2026-11-02)

Over "Home as a fourth tab" and "Settings inside Home", the owner chose two
screens outside the room navigation. The empty hash, `#`, `#/` and anything
unrecognised land on Home (before Home existed the fallback was the
Console); Settings has its own hash and a link in the header beside the
tabs and on Home. The room tabs, their routes and their order are exactly
as approved (`RoomNav` pinned, unchanged). `data-route` on the shell lets
the stylesheet keep the rooms pinned to the viewport while Home and
Settings scroll as a page (`app.css` unchanged — the rule lives in the
screens). Builder's choices within this: **start-empty offers Arrange,
reopen offers Console** — Home never navigates by itself; the status line
says what happened and the card's three room links are the way in.

### D4.1.4 — The first-run guide is one panel on Home, never a modal, remembered as `onboarding` (builder, 2026-11-02)

Shown while `onboarding` is `pending` — on a fresh browser, and again
after Settings "Show again" — as the first panel of Home: four lines of the
essential workflow (Start · Import · Mix · Inspect) stated as this build
has them (import, MIX and export arrive with the audio engine), with two
momentary keys, **Skip** (→ `skipped`) and **Done** (→ `done`). Nothing is
covered, nothing waits for it: no dialog, no `aria-modal`, no `inert`, no
focus trap, no overlay, no timer; the header's tabs and every room are
reachable with it on screen (guard: negative over the screens). Completion
and dismissal are kept in the settings document, so a reload does not show
it again; without storage it shows every visit and says nothing about it
(it is a panel, not a nag).

### D4.1.5 — Reduced motion is a stored preference mirrored onto `<html data-motion>`, on top of the system query (builder, 2026-11-02)

The approved components already stop their breathe, drift and transitions
under `prefers-reduced-motion` (D1.6.7 and the rest). The preference adds
`motion: "system" | "reduced"`; the shell mirrors it onto `<html
data-motion>` at install and on every change, and `preferences.css`
reduces **every** animation and transition under `reduced` to 0.01 ms, one
iteration, no delay, `!important` — near-zero rather than none so end
states are reached and end events still fire. `system` leaves the media
query to decide, as before. Measured in the browser: MIX lamp breathe 4 s ·
infinite → 1e-05 s · 1; Console VU drift the same; fader transition
1e-05 s; back to 4 s · infinite when the preference returns to `system`.
No visual redesign: keyboard access, the visible focus ring and the
semantic labels are the components' own.

### D4.1.6 — Settings carry the plan's items only; export = WAV printed as a fact + the three output types; the folder is chosen at export time (owner + builder, 2026-11-02)

The owner chose the minimal set: hardware profile, export output types,
motion, and a way to bring the guide back — no theme, no shortcuts editor,
no audio device, nothing the plan does not name. **Hardware profile:**
`auto` (default — "the profile the hardware benchmark selects", Phase 5.2)
and the plan §11 trio Lite · Standard · Performance printed with the plan's
intents only (RAM, concurrency, buffering, render time) — **no benchmark
numbers, cores or gigabytes are invented**; the panel says it is stored now
and read by nothing yet. **Export:** the format is a printed fact, "WAV"
(plan §12: the only format in v1), not a preference; the three output
types are toggles (Full mix on by default — the beginner's flow; Stems and
Buses off); a **destination folder is not a preference** — plan §12 says
"user-selected destination folder", i.e. chosen at export time, and a
stored folder would be a fabricated capability in a browser build (guard:
negative over `showDirectoryPicker` / `webkitdirectory` / sample rate /
bit depth / dither / other formats). Both are **stored for later** and
labelled so; motion and the guide are operational now.

### D4.1.7 — The lifecycle is pure of the browser and reads what is stored on every render; `ensureStored` gives an unedited project its first copy (builder, 2026-11-02)

Storage, the wall clock and the id source are injected (the shell gives
`localStorage`, `Date`, `crypto.randomUUID`; tests give maps and counters),
exactly as autosave's are (D3.3.3). Home never trusts the index: each entry
is judged against its own key every time the list renders, so an entry
whose copy was cleared, overwritten by another project or written by a
later build shows its reason at once. A project that was never edited has
nothing for autosave to write, so switching away from it would have left
an entry with "no saved copy" — `ensureStored()` flushes autosave and then
writes the template's values under the identity when the key is empty,
bypassing autosave's bookkeeping (its next comparison is against the same
text). Order of a switch: flush / first copy of the outgoing project →
`loadProject` → `autosave.retarget` → index `touch` (writing the incoming
manifest first risked clobbering under a stale key). The index is capped
at 12 and is a convenience: its write failure never loses a project.

### D4.1.8 — Store and editing-layer additions are backward-compatible: `loadProject`, `history.rebind`, `autosave.retarget`, `project.isEmpty` (builder, 2026-11-02)

The one tree stays the one project state (D3.1); `loadProject(next)`
replaces its contents, forgets the per-channel views and the clipboard,
rebuilds the field registry **in place** (same array), rebinds history
(stacks emptied, loaded values as baseline, a `clear` event) and re-arms
the single observer (D3.3.2) over the new fields. `autosave.retarget(key,
savedText)` cancels a pending save and starts clean under the new key. No
existing signature changed; the 3.3 tests pass unchanged except the
template field in the manifest asserts. The settings store is the same
shape as the project store's helpers: module-level `$state`, read-only
`settings`, `settingsOps` setters that skip same-value writes, an injected
adapter (`attachSettings` / `detachSettings`), never writing on attach.

### D4.1.9 — Home and Settings are built from the approved parts; the rooms' grey band is mirrored for the screen header and the status readout (builder, 2026-11-02)

No new control, no redesign: panels are the Mixer detail deck, selectors
the `ScribbleSelect` scribble window (pinned, unchanged), toggles and
momentary keys the panel-labelled `TactileSwitch`, print the engraved
label. The Home / Settings header and the Home status line reuse the rooms'
light band (`#a3a3a3 · #efefef · #454545` from `app.css`, pinned) — the
one hex exception in `src/screens`, guarded as such; everything else is
tokens. The status line is a readout band (warn tone = the warning red
border) because engraved print on the light band was illegible. Compact:
both screens stack without horizontal overflow at 768 px; Home's Tab order
is wordmark → room tabs → Settings → guide keys → room links → Start →
Open → transport. Deferred to approval items: forget / rename / delete an
entry, a save-status indicator, a confirm before leaving an unsaved
project (nothing is unsaved: the switch flushes first).

## Task 4.1 — approved

Owner, 2026-11-02: **"approved, commit"** (commit only — no tag, no push;
the owner pushes). Task 4.1 is closed as built and reported in
`task-reports/4.1-report.md`; D4.1.1–D4.1.9 stand, and the approval items
listed there (forget / rename / delete deferred; no save-status indicator
yet; start-empty → Arrange and reopen → Console as the offered rooms;
`RECENT_LIMIT` 12, `Untitled project N`, Full mix as the only default
output; no export-folder preference; the Home status readout band) stand
as chosen unless the owner names others later. The approval covers the
lifecycle (templates, index, statuses, reopen = template + saved values,
start empty, restore at start — D4.1.1 / D4.1.2 / D4.1.7), the Home and
Settings screens and routes (D4.1.3 / D4.1.9), the first-run guide
(D4.1.4), the motion preference (D4.1.5), the settings vocabulary (D4.1.6),
the backward-compatible store additions (D4.1.8), the 24 new node tests
(100 / 100) and the guard hand-overs (21 guards, 1 775 / 1 775). Committed
to local `main` on top of `04d628f` (Task 3.3); **not pushed** — remote
`main` stays at `04d628f` until the owner pushes. Phase 5 is not started.

## Task 5.1 — Real audio import and validation (2026-11-02; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 5's first step on the approved Task 4.1 state — real
file selection in the Arrange room's import workflow, the plan's format
rules (§11, L497–515) applied file by file, every accepted stem copied
into project-owned browser storage, fingerprinted and reduced to bounded
waveform peaks, then appended to the open project as a track; a per-file
report; persistence and reopening with the stored copies. **No analysis
engine, no benchmark, no Web Audio, no EQ / compression / reverb / delay,
no playback, no rendering, no invented analysis values or waveforms, no
room redesign, no new dependency.** The owner's four decisions
(`ask_user`, 2026-11-02) were taken before any code was written — D5.1.1
/ D5.1.2 / D5.1.3 / D5.1.5. Report: `task-reports/5.1-report.md`; the
model, the pipeline and the storage are described in `data-model.md`
§12. **Not committed, not tagged, not pushed** (owner's instruction); the
build stops here for review — Task 5.2 is not started.

### D5.1.1 — Import into any project, fixture included; one slim band at the top of Arrange, in both of its states (owner, 2026-11-02)

Over "empty projects only" and "a separate import screen", the owner chose
that stems can be imported into any open project — the fixture session
too — from **one slim band at the top of the Arrange room** that is there
in the empty state as well (above the empty-project notice) and above the
grid once there are tracks. Applied: `ArrangeImportBand.svelte` is the
first child of `.arrange-room`; the fixture's twenty tracks stay as they
are and an imported stem is appended as 21, 22, …; an empty project's
stems start at 01. Home's Start note and the first-run guide's Import
step say where import lives ("Import stems in Arrange."); the
empty-project notice says it per room (`HOW[room]`).

### D5.1.2 — Project-owned storage is the browser's IndexedDB: database `alloy`, stores `assets` + `peaks` (owner, 2026-11-02)

Over the File System Access API (Chromium-only, permission prompts) and
"keep only a handle to the original", the owner chose **IndexedDB**: the
copy survives moving or deleting the original, works in every browser the
shell runs in, and needs no dialog. One database `alloy`, version 1, two
object stores keyed by `assetId`; both records of a stem are written in
one transaction. IndexedDB is reached in `asset-store.ts` and handed over
by the shell only (`const idb = win.indexedDB; return idb ?
indexedDbAssetStore(idb) : null;`); the pipeline and the tests run against
the same `AssetStore` interface with `memoryAssetStore()`. Without
IndexedDB the key prints one line ("Import needs the browser's project
storage (IndexedDB), which is not available here — nothing was imported")
and nothing is added; a reopened project's imported tracks print MISSING.

### D5.1.3 — The plan's formats exactly: WAV, 48 kHz, 24-bit PCM or 32-bit float, mono or stereo — nothing wider, no conversion (owner, 2026-11-02)

Over "accept 16-bit and 44.1 kHz too" and "accept and convert", the owner
confirmed the plan's list as the contract. Applied in `import-rules.ts` as
constants (`ACCEPTED_SAMPLE_RATE 48000`, `ACCEPTED_FORMATS ["24-bit PCM",
"32-bit float"]`, `MAX_CHANNELS 2`); a 16-bit / 8-bit / 32-bit-integer /
64-bit-float / compressed WAV, any other rate, more than two channels, and
any non-WAV (MP3, FLAC, AIFF, Ogg, text — named when the bytes say so) are
**REFUSED** with the format that was found and the plan's advice
("re-export the stem as a 48 kHz WAV, 24-bit or 32-bit float"). Nothing is
resampled or re-quantised on the quiet. The format is judged before any
sample is read.

### D5.1.4 — Import is one structural change, not an undoable edit

`appendTracks(tracks, arrangement)` adds the accepted stems' tracks,
registers their 50 fields each and **rebinds the history** (as a project
switch does, D3.3.x): an import cannot be undone with Ctrl-Z, and the
history before it is gone. Reasoning: the Phase 3 history is a history of
field values over a fixed structure (D3.3.1); a structural undo would need
removing the copies from the store as well, which the plan does not ask
for in 5.1. Removing an imported track is deferred (approval item).

### D5.1.5 — 120 bpm 4/4 from bar 1; every stem at bar 1; bars = the longest stem rounded up (owner, 2026-11-02)

An empty project has no tempo. Over "ask for a tempo at import" and "a
seconds ruler", the owner chose a default of **120 bpm, 4/4** placed at
bar 1 by the first import (`DEFAULT_TEMPO`), every stem starting at bar 1
and `barCount = ceil(longest stem in bars)`; the fixture keeps its own
markers and 56 bars. The ruler's numerals follow the project's bar count
(`rulerLabels`); the header's sections come from the project (none for an
imported project). No tempo UI was added (not in 5.1).

### D5.1.6 — The validation vocabulary: four outcomes, four flags, four row stamps; mono / silent / short / mismatch are never fatal

Outcomes `added | unsupported | corrupt | failed` print as **ADDED /
REFUSED / UNREADABLE / FAILED** on the report's stamp; flags `mono |
silent | short | padded` print on the accepted line ("played on both
sides", "silent — kept, left out of analysis", "very short — processed as
one buffer", "shorter than the longest stem — padded to 0:12.0") and the
row stamps **MONO / SILENT / PADDED** carry them into the track list;
**MISSING** is the fourth row stamp (the stored copy is gone or is not the
file that was imported) and the only warning — the shell's red on the
stamp's rule, never red text, as the refused lines in the report. Silence
is a peak ≤ −80 dBFS (`SILENCE_PEAK_DBFS`), "very short" < 1 s
(`SHORT_SECONDS`); a stem shorter than the longest by more than one sample
is padded — at render only, nothing is written. A corrupt file's line
carries the reader's sentence alone (no "unreadable:" prefix — the stamp
says it); the mono flag no longer repeats the format's "mono".

### D5.1.7 — The report belongs to the project it was made in; refusals first; CLEAR only with a report

The band's report is cleared by a project switch (it describes a batch
against one project) and by its own CLEAR key, which is only there while a
report is up. A long batch's lines are capped at 7.5 rem and scroll inside
the band; so the lines that need the owner's hand come first (REFUSED /
UNREADABLE / FAILED in batch order), then the ADDED lines in batch order —
the `ImportResult.lines` API keeps the batch order. The status readout is
one line ("Importing 3 of 9 — pad.wav…" → "5 of 9 imported").

### D5.1.8 — A file that fails is never partly there; the batch keeps what passed; a switch mid-import adds nothing

Each file runs the whole pipeline (read → inspect → judge → peaks →
fingerprint → store → track) before the next; a failure at any step gives
the file its line and nothing else — no record, no track. Only after the
batch are the accepted stems appended, in one change. If the project is
switched while the files are being read, the copies already stored stay
in the store under the old project's id and the lines say "the project
changed during the import — stored, not added" (an orphaned copy is
possible in this case; removing it is deferred with the rest of asset
removal). The batch yields to the browser between files
(`yieldBetween`, a macrotask injected by the shell) so the readout updates.

### D5.1.9 — Peaks: Int8 min/max per 20 ms bucket, from the decoded samples, stored under the file's SHA-256

The waveform shown for an imported stem is computed from the file's
samples (24-bit / float reader, slices of 480 000 frames) as the signed
min / max of each 960-frame bucket, scaled to 1/127 — 2 bytes per bucket
per channel (a 5-minute stereo stem ≈ 60 kB, never the PCM). The peaks
record carries the asset's `sha256`; `hydrate()` treats a record whose
fingerprint is not the track's as missing, so a waveform never shows for a
copy that is not the imported file. Fixture clips keep their
`source: "fixture"` drawing and the SIMULATED print; a row with audio is
`data-simulated="false"`.

### D5.1.10 — Reopen = template + imported tracks + saved values, then hydration; the manifest's `tracks` block is optional

The manifest (`alloy.project-manifest/1`) gains `tracks` only when the
project has imported tracks — a fixture or empty manifest is unchanged
(byte-for-byte what 4.1 wrote), so every stored 4.1 project reopens as
before. The lifecycle rebuilds the template, appends the stored tracks
(`withImportedTracks`, each `audio` validated field by field; a duplicate
id / code or an invalid block makes the entry `damaged`), applies the
saved values, and `install()` ends with `void assets.hydrate()`, which
clears the status map and reads each track's peaks. Verified in the
browser against real imported files: after a reload the project is
restored, all five tracks are `ready`, their clips are `audio` and their
waveforms identical; a deleted record makes its track MISSING and the
project still opens.

### D5.1.11 — An imported track's identity: no role, no family, no source type; Supporting; neutral chain

An imported stem has nothing the fixture's authored identity had, so
`Track.role` became `RoleId | null` (`NO_ROLE` prints "—" / "Not assigned
yet" wherever a role prints), `familyId` and `sourceTypeId` are `null`,
tier is Supporting (the default), `org` is `neutral`, the chain is
`createChainState("")`, the output Master, the sends empty. The track's
name is the file's stem ("vocal lead"); the Arrange selects let the owner
assign source / family / role as for the fixture (not changed).

### D5.1.12 — Component hand-overs in 5.1 (backward compatible)

`ArrangeTrackRow` gains `audio` / `padded` / `audioStatus` (defaults
`null` / `false` / `null`: the fixture rows render as before);
`ArrangeTimelineHeader` gains `sections` (default `ARRANGE_SECTIONS`);
`ArrangeTimelineLane` prints `data-clip-source` and a seconds tooltip for
audio clips; `EmptyProjectNotice` prints a per-room "how" sentence instead
of the Phase-5 placeholder. `ActionKey` and `EngravedLabel` are reused
unchanged; no hardware component changed (pins hold). `role()` in
`arrange.ts` returns `NO_ROLE` for `null`.

### D5.1.13 — Home's template label says where a project began, never what it holds (owner, 5.1 review, 2026-11-02)

Review item 4: after stems are imported into a project started empty, Home
still printed the template label "Empty project" beside its name and in
the recent list — the project was no longer empty. The owner: keep the
template label only if it is explicitly identified as the starting
template, not the current project state. Applied in `TEMPLATE_LABELS`
(`templates.ts`, the one place Home reads it): `empty` → **"Started
empty"**, `session-fixture` → **"Started as the development session"**;
the card reads "Untitled project · STARTED EMPTY · 2 tracks · 0 Returns ·
0 buses" and the list "STARTED EMPTY · OPENED NOV 2, 2026, 8:47 PM" —
the label is the origin, the counts are the state. `HomeScreen.svelte` is
unchanged; `templates.test.mjs` asserts the new strings; the home-settings
guard checks the two phrases (104 checks) and is re-pinned to
`templates.ts`. Measured: `evidence/import/5.1/home-label-5.1.json`,
`home-label-after-import.png`, `home-card-after-import.png`.

## Task 5.1 — review decisions (owner, 2026-11-02)

The owner reviewed `task-reports/5.1-report.md` and decided the six
approval items: **1 approved** — refusals first in the report (D5.1.7);
**2 approved** — the status vocabulary ADDED / REFUSED / UNREADABLE /
FAILED and MONO / SILENT / PADDED / MISSING (D5.1.6); **3 approved** —
import not undoable, import history and the asset lifecycle (remove /
prune) out of scope for now (D5.1.4, D5.1.8); **4 — a small fix
requested and applied** (D5.1.13 above); **5 approved provisionally** —
the −80 dBFS silence threshold (`SILENCE_PEAK_DBFS`) and the 1-second
"very short" threshold (`SHORT_SECONDS`) stand as documented
(`data-model.md` §12.2) and their warnings stay non-blocking — accepted
stems with a flag, never a refusal; **6 approved** — the imported track's
defaults (D5.1.11). Task 5.1 itself awaits the owner's word on the whole
("approved" / "commit"); nothing is committed, tagged or pushed.

## Task 5.1 — approved

Owner, 2026-11-02: **"approved, commit and push"** (after the review
decisions above). Task 5.1 is closed as built and reported in
`task-reports/5.1-report.md`; D5.1.1–D5.1.13 stand. The approval covers
the Arrange import band and its report (D5.1.1, D5.1.6, D5.1.7), the plan's
format contract exactly (D5.1.3), the per-file validation with the batch
kept (D5.1.8), the IndexedDB copy with its SHA-256 and the bounded peaks
under it (D5.1.2, D5.1.9), the model / manifest / lifecycle additions and
reopen verified against real files (D5.1.10), the imported track's defaults
(D5.1.11), the component hand-overs (D5.1.12), Home's origin label
(D5.1.13), the 26 new node tests (126 / 126), the new guard and the
hand-overs (22 guards, 1 908 / 1 908), and the browser evidence under
`evidence/import/5.1/`. Committed to local `main` on top of `c4dec67`
(Task 4.1) and pushed with it to remote `main` (the owner's PAT, used
inline for the push and not stored). Task 5.2 is not started.

## Task 5.2 — Analysis engine (2026-11-02; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 5's second step on the approved Task 5.1 state — the
measurements the plan's §7 lists for the analysis engine (L295–335),
computed over the stems Task 5.1 stored and kept with them, available
after a reload; the benchmark-based hardware profile and the time-estimate
logic of plan §11 (L463–481). **No change to the 5.1 format policy, no
conversion or resampling, no processing or DSP beyond the plan's
measurements, no playback, no rendering, no room reading a result, no new
dependency.** The owner's three decisions (`ask_user`, 2026-11-02) were
taken before any code was written — D5.2.1 / D5.2.2 / D5.2.3. Report:
`task-reports/5.2-report.md`; the engine, the record, the storage, the
profile and the queue are described in `data-model.md` §13. **Not
committed, not tagged, not pushed** (owner's instruction); the build stops
here for review — Task 5.3 is not started. `architecture.md` and
`module-contract.md`, named by the task template, do not exist in the
repository (as in 5.1); `data-model.md` and this log carry the contract.

### D5.2.1 — Analysis runs automatically, in the background: after an import and as a catch-up when a project opens; one stem at a time, yielding (owner, 2026-11-02)

Over "an explicit Analyse action" and "analyse on first need", the owner
chose automatic background analysis. Applied: `assets.svelte.ts` hands the
new tracks' ids to `analysis.enqueue` after an import (`afterImport`);
`lifecycle.install()` ends `void assets.hydrate(); void analysis.hydrate();`
so a reopened project's stored results come back and what is missing or
stale is queued; the worker runs one stem at a time with slices sized by
the profile and a macrotask yield between them, so the page paints and
the import band stays live. A project switch aborts the run in flight and
drops its write (generation + signal). Nothing is shown yet — no room
reads a result; the debug handle exposes `analysis` and `hardware`.

### D5.2.2 — The benchmark is lazy and cached in `localStorage` under `alloy.benchmark` for 30 days; a new engine version (or another core count) measures again (owner, 2026-11-02)

Over "benchmark at first boot" and "every session", the owner chose a lazy
benchmark cached locally. Applied: `hardware.ensure()` runs the workload
the first time a stem is actually analysed in a session — after the copy
is known to exist (a missing stem never costs a measurement; found by the
browser evidence and fixed) — and caches `alloy.benchmark/1`
(`BENCHMARK_MAX_AGE_MS` 30 days). `parseBenchmark` rejects a record from
another engine version, another core count, older than 30 days or more
than a minute in the future. The Settings choice overrides the measurement
without discarding it; `hardware.invalidate()` is the debug handle's
"measure again".

### D5.2.3 — The Settings note and the Automatic intent are corrected; "computer", not "device" (owner, 2026-11-02; wording: guard)

The owner allowed the one UI text correction: the Hardware profile panel
no longer says "Stored, not yet operational". Applied: the panel note reads
"Used by the analysis engine: Automatic follows the benchmark measured on
this computer before its first analysis; choosing a profile overrides that
measurement." and the Automatic intent "The profile the hardware benchmark
selects, measured on this computer before its first analysis." No layout
or control changed; the home-settings guard's pins for `SettingsScreen.svelte`
and `settings.svelte.ts` were refreshed and its note / intent regexes
updated. "Computer" rather than "device" because the guard's "Settings
carries the plan's items only" check forbids the word *device* in the
Settings screen (it guards against a device-picker creeping in) — the
sentence means the same.

### D5.2.4 — One streaming pass over a 100 ms grid; the slicing never changes a figure; a profile is a slice length

Every measurement is accumulated by an `Analyser` fed in pushes of any
length and finished once; every filter, window and block carries its state
across pushes. The common grid is `CELL_SECONDS 0.1` (4 800 frames), fine
enough for the plan's time-based measurements (§7) and coarse enough that a
12 s stem's record is ≈ 2.5 kB of scalars plus its series. Held by test:
one pass, 100 ms slices and 0.7 s slices give byte-identical results for a
busy stereo stem and a mono one; the browser evidence re-measures the kick
under Lite (2 s slices) against its Standard record and compares the whole
result. Consequence: the hardware profile (plan §11) can choose
`sliceSeconds` 2 / 5 / 10 (`DEFAULT_SLICE_SECONDS 5`) and no figure
depends on the machine. The stored copy is read by frame range through a
`ByteSource` (the Blob's `.slice`; header from the first 64 kB with
`inspectWav(head, size)`, which gained the `totalBytes` argument), so a
stem is never whole in memory.

### D5.2.5 — Profile thresholds and the estimate are provisional, measured-not-promised: < 25× → Lite; ≥ 100× with ≥ 4 cores and ≥ 4 GB (where reported) → Performance; otherwise Standard; unmeasured = Standard; estimate = work / throughput × 1.25, null without a measurement

Throughput is seconds of audio analysed per wall-clock second over the
real engine. The thresholds live in one place (`PROFILE_THRESHOLDS`) to be
tuned when real devices are measured; the cores / memory rule keeps a fast
single-core machine on Standard; `navigator.hardwareConcurrency` /
`deviceMemory` are read in the shell only and null where a browser does
not report them (then the rule does not bind). Before any benchmark the
engine behaves as Standard — the middle intent, never a guess upward. The
estimate rounds up to whole seconds with a 25 % margin (machines are
busier than at the benchmark) and is **null** without a measurement: no
number nobody measured (plan §11); the shell test holds "no measurement,
no estimate". No number of this kind is printed in Settings (the 4.1 rule
stands).

### D5.2.6 — Loudness per ITU-R BS.1770-4 / EBU Tech 3342; true peak by 4× oversampling that never reads below the sample peak; null / −∞ / NaN conventions

K-weighting is the published pair of biquads at 48 kHz (+0.69 dB at
1 kHz — the reason for the −0.691 offset); momentary 400 ms (4 cells),
short-term 3 s (30 cells), integrated with the −70 LUFS absolute and
−10 LU relative gates, loudness range from the short-term blocks with the
−20 LU relative gate and the 10th–95th percentile spread. Calibration held
by test (−3.01 LUFS for a 0 dBFS 997 Hz sine in one channel; −20.0 LUFS
for −20 dBFS in both). A mono stem counts on both sides (it plays
duplicated, D5.1.3): +3 dB over the same signal in one channel of a
stereo file. True peak: 4× oversampling with a Blackman-windowed sinc in
four phases of 12 taps; the phases sit between samples, so the detector
also takes the sample itself — the first browser run showed the Task 5.1
click (a lone full-scale sample) at −0.24 dBTP, below its 0.00 dBFS sample
peak, which is physically impossible; fixed, with a regression (`a lone
full-scale sample`). Conventions: scalars `number | null` with null = not
measurable (no complete window, no energy, nothing on one side); series
`Float32Array` with −∞ for no energy and NaN for undefined — never a
substituted 0 or −100.

### D5.2.7 — Energy by band is measured on the mid signal with six fixed bands and a three-way balance

4 096-point Hann frames, hop 2 400 (two per cell), two real frames per
complex FFT, Parseval normalisation so a band reads the RMS of what is in
it. Six bands (Sub 20–60, Low 60–250, Low-mid 250–500, Mid 500–2 000,
High-mid 2 000–6 000, High 6 000–20 000 Hz) and the three-way balance
(low = Sub + Low, mid = Low-mid + Mid, high = High-mid + High) as energy
fractions — the plan's "low, mid, high" (§7) with enough resolution for
Phase 6's rules; the centroid per cell and overall. The whole-stem band
means (and the balance from them) average the cells whose frames carry
energy, judged on the frames themselves rather than on the level series —
the browser run showed the Task 5.1 click (one full-scale sample at 0.1 s)
with every band mean null because its frame is centred in the cell before
the sample's, which is silent by level; fixed, with a regression. The spectrum is the
mid signal's ((L+R)/2; a mono stem's own channel): one FFT per frame pair,
and what a listener hears in mono — anti-phase content therefore has none,
which the stereo measurements (mono loss, correlation) say explicitly. The
Hann main lobe's ±23 Hz leakage of a 40 Hz tone into Low (≈ −56 dB) is
measured, documented, not hidden.

### D5.2.8 — Transient detection: 10 ms blocks, log-energy flux, onset at ≥ 6 dB rise above −60 dBFS with 50 ms spacing — provisional, for Phase 6 to tune

The plan asks for transient activity and short-time energy changes (§7),
not a beat tracker. The measure is the positive change of block energy in
dB on the mid signal; per cell the largest flux and the cell's crest are
kept, onsets as times. A steady tone starting at t = 0 has one onset (its
start) and a flat flux; a dB-linear fade-in has none; clicks every 0.5 s
are found at their times; bursts closer than 50 ms merge; a jump below
−60 dBFS is not an onset. Held by test with pushes of any length giving
the same blocks (partial blocks carry across pushes; the last partial
block is closed at finish). Measured on the Task 5.1 pad — a slow swell
of detuned layers — the rule counts the beating's energy jumps as 60
onsets at 5 / s: a true short-time energy change, not a hit; the report's
approval item A1 raises it, and Phase 6 has the flux and crest series
beside the count.

### D5.2.9 — Integrity rules: same-sign clipping runs of ≥ 3 samples at ≥ 0.9999; DC offset with a −144 dBFS floor; silence keeps the 5.1 rule and is measured but not a target; near-silence at −60 dBFS; mono has no stereo image

Clipping is a flattened waveform, not a loud peak: three or more
consecutive samples at or beyond `CLIP_LEVEL` *of the same sign* (a
full-scale square wave's edges cross zero between runs; a sine that
touches 0 dBFS is not clipped; a float stem over 1.0 is). `fullScaleSamples`
is counted separately. DC offset is the channel mean; below the 24-bit
noise floor (`DC_FLOOR_DBFS −144`) it is reported as none rather than as
−200-odd dBFS. Non-finite float samples are treated as zero and counted
(5.1 refuses such files; a count here is a copy that changed). Silence
keeps Task 5.1's `SILENCE_PEAK_DBFS −80` (D5.1.4, provisional per the 5.1
review): a silent stem is still measured so a record exists, says
`silent: true` and `analysisTarget: false`; per-cell silence gives the
leading / trailing silence and the active seconds; `nearSilent` (peak at
or under −60 dBFS) is a flag on a stem that is still a target. A mono stem
reports `stereo.applicable: false` with every figure null — never a
fictitious correlation of 1.

### D5.2.10 — The pass runs on the main thread, in slices with macrotask yields; no Worker in this task

Rationale: the build is a single file (`vite-plugin-singlefile`) with no
dependency budget for a worker bundle; the slices are bounded (2–10 s of
audio, ≈ 20–100 ms of work at the measured 35–60× throughput of a 2-core
headless machine) and the yield between them is a `setTimeout(0)`
macrotask in the shell, so the page paints and the import band stays
responsive; the engine is pure (no browser API in `src/lib/analysis/`, the
guard holds it), so moving the same code into a Worker later is a wiring
change, not a rewrite. Listed as an open item.

### D5.2.11 — Results live in IndexedDB `alloy` (version 2, store `analysis`) under the asset, valid by SHA-256 and engine version; the manifest is unchanged

One record per asset (`AnalysisRecord { assetId, projectId, sha256,
engineVersion, analysedAt, elapsedMs, result }`), written by
`putAnalysis` after the pass, read by `getAnalysis` on hydrate, deleted by
`remove` with the copy. Validity is the track's SHA-256 *and* this engine
version *and* the schema — a swapped copy or an older engine is measured
again, never shown stale. The project manifest in `localStorage` carries
no figure (the typed-array series belong in IndexedDB, where the
structured clone keeps them as `Float32Array`); evidence: the saved
project text mentions none. A refused write keeps the result for the
session with `stored: false` and the reason, so a storage hiccup never
costs a measurement.

### D5.2.12 — The benchmark workload is the real engine over 4 s of deterministic 24-bit PCM stereo (tones, hiss, clicks), decode included

A representative stem rather than a synthetic loop: the same bytes on
every machine (seeded noise), encoded with Task 5.1's `encodeWav` so the
decode path the queue uses is measured too; four seconds keeps the first
analysis's wait short (≈ 0.1 s here, ≈ 1 s on a machine four times
slower) while being long enough to amortise warm-up. The record keeps
`workloadSeconds` and `elapsedMs` beside the throughput so a later change
of workload is visible in old caches.

### D5.2.13 — Injected clocks, raw state, and the guard amendments

`AnalysisDeps.clock` and `HardwareDeps.clock / nowMs` are required
injections (the shell passes `performance.now` / `Date.now`): no project
module reads the browser's clocks, which the editing guard's `browserTouch`
check holds over all of `src/lib/project`. The benchmark record and the
analysis entries are `$state.raw` (immutable records, no deep proxy). Guard
amendments, all documented in the report: `check-audio-import-structure.mjs`
(shell asset-store dependencies, the Phase-5 negative regex now admits the
engine, a LUFS-location check, `package.json` regex; re-pinned `wav.ts`,
`asset-store.ts`, `assets.svelte.ts`), `check-home-settings-structure.mjs`
(note / intent regexes, `hardware.svelte.ts` admitted, `install()` regex
with `analysis.hydrate()`; re-pinned `shell.ts`, `lifecycle.ts`,
`settings.svelte.ts`, `SettingsScreen.svelte`), `check-editing-structure.mjs`
(debug handle with `analysis, hardware`, the uninstall order, the test
list; re-pinned `shell.ts`), and the new `check-analysis-structure.mjs`
(97 checks: engine purity, the record, the stores, the queue, the profile,
the benchmark, the docs, 14 pins).

## Task 5.2 — approved

Owner, 2026-11-03: **"approved, commit and push"**. Task 5.2 is closed as
built and reported in `task-reports/5.2-report.md`; D5.2.1–D5.2.13 stand,
and the report's approval items A1–A6 (the provisional thresholds, the
mid-signal spectrum and its bands, silent stems measured but flagged, the
main-thread pass, the `alloy.analysis/1` record as the stored contract,
the benchmark's cache rule) are approved as built. The approval covers the
engine and its five measurement categories over a 100 ms grid (D5.2.4,
D5.2.6–D5.2.9), the storage of results in IndexedDB `alloy` version 2
under the asset with SHA-256 and engine-version validity (D5.2.11), the
automatic background queue with hydration on reopen (D5.2.1), the lazy
benchmark cached under `alloy.benchmark` with the profile and the
measured-only estimate (D5.2.2, D5.2.5, D5.2.12), the Settings text
correction (D5.2.3), the injected clocks and the guard amendments
(D5.2.13), the 33 new node tests (159 / 159), the new guard and the
hand-overs (23 guards, 2 006 / 2 006), and the browser evidence under
`evidence/analysis/5.2/`. Committed to local `main` on top of `ff31f9a`
(Task 5.1) and pushed to remote `main` (the owner's PAT, used inline for
the push and not stored). Task 5.3 is not started.

---

## Task 7.1 — Channel chain, summing, routing and bus processing — closeout (2026-11-03; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 7's first step — fix the approved 6.1–6.3 modules into one signal
flow (plan §7, `PROCESSING_CHAIN_STEPS`, §8) without changing any of them. Five
readiness-gate questions the documents do not answer were put to the owner before any
code (`ask_user`, 2026-11-03) and answered "as proposed": D7.1.4–D7.1.6. Built in
`src/lib/engine/` (`pan.ts`, `constants.ts`, `audibility.ts`, `chains.ts`,
`mix-engine.ts`) with two new suites, a new structural guard and `data-model.md` §17;
report `task-reports/7.1-report.md`. The owner's closeout (Task 6.4, 2026-11-03)
resolved the three items that report raised in §8 — D7.1.1 / D7.1.2 / D7.1.3 — and
re-ran the whole gate on the final tree. **Not committed, not tagged, not pushed**
(the owner handles Git checkpoints); Task 7.2 is not started. `architecture.md` and
`module-contract.md` still do not exist; `data-model.md` and this log carry the
contract.

### D7.1.1 — The delay's in-place defect is fixed inside the reviewed 6.3 module (owner, 2026-11-03)

**Context.** `buffers.ts` allows a module's output to be the same arrays as its input,
and the Return chain relies on it. `Delay.process()` read `input[c][i]` *after*
writing `output[c][i]`, so in place the line fed itself its own output and produced
silence — a genuine defect in a reviewed Task 6.3 file, found only because 7.1 was the
first caller to pass one buffer.

**Decision.** Keep the one-line fix: capture `const source = input[c][i];` before the
output write, and write `buffer[at] = source + gain * filtered;`. Approved on three
grounds — it fixes a real in-place defect, it leaves the out-of-place behaviour
identical (all 12 original delay tests pass unchanged), and it is covered by a
regression test that compares the two paths sample for sample
(`tests/dsp-delay.test.mjs`, "in place: output may be the input arrays").

**Consequences.** The engine needs no scratch buffer for a Return, and no later caller
inherits the trap. `delay.ts` is re-pinned in `check-return-dsp`, whose "the delay
damps inside the loop only" check now also pins the source-before-write order. Any
future edit to that loop must keep the read before the write.

### D7.1.2 — BALANCE is unity-at-centre and attenuation-only; it is deliberately not the pan law (owner, 2026-11-03)

**Context.** The readiness gate approved a constant-power pan law for PAN and used the
same law for a bus BALANCE. Applied literally, a bus at its **default** centre position
drops 3.01 dB — a gain the model does not hold, and a direct disagreement with the same
material routed straight to Master (0.707 vs 0.5). The 7.1 report implemented BALANCE as
a console balance instead (unity on both sides at centre, linear attenuation of the
opposite side, never a boost) and asked for confirmation.

**Decision.** Keep it. BALANCE is not strict identity with PAN. The owner considered
and declined "identical to the pan law", because a control at its default must be
neutral.

**Consequences.** Two different laws sit next to each other in `pan.ts`
(`panGains` / `balanceGains`) with the divergence documented in the source and in
`data-model.md` §17.3. `PAN_CENTRE_DB` (−3.01) is the PAN centre only; a centred bus
measures unity. A later reader must not "simplify" the two into one function.

### D7.1.3 — A Return's output is the Master; the B1 header is corrected, and routing is untouched (owner, 2026-11-03)

**Context.** `src/lib/bus-chain.ts`'s header claimed B1 is "the bus every track and
Return sums into", while `routing.ts` rule 4 and `session.ts` route a Return's output
straight to Master. 7.1 followed the rule, left the comment alone and flagged it.

**Decision.** Correct the header to say what the rule says — every **track** sums into
B1 and B1 feeds Master; a Return does not pass through B1 and outputs to Master itself —
and change nothing about routing. The correction is a comment only, with no change to
`bus-chain.ts`'s code, so the audio and the bus's code are untouched; only the two guards that hash the
file needed re-pinning.

**Consequences.** `bus-chain.ts` is re-pinned in `check-mixer-chain-types` (110/110) and
`check-project` (122/122). One stale sentence remains in
`src/components/channel-strip/bus-return-fixtures.ts` ("the mix bus every track and
Return sums into"), which repeats the old claim in a UI fixture; it is recorded in this
closeout as outstanding because the owner's scope limited the correction to
`bus-chain.ts`.

### D7.1.4 — The Master is not a project entity: it is the unity sum through the always-on safety limiter, with no fader (owner, 2026-11-03)

**Context.** Plan §7 has a Master output stage; the model (`model.ts`) has no Master
object, so nothing said what the Master *is* or where the 6.2 limiter lives.

**Decision.** The Master is the sum of everything that reaches it, through the reviewed
`SafetyLimiter` **always in circuit** — −1 dBFS ceiling, 50 ms release, 5 ms lookahead,
no make-up gain, no fader, no loudness maximisation (plan §8's "transparent peak
protection only").

**Consequences.** The engine reports the limiter's lookahead as `latencyFrames` (240
frames at 48 kHz) — the only latency in the chain — so 7.4 can compensate instead of
discovering it. The ceiling is true by construction, and the engine's node set gains no
Master control.

### D7.1.5 — Solo is in place along the routing path, mute wins, and a skipped path freezes (owner, 2026-11-03)

**Context.** The model carries `solo` and `mute` on tracks, buses and Returns; no
approved document defined their audio meaning, and the fixture session ships with a
soloed track and two muted ones, so the first block was silent until this existed.

**Decision.** Mute wins over solo. Solo is **in place**: with anything soloed, a path
passes only if it lies on the routing path of a soloed object — a soloed track keeps its
own bus, a soloed bus keeps its children, a soloed Return hears its feeders' sends and
no dry signal. A path that does not pass is **skipped and frozen**, never reset — the
6.1–6.3 bypass rule extended to routing.

**Consequences.** Unmuting resumes instead of jumping, which `tests/engine-routing`
proves against a fresh engine rather than asserting. Because audibility is read when the
engine is built, a controller that changes mute or solo must call
`refreshAudibility()`; that is the only way routing changes without rebuilding a chain,
and the UI task must use it.

### D7.1.6 — PAN keeps the constant-power law; the dynamic-EQ gate and the cleanup expander stay PROVISIONAL (owner, 2026-11-03)

**Context.** No pan law, no dynamic-EQ detector timing and no expander values existed in
the approved documents; `cleanup` was a boolean with nothing behind it.

**Decision.** PAN is constant power (`θ = (pan+100)/200 · π/2`, `L = cos θ`, `R = sin θ`;
−3.01 dB per side at centre, unity at the extremes, `L² + R² = 1`). The dynamic-EQ gate
is −24 dBFS / 5 ms attack / 120 ms release; the cleanup expander is −45 dBFS / 2:1 /
20 dB range / 5 / 120 ms. Both numeric sets are marked **PROVISIONAL** in
`engine/constants.ts` and in `data-model.md` §17 — calibration, not contract.

**Consequences.** The two gates can be retuned without touching the chain, and the guard
holds the marker in place so no one mistakes them for approved constants. Trim is audio
gain (plan step 01), so it feeds every detector; dynamic bands are built at static gain
0 dB because the band's static gain already happened at step 03.

### D7.1.7 — The engine layer is the only door into the DSP, and the 6.x guards now say so (owner, 2026-11-03)

**Context.** The 6.1–6.3 guards asserted the opposite of what 7.1 does: "nothing outside
`src/lib/dsp/` imports the DSP yet: no channel chain, no room, no store, no UI (Task
7.1's work)". Four of them failed the moment the engine imported a module.

**Decision.** Flip those assertions to the new truth rather than delete them: only
`src/lib/engine/` may import the DSP — no store, no route, no component — and the engine
layer is verified to be the one bridge. Amend `check-editing`'s pinned `npm test` string
for the two new suites, and add `check-engine-structure.mjs` (`npm run check:engine`,
63/63) for the chain order, the pan and balance laws, mute/solo, the graph gate, the
allocation-free block loop, the lifecycle API, the provisional markers and the docs.

**Consequences.** The "nothing is wired yet" invariant now points at the right boundary:
UI and store wiring remain forbidden, and the DSP stays reachable through exactly one
layer. The guard list grows to 27 scripts.

---

## Task 7.2 — Sidechain routing and external key inputs (2026-11-03; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 7's second step — a detector-signal path so one track can drive another
channel's compressor or dynamic EQ (plan §8; `data-model.md` §18). The task's premise was
that both processors already accept a key: true for the Dynamic EQ (6.1), **false for the
Compressor** (6.2 had no key parameter at all), and the model had no sidechain field
(§7 called it "a planned third edge kind … not modelled"). Both gaps were reported
before any code was written and the owner answered five questions on 2026-11-03 —
D7.2.1–D7.2.5. Report: `task-reports/7.2-report.md`. **Not committed, not tagged, not
pushed**; Task 7.3 is not started.

### D7.2.1 — The Compressor gains an optional `key` parameter, on the Dynamic EQ's contract (owner, 2026-11-03)

**Context.** `Compressor.process(input, output, count?)` detected from `input`
unconditionally; `grep` for "key" in `compressor.ts` returned nothing. 7.2 cannot key a
compressor that has no way to receive a key, and the alternatives were worse: duplicating
the approved detector in the engine, or shipping half the task.

**Decision.** Add `key?: readonly Float32Array[]` as a fourth parameter and set
`detectorInput = key ?? input`, exactly as the approved Dynamic EQ already does
(`requireKeyBuffers` validates the shape). Nothing else changes.

**Consequences.** With no key, the output is bit-identical to 6.2 and all 12 compressor
tests pass unchanged. This is an edit to a reviewed 6.2 file, like the approved 7.1 delay
fix, and `compressor.ts` is re-pinned in `check:dynamics`. A later reader must not add
key-dependent behaviour beyond *where the detector listens*: no key filtering, weighting
or lookahead.

### D7.2.2 — A project-level edge list, `Project.sidechains`, with a per-edge processor (owner, 2026-11-03)

**Context.** The model had nowhere to express a key. `data-model.md` §7 described
sidechains as "a planned third edge kind, validated by the same walk"; §326 listed them as
Phase 7 work.

**Decision.** `Project.sidechains?: readonly SidechainEdge[]`, where an edge is
`{ source: TrackId, destination: ChannelId, processor: "compressor" | "dynamic-eq" }`.
The field is **optional**, so every stored project loads unchanged and an absent field
means "no sidechain". One list, one validator, one source feeding many destinations, and
each processor keyed independently.

**Consequences.** The audible graph and its `routingEdges` are untouched — sidechains are
validated by their own walk (`validateSidechains`), as the task requires. Store, UI,
persistence and clipboard support for the new field are **not** wired: that is a separate
change, recorded in the 7.2 report as the outstanding contract.

### D7.2.3 — The key is tapped pre-fader and post-trim (owner, 2026-11-03)

**Context.** The tap point decides what a key *is*, and nothing in the documents said.
It also decides whether the engine can guarantee synchronisation at all: any tap after a
chain makes the key depend on the order in which channels happen to be processed.

**Decision.** The key is the source track's input block × its TRIM — pre-fader, pre-pan,
pre-sends, before the source's own EQ and dynamics.

**Consequences.** Moving the source's fader never changes a detector; the key is computed
from the same block's raw audio before any chain runs, so it is sample-aligned, never
stale, adds no latency and cannot create a feedback path. Two tracks may key each other
safely, and no cycle rule is needed beyond rejecting a self-key. The consequence to
accept: a key does not follow the source's own processing or fader position.

### D7.2.4 — Keys follow Task 7.1 audibility; unusable edges fall back to self-detection (owner, 2026-11-03)

**Context.** Mute and solo had defined audio semantics only from 7.1, and a broken
reference could either be fatal (throw) or silent (a connection that pretends to exist).

**Decision.** A muted or solo-excluded source delivers silence — no signal in, no
reduction out. An edge that cannot be honoured (unknown source or destination, a Return
destination, a self-key, a duplicate) is **dropped and reported** with a named reason, and
that processor detects from its own input again.

**Consequences.** `validateSidechains` never throws, unlike `validateGraph`: a broken
detector edge must not stop a project from playing. The engine exposes
`sidechainVerdict.problems` so a controller can surface it. Keys are silence, not bypass —
the detector is still running, it simply has nothing to hear.

### D7.2.5 — Sources are tracks; destinations are tracks and buses (owner, 2026-11-03)

**Context.** The model has compressors on buses and an effect-only chain on Returns;
the task's wording ("a channel can use another channel's audio") left the scope open.

**Decision.** A track may key a track's compressor or dynamic EQ, or a bus's compressor.
A Return is rejected as a destination (`unsupported-destination`) and is never a source.

**Consequences.** A bus is processed after every track, so a bus key needs no ordering
care. Return destinations and non-track sources stay unmodelled — if 7.3 or a later task
wants them, they need their own decision rather than a silent widening of this one.

---

## Task 7.3 — Masking resolution (2026-11-03; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 7's third step — priority-based frequency/time masking detection and
resolution, including wet reverb/delay tails (plan §8, §8a). Built in
`src/lib/engine/masking.ts` with two additive engine integrations (track taps and an
engine-owned Dynamic EQ overlay), 15 tests, a structural guard, `data-model.md` §19
and `task-reports/7.3-report.md`. **Nothing committed, tagged or pushed.** Task 7.4
was not started. `architecture.md` and `module-contract.md` still do not exist.

### D7.3.1 — Provisional, configurable masking defaults; no universal threshold (builder, 2026-11-03)

**Context.** The plan requires meaningful frequency-and-time conflict detection,
persistent versus intermittent resolution, cumulative-cut safety and wet-tail
analysis, but fixes no numeric masking threshold and defers genre rulebook tuning.

**Decision.** Use the Task 5.2 100 ms spectral grid and six bands. A conflict requires
simultaneous salient band energy from both sources, not mere spectral overlap:
`energyFloorDb -60`, `minBandShare 0.05`, `maskingWindowDb 12`. Persistence is
`persistentRatio 0.6` of the longer active run with at least 3 cells; intermittent
requires at least 2 cells. Resolution defaults: `targetSeparationDb 3`,
`maxCutPerConflictDb 3`, `minCutDb 0.25`, `cumulativeCutLimitDb 6`, `maxSendCutDb 6`,
`escalationThresholdDb 1.5`, `maxCompThresholdShiftDb 6`. All live in
`DEFAULT_MASKING_DETECTION` / `DEFAULT_MASKING_RESOLUTION` and are configurable.

**Consequences.** The numbers are conservative starting points, not genre rules or
scientific universals. The cumulative 6 dB EQ limit is deterministic and testable;
repeated small cuts cannot exceed it when the ledger is carried across reruns.

### D7.3.2 — Wet tails are attributed to existing post-fader sends, not to a new Return track (builder, 2026-11-03)

**Context.** A Return Bus sums its sends before the effect, so the shared wet output
cannot identify which track produced a masking tail. The plan requires wet tails in
masking analysis but forbids a new routing model.

**Decision.** Measure each active send in isolation through the same approved
`ReturnChain` settings (linear superposition), attribute it to the sending track as
`trackId>returnId`, and inherit that track's Priority. Analyse `tailSeconds` of silence
after the input. A persistent wet/dry conflict reduces the lower-priority Auto send;
an intermittent wet conflict scales the send move by measured duty cycle because the
Return has no dynamics to key.

**Consequences.** No Return sidechain destination, Return compressor/Dynamic EQ, or
ordinary-track treatment of a Return is introduced. The existing post-fader send and
per-send Auto/Manual rules are preserved.

### D7.3.3 — Engine-owned Dynamic EQ overlay preserves configured depths and Auto/Manual (builder, 2026-11-03)

**Context.** `EqBandState.dynamicDepthDb` is a plain configured value with no
Auto/Manual mode. Overwriting it would silently change existing behavior; adding a
new owned model field would touch UI/persistence outside this engine task.

**Decision.** Masking may add an engine-owned `MaskingDynamicBand` overlay only on a
band whose `dynamicDepthDb` is `null`. A configured depth is never replaced. Static EQ
gain/frequency/Q, sends and compressor parameters are written only when Auto. Manual
values are never overwritten. Existing sidechain assignments and Task 7.2 validation /
fallback are preserved.

**Consequences.** The overlay is passed to `MixEngine` through
`maskingDynamicBands`; it is not persisted or shown in the UI by this task. Compressor
escalation occurs only after EQ re-measurement shows meaningful remaining conflict.

---

## Task 7.4 — Bounded-chunk rendering, state continuity and recovery (2026-11-04; uncommitted, awaiting review — the owner handles Git)

Direction: Phase 7's fourth step — plan §11 bounded chunk processing and §15's
single-pass versus chunked comparison. Built in `src/lib/engine/render.ts` over the
existing `MixEngine`, with a recovery-only clearing of scratch/key buffers in
`MixEngine.reset()`, 16 tests, a structural guard, `data-model.md` §20 and
`task-reports/7.4-report.md`. No DSP algorithm, masking methodology, project schema,
UI, transport, export dialog or dependency was changed. **Nothing committed, tagged
or pushed.** No later task was started.

### D7.4.1 — Bounded orchestration block: 4096 frames default, 65536 cap (builder, 2026-11-04)

**Context.** The plan fixes bounded chunk processing but leaves the exact chunk
duration to implementation and validation. The engine already defaults to 4096
frames and allocates its block buffers from `maxFramesPerBlock`.

**Decision.** `DEFAULT_RENDER_CHUNK_FRAMES = 4096` (about 85 ms at 48 kHz), with a
configurable whole-frame `chunkFrames` from 1 to `MAX_RENDER_CHUNK_FRAMES = 65536`
(about 1.37 s at 48 kHz). The cap is a provisional orchestration safety bound, not a
DSP control. Source, raw output and aligned output buffers are sized from the chunk,
never from total project duration.

**Consequences.** A longer project increases the number of chunks and sink writes,
not the size of the audio buffers. The allocation test proves identical Float32
audio allocation for short and long renders at the same chunk size.

### D7.4.2 — Streaming source/sink and safe restart, not persisted DSP checkpoints (builder, 2026-11-04)

**Context.** There is no production render/export path yet. Long projects must not
require whole stems or a whole output mix in RAM, and interrupted renders must
recover safely. Serializing every DSP state would widen the DSP/project contracts.

**Decision.** `renderProject` consumes seekable `RenderSource` objects and writes to
a `RenderSink` with `write`, `finish` and `abort`. A WAV adapter reuses Task 5.2's
slice decoder and Task 5.1's import rules. Each attempt owns a fresh engine and
scratch buffers; failure/cancellation resets and closes them and aborts the sink.
Retry is a clean restart from frame 0. No mid-render checkpoint is persisted.

**Consequences.** The plan's "resume or safely restart" requirement is met by safe
restart. Durable atomic files, export selection and user-facing recovery remain later
transport/export work. A sink must copy/persist a chunk before its async `write`
resolves because the renderer reuses the arrays.

### D7.4.3 — Render Return tails through the full graph, then compensate limiter latency (builder, 2026-11-04)

**Context.** `MixEngine.tailSeconds` reports the conservative Return tail, while
`MixEngine.flush` drains the master limiter's lookahead. Dropping the limiter delay
without appending its flushed residual would cut real audio; flushing only the
limiter would not advance Return networks.

**Decision.** Process `N + ceil(tailSeconds × rate)` frames, where `N` is the longest
input and the frames after `N` are silence through the full engine. Then drop the
first `latencyFrames` raw output frames and append exactly `latencyFrames` flushed
frames. The delivered length is `N + tailFrames`, aligned with the input.

**Consequences.** Reverb/delay tails and detector releases cross chunk boundaries and
continue after the last input. The limiter's residual audio is preserved. The
continuous-reference tests compare the same timeline sample-for-sample.

### D7.4.4 — Reset clears scratch and sidechain key buffers (builder, 2026-11-04)

**Context.** Task 7.1's `reset()` cleared processors and summing accumulators, and the
next block overwrote key buffers before use. Recovery nevertheless should not leave
an attempt's samples resident in reusable engine buffers.

**Decision.** Extend `MixEngine.reset()` to zero the scratch pair and every allocated
compressor/Dynamic EQ key buffer, in addition to the existing processor and
accumulator reset. No signal-path or per-block behavior changes.

**Consequences.** A reset or failed-attempt cleanup leaves no stale key/scratch audio.
The engine and sidechain structural pins are updated for this recovery-only edit.

## Task 8.1 — Shared transport and playback integration (2026-11-04; uncommitted, awaiting review — the owner handles Git)

**Scope.** Plan §6 / §14 Task 8.1 only: one shared transport across Console, Arrange and
Mixer; raw synchronized stem playback; lightweight live preview through the existing
`MixEngine`; full rendered-mix playback through Task 7.4 `renderProject`. No export,
rulebook loading, DSP/masking change, project-schema change, native work or dependency
change. **Nothing committed, tagged or pushed.**

### D8.1.1 — One app-level transport facade; PLAY toggles play/pause in the live room (builder, 2026-11-04)

**Context.** Task 0.6 rendered the mini transport once outside the room switch; Task 2.3
made the Console deck a fixture with an exclusive PLAY/STOP latch and no source selector
(D2.3.2). Task 8.1 requires play/pause/stop/seek and room-independent state.

**Decision.** A single `PlaybackController` is attached to one reactive facade
(`src/lib/playback/store.svelte.ts`). The mini transport and the live Console deck call
that facade; rooms own no playback state. PLAY toggles play/pause, STOP returns to frame
0, PREVIOUS/NEXT locate to start/end. The listening source remains status text; no
selector is added. MIX starts the rendered-mix path. The playground deck remains
simulated. This is the smallest live behaviour change to the approved keys.

**Reversible.** Yes: the facade/controller boundary and the deck's `live` prop.

### D8.1.2 — Bounded scheduled Web Audio output, not whole-project buffers (builder, 2026-11-04)

**Decision.** Producers read/process bounded blocks (RAW/PREVIEW 2048 frames, render
4096) and hand stereo chunks to a Web Audio backend that schedules them on the audio
clock. The backend applies ~1 s queue backpressure and a generation stop/disconnect on
pause/seek/stop. Memory is block- and queue-sized, never duration-sized.

**Reversible.** Yes: the `PlaybackOutput` contract can be replaced by AudioWorklet or a
native backend without changing the transport state machine.

### D8.1.3 — DSP state is continuous per attempt; pause/seek/stop/restart reinitialize (builder, 2026-11-04)

**Decision.** One preview `MixEngine` runs for an unbroken attempt, with
`refreshAudibility()` per block for live mute/solo. Pause, seek, stop and restart discard
scheduled audio and rebuild/reset at the requested frame. This avoids stale lookahead
and tail state after a locate. Chain/graph parameter edits are heard on a new attempt;
only mute/solo is live without a rebuild, matching the 7.1 lifecycle contract.

**Reversible.** Yes: a future checkpoint/resume or live chain-refresh can replace the
restart rule without changing the facade.

### D8.1.4 — Rendered playback is streaming safe restart, not a persisted mix cache (builder, 2026-11-04)

**Decision.** RENDER reuses `renderProject` with a backpressured sink. A seek/restart
starts a new render attempt and discards output before the target frame. No full-project
mix buffer, export file or persisted checkpoint is introduced (Task 7.4 permits safe
restart; export remains 8.2).

**Reversible.** Yes: a durable rendered-mix store can later replace the discard-prefix
seek without changing the transport API.

## Correction 8.1.1 — Console-only layout correction (2026-11-04; uncommitted, awaiting review)

**Scope.** The Console room's layout and the guards that pin it. No Mixer, Arrange, Home
or Settings change; no component, token, DSP, engine, playback, schema or dependency
change.

### D8.1.1.1 — The Console hosts the mixer; processing detail is the Mixer's alone (owner-directed correction, 2026-11-04)

**Context.** `4c5ec57` restored the "approved" Console and Mixer layouts and, in the
Console, added a fourth zone: the selected channel's processing detail panel over the
channel bank, on a two-fractional-row grid (`max-content max-content
minmax(0, 0.95fr) minmax(0, 1.05fr)`) with `overflow: hidden`. `minmax(0, …)` cannot
scroll, and the two fixed hardware decks above it (293 px bridge, 125 px deck) leave
only 82 px of the 530 px room at 1366 × 768. Measured on the build of `4c5ec57`: the
detail zone 30.2 px, the bank zone 33.4 px — **49 px of the 719 px channel bank visible
at 1366 × 768** (179 px at 1920 × 1080), with the bank's own legend cut in half and the
panel that displaced it also unusable. Neither surface was legible; the "one-screen"
Console showed neither.

**Decision.** The Console is the plan's three zones again (plan §3: the upper section the
vintage meter bridge, "the lower section contains channel strips"; processing chain, EQ
curve, compressor and gain-reduction displays are the Mixer's row in the same table, and
the Console strips deliberately exclude the Mixer's tier and instrument controls). The
detail zone, its `MixerDetailPanel` import, the room's `selectedId` / `selectedChannel`
local state and the bank's click/focus selection handlers are removed, and
`ConsoleRoom.svelte` is restored byte-identically to the approved file
(`c937b69e2d4c6c2a…`) on the approved grid `max-content / max-content /
minmax(max-content, 1fr)` scrolling vertically inside its own bounded room, never the
page. The Mixer keeps everything `4c5ec57` gave it — the two-column layout, the compact
selectable headers and the processing detail panel — untouched.

**Guards.** The four Console guards return to their three-zone contracts
(`check-console-bridge`, `check-console-transport`, `check-transport`,
`check-channel-strip`), the `ConsoleRoom.svelte` hash pin returns to `c937b69e2d4c6c2a…`
in `check-arrange-rows`, `check-arrange-timeline`, `check-bus-return`,
`check-home-settings` and `check-mixer`, and `check-label-lamp`'s scope list regains
`ConsoleRoom.svelte` (the correction exemption claimed the room prints legends with
`EngravedLabel`; it prints none of its own — those headings belong to the bridge, the
deck and the bank — so the exemption was withdrawn). `check-console-bridge` gains three
checks (90 → 93): no `channel-detail` zone and no `MixerDetailPanel` import; no selection
state in the room; the bank's row keeps its `minmax(max-content, 1fr)` floor, so nothing
above can crush the strips again.

**Measured.** 100 % zoom, real Chromium, production build: 1366 × 768 and 1920 × 1080 both
render the three zones in order with no detail zone, `scrollHeight` equal to the viewport
(no page scroll), `scrollWidth` equal to it (no horizontal overflow), the bank at its full
719 px housing and the strips at their 160 px module width; 52 in-browser assertions pass
across all six routes, the bank's wheel scroll, the deck's four keys and MIX, the shared
transport's stopped state, the empty-project notice and the Mixer's selection → detail
binding. Against the approved baseline (`b172b8b`) the screenshots differ by **0 pixels**
at both sizes (reduced motion emulated, so the VU needles' drift is not counted).
`npm run check` 0/0, `npm test` 362/362, 30 guards / 2 430 checks.

**Consequence to note.** The approved desk is 719 px deep beneath a 418 px fixed head, so
below a ~1 200 px window it scrolls vertically inside the room by design, as it did before
`4c5ec57`; at 1366 × 768 that is the bank's legend plus the top ~49 px of the strips. Making
the strips visible without scrolling at 768 px would mean shrinking or collapsing the bridge,
the deck or the strips — all protected by standing rules — so it is an owner design decision,
not this correction. The numbers are in `task-reports/8.1.1-report.md` §5.

**Reversible.** Yes: one room file and the guard contract. No shared component, token or
behaviour is involved.

## Task 8.2 — WAV export and external rulebook integration

**Scope.** Plan §12 (export) and §9 (rulebooks). Functional integration only: no Console,
Arrange or Mixer layout change, no mini-transport change, no new dependency. The export
lives at the library level (`src/lib/export/`), the rulebook loader beside it
(`src/lib/rulebook/`); neither is wired into a screen in this task.

### D8.2.1 — Export is the 7.4 renderer plus a destination and a writer; there is no second pipeline

`renderProject` already renders the complete path with latency compensation, Return tails,
backpressure and cancellation, and it is the only code that knows how. So an export is:

- one pass over the whole project, whose sink writes the **full mix** and whose **bus
  taps** write the **bus files** — one pass, so the mix and its bus files are consistent by
  construction;
- one scoped pass per track for the **stems**.

**Rejected:** copying audio out of a mix buffer (loses the limiter's latency compensation
and the Return tails), muting other tracks around one render (a second run through stateful
DSP, and the mute state is the user's), and re-implementing summing for buses (a second
pipeline to keep in sync).

**Cost accepted:** `render.ts` gains `RenderOptions.onBuses` and its pinned sha moves from
`1a08dd23…` to `a08c6d12…`. `check-rendering-structure.mjs` is re-pinned with the reason
and gains four checks for the tap contract; nothing else in that guard was relaxed, and
its "same engine processes every block" check was widened to allow the optional fourth
argument rather than deleted.

**Consequence, deliberately:** taps are handed over **without** subtracting the limiter
lookahead. The first implementation did subtract it and every bus file arrived 240 frames
(5 ms) early — the master's own head drop had already compensated it. A test now
cross-correlates a bus file against the mix and requires the best lag to be **0**.

### D8.2.2 — A stem is that track's channel plus its declared route

A stem is rendered from a project containing exactly one track and only the Returns that
track's live sends reach, with `sidechains: []`. Consequences, all asserted:

- the track's inserts, pan, fader, mute and solo apply — the stem agrees with the mix;
- the **bus chain applies**, because the track's route is part of its sound (a stem that
  bypassed the bus would not sum with the others);
- **the stems sum to the full mix** over the project's length, sample for sample;
- a Return's wet signal is shared, effect-only, and reaches the mix through the sends, so
  the sum is exact only up to the master safety limiter (the sum's overs guard, not a
  track's processing).

The last point is the one plan §12 asks to "document carefully", so it is documented
**per stem, in the folder itself**: `export.json` carries `routing.output`,
`routing.sends[{to, levelDb, inStem: false}]` and a sentence naming the Return to
re-create and stating that the master limiter is absent.

**Rejected:** putting bus processing only in the bus file and leaving stems pre-bus (the
stem set would then not reconstruct the mix, and neither file would be "the track's
sound"); applying the master limiter per stem (it is a sum-level guard; per-stem limiting
would make the sum wrong).

### D8.2.3 — 32-bit float by default, 24-bit PCM offered, and no mastering at all

Plan §16 fixes 32-bit float internally and forbids mastering, normalisation and a loudness
target; the safety limiter is an overs guard only.

- **float32 WAV** is the default: the file's samples are the render's samples bit for bit
  (the test asserts a max sample error of exactly 0 against an unwritten render).
- **24-bit PCM** is offered because it is what delivery usually wants; it is the only path
  that can clip, so it rounds, clamps and reports `clipped` per file rather than wrapping.
- **No dither** (no dither stage exists in this build, and adding one would be inventing
  DSP behaviour §16 does not authorise), no `-14 LUFS`, no maximisation, no master EQ.
- `export.json` records `mastering: "none"`, and a test asserts a quiet mix stays quiet and
  a hot one is held at the ceiling rather than turned down to a target.

**Rejected:** reusing `encodeWav` from `src/lib/audio/wav.ts` — that function is documented
tests-and-evidence-only and needs the whole file in memory. `WavStreamWriter` streams a
block at a time, which is what a render delivers.

### D8.2.4 — Names are sanitised, truncated by bytes and deduped case-insensitively

Plan §12 wants predictable, collision-safe names; §17 leaves the convention open. Chosen
and documented in `data-model.md` §22.4: `<Project>/`, `Stems/NN <Track>.wav`,
`Buses/NN <Bus>.wav`, `<Project> - mix.wav`, plus `export.json`. Illegal characters,
leading dots and trailing dots/spaces go; DOS device names are escaped; the budget is
**80 bytes** (so a multi-byte character is never split); duplicates get ` (2)`, ` (3)`
**case-insensitively**, because a volume may be case-insensitive and two tracks may share a
name. The numbers in a stem or bus name come from the model's own `code`, so the files
match the Console's strip order.

### D8.2.5 — Rulebooks: external JSON only, validated against the engine's own specs, inert by default

- Schema `alloy.rulebook/1`. A rulebook has an `id`, a `name`, and `targets` scoped to
  `all`, a `family` or a `role`.
- **The parameter vocabulary is the engine's `ParamSpec` objects, by identity**
  (`RULES[...].spec === EQ_GAIN`). A rulebook therefore cannot invent a control, a unit or
  a range — a test asserts the identity so a copy cannot silently drift.
- **Locked decisions are refused by name** (`PINNED_PATHS`): priority, tier, mode,
  ownership, routing, output, sends, master. §16 is not negotiable by a data file.
- **Problems, never throws**: `{ok: false, problems: [{kind, path, message}]}` with JSON
  paths, every problem collected so a file can be fixed in one pass. `missing` and
  `malformed-json` and `unsupported-schema` are separate kinds, because "no such file",
  "not JSON" and "written for a newer build" are three different things to tell a user.
- **Application is the lowest-precedence nudge**, after tier/priority and masking: only
  `auto` values are written (a Manual value is the user's), values are clamped and stepped
  to the spec, unmatched scopes are reported, and the project is copied on write.
- **The shipped rulebook is inert.** Plan §9 defers the numeric contents, so
  `PLACEHOLDER_RULEBOOK` is valid, changes nothing, and says so in its own `$comment`.
  **No genre-specific value was invented or tuned**, which was an explicit constraint.

**Rejected:** baking rulebooks into the bundle as TypeScript constants (the task asks for
external JSON), and a rulebook that can express routing or ownership (that would let a data
file overrule decisions the plan locked).

### D8.2.6 — Two test suites, and a guard that pins the shape rather than the prose

`tests/export.test.mjs` (38 tests) renders through the real engine and asserts the bytes:
the mix file equals an unwritten render exactly, the stems sum to the mix, a bus file is
the bus's own processed output and is aligned with the mix, the format and sample rate are
the project's, a quiet mix stays quiet, a hot one is held but not normalised, collisions
resolve, empty selections and failures are reported, and two exports of one project are
byte-identical.

`tests/rulebook.test.mjs` (20 tests) loads **real fixture files**
(`tests/fixtures/rulebooks/`) so "missing", "malformed" and "wrong schema" are exercised
against a file system, then asserts the validation matrix, the Auto-only rule, clamping,
idempotence and that routing/sends/priority are untouchable.

`scripts/check-export-structure.mjs` (`npm run check:export`, 95 checks) guards the shape:
no second pipeline, no mastering stage, the format and folder contract, the naming rules,
the failure behaviour, the rulebook's limits, that both suites are wired into `npm test`,
that no dependency was added, and that the rooms were not touched.

**Reversible.** Yes: new modules under `src/lib/export/` and `src/lib/rulebook/`, one
optional renderer option, one guard, two suites, docs. Removing them leaves the transport
exactly as it was.

## Task 9.1 — Stabilization and end-to-end verification (2026-11-05; uncommitted, awaiting review — the owner handles Git)

**Scope.** Plan §14 Task 9.1 only: verify the complete workflow, fix reproducible
stabilization defects, audit the mini transport against §3 / Phase 0.6, and document
verified behaviour. No visual redesign, no new feature, no dependency change, no DSP
behaviour change. **Nothing committed, tagged or pushed.** Report:
`task-reports/9.1-stabilization.md`.

### D9.1.1 — The transport measures the playable length without playing (builder, 2026-11-05)

**Context.** `durationFrames` began at 0 and was written only inside `startPlayback()`, so
it was 0 until something played. PREVIOUS and NEXT call `seek(startFrame)` and
`seek(durationFrames)`, and `seek` is `clampFrame(frames, durationFrames)`: with a length
of 0 both located to 0. The two locate keys therefore did nothing until the user had
played once, and the position readout's denominator was meaningless. The controller had no
way to learn the length, so the shell had nothing to call.

**Decision.** `PlaybackController.refreshDuration()` opens the sources, computes
`sourceDurationFrames` for the current mode, and sets **only** `durationFrames` — it does
not play, pause, seek or change status. `setSource()` no longer blanks the length; it keeps
it and refreshes it for the new mode (PREVIEW and RENDER add the effect tail, so the
answer legitimately differs). `installPlaybackShell` measures once at install and again
when the project's **structure** moves.

**Trigger.** The project store's own history is the notification: an import, a project
switch (`loadProject`) and an undo/redo past a structural change all emit `clear`, while
an ordinary parameter edit emits only `record`/`merge`. A fader move therefore never pays
for a re-measure — pinned by a test that would fail if the trigger were widened.

**Safe failure, deliberately.** A refresh that cannot open the sources is silent: a length
is a convenience, and the next PLAY reports anything that is genuinely wrong. A failed
measurement must never turn the transport into an error state.

**Reversible.** Yes: one controller method, one facade line, one shell subscription. Removing
them restores the previous behaviour exactly.

### D9.1.2 — The listening-source selector: Option B plus one small control, in the persistent strip (owner choice 2026-11-05; **implemented as Task 9.1.1**)

**History.** `D2.3.2` (owner, 2026-10-31) decided the source is "printed as text … and selected
nowhere", restated by `D8.1.1`; a key column written during 9.1 was reverted for that reason. The
owner then approved a selector, chose **Option B** (bind the modes to existing controls, keep the
four-key deck), and — after B was shown to have no conflict-free mapping, because the app's only
five interactive controls are all committed and PREVIEW had no candidate — chose **(a): B plus one
small, visible three-position control**.

**Decision.** A three-position **RAW / PREVIEW / RENDER** control, as the owner specified: the four
approved keys and MIX keep exactly their functions, nothing is repurposed, and the room layout is
redesigned in no way.

**Where it lives, and why there.** In the **persistent mini transport**, as `MiniTransportSource.svelte`
mounted beside the transport keys. The strip is the one surface rendered outside the room switch, so
the control is visible and usable in **Console, Arrange and Mixer** alike. The Console deck was
deliberately left untouched: putting it there would have changed approved deck markup and D2.3.2's
four-key roster. This choice also keeps `check:console-transport`'s "selected nowhere" meaning intact
— that check still holds for the deck, and a new check asserts the selector is not on the deck.

**How the active mode is identifiable — three ways, deliberately.** The engaged position is drawn
inverted in the bar's existing neutral palette (the same treatment as PLAY's emphasis, no new
colour); it carries `aria-pressed`; and the transport's status readout beside it — unchanged, and
already printing `Stopped — RAW / PREVIEW / RENDER` — confirms it in words. Each position also has an
`aria-label` naming the mode and what it means.

**Behaviour.** Selecting a mode calls the shared facade's `setSource`; it does nothing else. Choosing
a mode while stopped does not start playback. The playhead position and the playable length survive a
switch (`S9.1.2`), and a switch made while playing restarts at the same position in the new mode.
Choosing the mode already in use is a no-op. **STOP, PREVIOUS and NEXT leave the mode alone** — the
selector is the only thing that changes it, so stopping to make an edit does not silently discard the
rendered mix the user was comparing against (plan §10). RAW after MIX now works, which is the defect
the control exists to fix.

**Guards: three re-pins, no relaxations, and new protection.** `src/components/MiniTransport.svelte`
is hash-pinned in three guards (`check-console-transport`, `check-arrange-rows`,
`check-home-settings`); each was re-pinned from `ea6ec47f…` to `d52703bb…` with the reason recorded
inline. Nothing was deleted: the deck's key-count, symbol and "selected nowhere" checks still pass
unchanged, and the min-height, fixed-position and token checks are untouched.
`check-transport-structure` **gains 8 checks** (34 → 42): one selector mounted from its own
component; exactly the plan's three modes in order as real buttons; selection drives `setSource`
and nothing else; the three-way active identification; per-mode accessible naming; no height, audio
context, timer, storage or dependency added; no keyboard-shortcut handling; and that the four keys
keep their exact functions with `setSource` absent from the strip. `check-console-transport` gains
one check asserting the selector is not on the deck (102 → 103).

**Tests: 6 added.** Five in `tests/playback.test.mjs` (24 total): all three modes selectable through
the facade; RAW restored after RENDER; a mode chosen while stopped starts nothing; the mode survives
STOP / PREVIOUS / NEXT; re-selecting the current mode is a no-op. One in
`tests/integration.test.mjs` (14 total) proving the two modes produce **different audio** — raw is the
summed stems, render applies the channel strip, so the comparison plan §10 requires is real rather
than a label change. Mutation-checked: removing `setSource`, dropping `aria-pressed`, and repurposing
PLAY to carry PREVIEW each fail the guards.

**Masking stays deferred** (`D9.1.3`): MIX still does not resolve masking. Not part of this task.

**Reversible.** Yes: one new component, one mount line and one import in the strip, and the guard
re-pins. Removing them returns the strip to its 8.1 state, and the deck was never touched.

### D9.1.3 — MIX still does not resolve masking (found in 9.1, deferred)

`measureMaskingSources`, `detectMaskingConflicts`, `resolveMaskingConflicts` and
`resolveMaskingAudio` are implemented and tested but called by **no file in `src/`**. The
engine accepts `maskingDynamicBands`; nothing supplies them. MIX is therefore a straight
render without conflict resolution, and plan §15's "Auto recalculated on rerun / Manual
preserved" is verified in the engine, not through the integrated path. 7.3 deferred
masking→store/UI/persistence explicitly; this needs the MIX orchestration task, not a
stabilization patch. **Not implemented in 9.1.**

### D9.1.4 — A guard that pinned a literal punished the act of adding a test suite (builder, 2026-11-05)

`check-editing-structure.mjs` compared the whole `npm test` string to one literal. Its
subject is the editing layer, so adding a suite failed it — and it would have accepted a
command that silently dropped a file, as long as the string matched.

**Changed, strengthened.** It now asserts the intent: the command uses the project loader
and `node:test`, every suite it names exists on disk, the Task 3.2–8.2 suites keep their
original order, and any suite beyond that roster must be on a named sanctioned list
(`tests/integration.test.mjs`, added by 9.1). Verified to still fail on a removed suite and
on an unsanctioned addition, naming the offending file. No other guard was relaxed: all 32
pass, 2 562 checks, and the count is unchanged.

**Reversible.** Yes: the check is one expression in one guard.

### D9.1.2a — The app boots an EMPTY project; the development session is dev/test data (owner, 2026-11-05)

**Context — a user-facing defect found in the browser, after 9.1 shipped.** A user imported
11 stems (48 kHz, 32-bit float) and heard nothing, while the transport reported
`Playing — RAW` and the clock advanced. The chain was sound: the fixture session ships
**track 15 "Lead Vocal" SOLOED** (and two tracks muted), solo silences every other track
(`computeAudibility` → `outputPasses` false), and the 11 imported stems became tracks 21–31.
Nothing in the UI said a fixture track the user had never touched was silencing them. The
solo is real fixture data, not a bug in the mixer.

**Owner decision.** Remove the mock project as the starting point: ALLOY must open an EMPTY
project. Keep the fixture session as development/test data.

**What changed.**

- `store.svelte.ts` boots `createEmptyProject(...)` instead of `createSessionProject()`.
  It is still the one `$state` tree — the guard for that is unchanged in substance and now
  asserts the empty boot.
- `lifecycle.restoreLast()` reports `outcome: "empty"` when nothing is restored, because the
  project it keeps is the empty one. `"fixture"` stays in the union for saved manifests that
  still name the development session; `bootOutcome()` reads the open project's template so the
  report is true rather than assumed.
- **New `tests/fixture-session.mjs`**: `loadFixtureSession()` replaces the open project with the
  development session *and* retargets autosave to that project's key, exactly as the lifecycle
  does on a switch. Four suites (`store`, `editing`, `shell`) and the parts of `lifecycle` that
  test fixture behaviour now load it **explicitly** instead of inheriting it from a default.
  That is the honest form: those tests are about the fixture, so they say so.
- The fixture modules themselves are **untouched**, and the dev playground still shows them.

**Guards: 4 re-pins, 3 checks rewritten, none weakened.** `store.svelte.ts`, `lifecycle.ts` and
`tests/store.test.mjs` are hash-pinned in four guards; each re-pinned with the reason inline.
Three checks changed subject rather than being deleted: the store guard now asserts the empty
boot (still one `$state` tree), the mixer-chain guard accepts the empty boot while still
requiring the Return fixtures to build the chain when the session is loaded, and the
`restoreLast` guard now requires `bootOutcome()` and the `empty` outcome.

**Tests: 2 added** to `tests/integration.test.mjs` — the app boots empty, and the fixture
session really does silence its other tracks (so the reason for this change cannot quietly
outlive its cause). Total 444 → 446.

**Deliberately not done.** The fixture-drawn timeline waveforms still exist *in the fixture*;
a new empty project draws nothing, which is the correct outcome for an empty project. Removing
the fixture drawing code outright was offered and declined in favour of this narrower change.

**Reversible.** Yes: one line in the store, the `bootOutcome` helper, the helper module and the
test wiring.

### D9.1.3 — A finished mix is a recorded fact, not a reading of the live progress gauge (owner, 2026-11-05)

**Context — a second browser defect, reported alongside the first.** The owner pressed MIX, watched
it run to completion, and nothing changed: the deck fell back to `Ready`, and the status display
never reported a mix. The three listening sources (RAW / PREVIEW / RENDER) worked; the *completion*
of an automatic mix was simply never shown, and nothing distinguished a mixed session from an
unmixed one.

**Root cause.** `ConsoleTransport` decided completion with
`transport.source === "render" && transport.renderProgress === 1`.
`renderProgress` is a **live gauge**: it is 0–1 while a render runs and `null` at every other
moment, and every path that ends a run clears it — including the render's *own* completion
(`controller.ts`, end of `runRender`: `renderProgress: null`). The `finish()` callback that set
`renderProgress` to 1 is immediately undone by the transport state that follows it. So the
expression could not be true at any moment a component could observe, and the "complete" branch of
the Mix button, its lit lamp, the `Mixed` status word and `Rerun available` were all unreachable.

This is a **state-modelling** defect, not a display one: the engine rendered correctly throughout
(verified: a one-track project renders 48 000 frames at peak 0.3536 and streams them to the
output), and the deck was honest about the state it was given. There was no fact to display.

**Fix.** Completion becomes its own recorded state, in the controller that owns transport state:

- `PlaybackState.renderProgress` is unchanged and still means the live gauge.
- New `PlaybackState.mixRevision: number | null` and `mixedAt: string | null`. Both are set at the
  very end of `runRender`, **after** the gauge is cleared, so the record and the gauge cannot
  contradict each other.
- `mixRevision` is **monotonic** (`private mixRevisions`), so a rerun after a cleared mix gets a new
  number rather than reusing the previous one. `clearMix()` sets the *state* to null; it does not
  rewind the counter.
- It survives `pause`, `stop`, `seek` and `setSource` — moving the playhead or choosing to listen
  to RAW does not discard a mix the user still has, and RAW → RENDER after a MIX finds it there.
- It is dropped by `clearMix()`, which `installPlaybackShell` calls on the same project-history
  `clear` events that already trigger a duration refresh: import, project switch, undo past one. A
  mix that no longer describes the open project stops claiming to.
- A **failed** render never records one; the error path leaves `mixRevision` null.

**Clock.** `mixedAt` needs a wall clock, and the controller reads no globals, so `PlaybackClock`
gains `now(): string` (HH:MM). The shell supplies `new Date()`; tests supply a fixed `"14:02"`, so
the "Mixed — at …" detail is assertable instead of raced.

**Guards.** 7 checks added to `check-playback-structure` pinning all of the above, including the
*ordering* (the record is written after the gauge is cleared) and the monotonicity. Two guards that
hash-pin `ConsoleTransport.svelte` were re-pinned: the change there is two expressions in the
script block, with no markup, class, style or DOM contract touched — the approved visual structure
is intact and the rest of those guards still assert it. **Mutation-checked:** reverting the record
makes 3 of the new tests fail.

**Tests: 4 added** (446 → 450) — a completed mix is reported complete; pause/stop/seek/source
changes keep it; a project change drops it and a rerun is numbered onwards; a failed render records
nothing.

**Not done, deliberately.** The deck does not count "manual edits since the mix" (`editsSince`), and
MIX still does not resolve masking (D9.1.2 / Task 10). Both are separate scoped work.

**Reversible.** Yes: the two state fields, one `set` block, `clearMix()`, one `now()` on the clock,
and the Console's `complete` expression.

### D9.1.4 — A stale clone must fail loudly, not silently delete pushed work (owner, 2026-11-05)

**Context.** Twice in one session the local checkout held a history that had **lost commits already
pushed to origin**. `HEAD` sat on an older commit, `origin/<branch>` was further ahead, and the files
of the missing work survived only as untracked copies on disk. In both cases a plain
`git add -A && git commit` would have committed **deletions of ~5,400 pushed lines**, and the push
would have served that deletion to the pull request. Both times it was caught by noticing the local
log looked short — by luck, not by any check.

**Decision (owner).** Make it impossible rather than merely unlikely.

**What was added.** `scripts/git-sync-guard.mjs`, plus `npm run check:git-sync` and an optional
pre-commit hook (`--install`).

- It **fetches first**. This is the whole point: in both incidents the remote-tracking ref was
  itself absent or stale, so a check that only read `origin/<branch>` could not have fired.
- It classifies `in-sync`, `ahead`, `behind`, `diverged`, `no-upstream`, `detached`, and treats
  **behind** as unsafe — that is precisely the shape of the incident.
- `ahead` is normal and passes silently (it is just unpushed work).
- An **unreachable origin stands down** (exit 0). A sync check must never block work because the
  network is down.
- `ALLOY_SKIP_SYNC_CHECK=1` bypasses it, so a deliberate reset is always possible.
- It prints the exact remediation, which is a **mixed** `git reset origin/<branch>` — files on disk
  untouched, as the existing history notes require.

**Verified end to end** in a throwaway clone that reproduces the incident: the guard reports
`BEHIND` and exits 1; the installed pre-commit hook **blocks** the commit and leaves the changes
staged; following the printed advice (`git fetch && git reset origin/main`) restores the pushed
commit; the same commit then succeeds and the pushed content is intact.

**Guards.** A 13-check contract (`check-git-sync`) pins the fetch-first ordering, the
behind-is-unsafe classification, the offline stand-down, the bypass, the hook installer and the
absence of a new dependency. **No dependency was added** — detection is a `git` subprocess call.

**Note on the merge that prompted this.** PR #5 was merged into `main` (merge commit `92769d1`),
carrying all seven task commits: `4c5ec57`, `e472f3e`, `8f131b2`, `f809fdd`, `4d09bfa`, `322b130`,
`4a86b20`. PR #4 was redundant — its single commit was fully contained in #5 — and closed by that
merge; `main`'s tree is byte-identical to the verified `4a86b20`, so nothing was added or lost.

**Reversible.** Yes: delete the script, the `check:git-sync` entry, the contract and the hook.
