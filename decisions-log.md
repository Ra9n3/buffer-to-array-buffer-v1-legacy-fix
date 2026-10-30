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
