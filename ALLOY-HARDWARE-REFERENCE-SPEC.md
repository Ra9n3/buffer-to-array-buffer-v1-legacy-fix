# ALLOY — Hardware Reference Specification

**Purpose:** This document translates specific analog-console hardware details into
unambiguous, buildable specifications. It exists because screenshots/photos could
not be attached directly to build prompts. Every Phase 1 (component playground)
task must read this file before implementation. Do not substitute generic modern
UI styling for any element described here — if a detail is unclear, prefer the
more "physical hardware" interpretation, not the more "flat UI" interpretation.

## 1. Rotary Pot (Knob)

### Structure

- Two-part construction: a knurled cylindrical base plus a flat circular cap
  sitting on top, slightly smaller in diameter than the base.
- **Base:** dark/black, with a repeating ridge texture around the circumference
  (approximately 16–20 vertical ridges), suggesting a grippable knurled edge
  viewed from above.
- **Cap:** flat, circular, rendered in the function-color assigned by the color
  table in the main design system (cream, amber, red, blue-grey, green, or
  orange depending on the control's purpose). Apply a radial highlight
  (lighter upper-left, darker lower-right) so the cap reads as a glossy or
  matte dome, not a flat-filled circle.

### Pointer and scale

- A single straight pointer line runs from near the cap's center to its edge,
  in a dark contrasting color, rotating to reflect the current value.
- Surrounding tick marks span roughly 270° around the knob, generated
  programmatically at regular intervals. Numeric labels appear only at the two
  extremes (e.g. "0" and "10"), not at every tick.
- A small fixed triangle is printed on the panel itself (does not rotate),
  marking a reference position such as center/unity/default.

### States

- Default, dragging (pointer updates live), keyboard-focused (visible focus
  ring consistent with accessibility requirements), disabled (desaturated),
  and numeric-entry mode (double-click reveals a typeable value, per the
  modern interaction requirements in the main design system).

### Explicitly avoid

A flat solid-color circle with no base/cap separation, no knurl texture, and no
pointer. That reads as a generic modern UI dial, not console hardware.

## 2. Tactile Square Switch

Two labeling conventions exist and should both be supported as variants of one
shared component:

### Variant A — cap-labeled

- Square cap with gently rounded corners (border-radius roughly 15–20% of
  width, not fully round).
- Glossy/chrome-like raised top surface: diagonal highlight gradient
  (brighter top-left, darker bottom-right) suggesting a convex surface.
- Label text printed directly on the cap (e.g. "ON").

### Variant B — panel-labeled

- Flatter, matte-finish square cap, same rounded-corner proportions as
  Variant A but less glossy.
- Sits inset into a recessed square well in the panel — render a thin dark
  inset shadow/border around the switch base so it visually sits below the
  panel surface, not flush or floating above it.
- Label text is split: a function label printed on the panel above the
  switch (e.g. "PAD"), and a value label printed on the panel below it
  (e.g. "26dB"). This is the default convention for most function switches
  (bypass, band-select, pad, HPF, phantom power, etc).

### Interaction states

- Default (raised appearance per variant above).
- Pressed: cap visually sinks — reduce highlight-gradient intensity, shift
  shadow inward, optionally reduce apparent size by 1–2px.
- Engaged/active: an adjacent small lamp indicator (see Section 4 below,
  scaled down) lights up amber or red next to the switch to show the
  function is currently on. The switch's own cap appearance does not need
  to change color — the adjacent lamp carries the "is this on" signal,
  matching real hardware convention (see PHANTOM switch reference).

### Explicitly avoid

Modern toggle/checkbox styling — sliding pill shapes, flat material-design
checkboxes, or anything that doesn't read as a physical push-button keycap.

## 3. Fader Cap — "Finger-Hollow Curve"

### Shape

- Rectangular cap, noticeably wider than tall (roughly 2.5:1 to 3:1
  width-to-height ratio), with rounded short ends.
- The top surface is concave, not flat: it dips down toward a central
  trough and rises again at both the front and back edges — similar to the
  cross-section of a small halfpipe, shaped so a fingertip rests naturally
  in the hollow.

### Rendering approach

- A single uniform highlight (e.g. simple border-radius + box-shadow) will
  NOT read as concave and must not be used.
- Use a layered gradient technique instead: two light highlight bands along
  the front and back edges (representing the raised lips catching light),
  and a darker gradient pooling toward the center (representing the hollow).
- This may require a small dedicated SVG asset with the gradient baked in,
  or multiple stacked CSS gradient layers. Flag this component as needing
  extra polish/iteration rather than a one-pass implementation.

### Color and context

- Cream/off-white or light gray, consistent with the "cream / off-white"
  function-color family (input trim and gain staging) already defined in
  the main design system.
- The cap sits on a visible shaft protruding into a long recessed
  track/slot cut into the panel, with tick marks alongside the slot for
  level reference, matching the visual convention of the knob's tick marks.

### Explicitly avoid

A flat rectangular cap with a single uniform highlight — that reads as a
generic DAW fader, not a hardware fader cap.

## 4. VU Meter — Lamp Illumination (Not LED)

This component has two visually distinct meter types in the reference
material. Build both as separate components; do not conflate them.

### 4a. Analog VU meter (needle + lamp glow)

**Housing:**

- Dark frame/bezel (near-black or dark walnut-brown) recessed into the
  panel like a window.
- A thin lighter trim line (brass or cream tone) separates the face from
  the outer frame.

**Face:**

- Background color: warm cream/parchment, slightly yellowed — not pure white.
- An arc-shaped scale (not a straight line), with tick marks radiating from
  a pivot point positioned below-center.
- Numeric labels at key points only. The upper range of the arc is marked in
  red (overload zone); the rest of the scale is black/dark gray.
- "VU" text printed at the bottom-center of the arc.

**Needle:**

- Thin black needle, pivoting from a small circular hub below-center of the
  arc.
- A subtle soft drop-shadow beneath the needle on the face sells it as a
  physical object rather than a flat vector line.

**Lamp glow (critical distinguishing detail):**

- Color: warm amber/gold, in the approximate range `#e8a454`–`#f0c27a`.
  Never cool white, never blue-white.
- Quality: soft, diffuse, and uneven — brighter near a lower-center point
  (where a physical bulb would sit behind the face), fading outward with a
  gentle, slightly irregular vignette. Use a large blur radius and
  asymmetric falloff, not a perfect uniform circle.
- Optional: a very subtle, slow brightness variation (barely perceptible)
  to suggest an incandescent bulb, rather than a perfectly static glow.

**Explicit instruction:** Do NOT implement this as a flat background-color
fill or a uniform radial gradient with a hard edge — that reads as an
LED-backlit screen. The goal is a soft incandescent bulb glowing behind a
frosted/translucent face.

### 4b. LED segment ladder meter (separate component, different context)

- Vertical column of individually lit rectangular/rounded segments.
- Color bands: green (lower range), amber/yellow (middle range), red (peak
  range near/at the top) — segments light cumulatively from the bottom up
  as level increases.
- Each segment should look like a discrete, crisply-edged illuminated
  block, in clear visual contrast to the soft diffuse VU lamp glow above.
  This crisp, segmented look is specifically appropriate here and nowhere
  else in the design — it must not be used for the master VU meters.

**Where each is used:** Master/channel level metering in the Console room's
meter bridge uses the analog lamp-style VU meter (4a) as its primary visual
language, consistent with the vintage design direction. The LED ladder style
(4b) may be used only where a reference explicitly calls for a numeric/fast
peak ladder display, if the project decides such a secondary meter is
needed — it is not a replacement for the VU meter aesthetic.

## 5. Functional Color Coding — Applied to Components

Confirmed from reference material: knob cap colors visibly differ by function
on real consoles. This is not just a panel accent — it applies to every pot
individually, per the existing color table in the main design document:

| Color family | Applies to |
| --- | --- |
| Cream / off-white | Input trim, gain staging, fader caps |
| Amber / gold | EQ and tonal controls |
| Red | Compression and dynamics |
| Blue-grey | Pan, stereo image, spatial placement |
| Green | Sends, auxiliary paths, reverb/delay (see Section 8a of main doc) |
| Orange | Bus/group masters, recurring console accent stripe |

Switch-engaged lamp indicators (Section 2 above) generally use red or amber
regardless of the switch's own function color, matching the reference
convention of a small red/amber dot beside an engaged switch (e.g. phantom
power).

## 6. General Construction Note for the Coding Agent

Prefer SVG or layered CSS gradients over flat single-color fills for every
component in this document. The visual goal throughout is "physical object
with light and shadow," not "flat colored shape." Where a component is
described as needing an asymmetric, soft, or layered effect, treat that as a
requirement, not a stylistic suggestion — flat/uniform renderings of these
components do not satisfy the design intent and should be revised.

## 7. Organizational Color Marker

Organizational color is a track/group identity cue, not a functional control
color. Show it as a small, clearly visible colored tab or flag beside the
engraved track name. Do not wash the entire channel strip background in the
organizational color. Keep the underlying console material, labels, control
surfaces, and functional knob colors consistent with the hardware design
system. Use the same marker treatment wherever the track is represented in
Arrange, Mixer, and Console.
