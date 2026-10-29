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

## Task 1.2 — Knob / pot component

### D1.2.1 — The focus ring sits on the knurled collar, not outside the knob

**Context.** Hardware spec §1 states that a panel prints its tick ring and
extreme numerals *around* the knob, and requires a "focus ring consistent with
accessibility requirements". A conventional outer halo and the printed scale
occupy the same space.

**Decision.** The focus ring is drawn **on the knurled collar**, just inside the
tick ring: a 2px off-white ring with a dark gap either side, so it reads as the
collar catching light rather than as a browser focus rectangle. It never collides
with the tick ring, the extreme numerals or the reference triangle, at any knob
size, because it is inside them.

**Why.** It satisfies focus visibility without damaging a printed marking, and it
keeps the vintage surface free of a generic UI outline.

**Reversible.** Yes — the ring is one absolutely-positioned element with an
`inset` value.

### D1.2.2 — Drag mapping: 180px of vertical travel equals the full range

**Context.** The spec requires click-drag but does not define sensitivity.

**Decision.** Vertical travel is the primary axis with horizontal added on the
same scale (`startY − clientY + clientX − startX`), 180px covering the full range.
Holding Shift reduces sensitivity to 0.2×. Pointer capture is used so a drag that
leaves the knob keeps working.

**Why.** It is the console convention: up is louder, and the knob does not jump
when the pointer leaves its edge. Shift-fine is the standard fine-adjust gesture
and costs nothing.

**Reversible.** Yes — one constant.

### D1.2.3 — Keyboard set: arrows, Shift+arrows, Page Up/Down, Home/End, Enter

**Context.** The spec requires "keyboard interaction works as implemented" and a
numeric-entry mode, but does not enumerate keys.

**Decision.** Up/Right and Down/Left step by `step`; with Shift they step by one
tenth of `step`; Page Up/Down step by ten; Home/End jump to the bounds; Enter or
F2 opens numeric entry. The value is always clamped and snapped through a single
`setValue()`, so no input path can produce an out-of-range or off-grid value.

**Why.** It matches the slider role the knob exposes (`role="slider"`,
`aria-valuenow`, `aria-valuetext`) so assistive technology and muscle memory
behave as expected.

**Reversible.** Yes.

### D1.2.4 — Invalid numeric entry is rejected, out-of-range entry is clamped

**Context.** The spec requires validation and safe handling of invalid or
out-of-range input, and does not say what to do with each.

**Decision.** Two different failures get two different responses. Text that is
not a number (including an empty field) is **rejected**: the editor stays open,
the field is marked `aria-invalid`, and a `role="alert"` message states the valid
range. A number outside the range is **clamped** to the nearest bound and
committed. Escape cancels without writing.

**Why.** Typing "abc" is a mistake worth correcting in place; typing "9999" into
a −60…6 control clearly means "as far as it goes".

**Reversible.** Yes.

### D1.2.5 — Static state demos in the playground, real state in the component

**Context.** The playground must show dragging, focused and numeric-entry states.
Faking those inside the component would mean a `forceState` prop that product
code could also set, which is exactly the kind of prop that later becomes a bug.

**Decision.** The component owns only its **real** state. The playground passes a
`demoState` prop that is used solely for CSS class toggles (`is-demo-focus`,
`is-dragging`) and, for numeric entry, to open the real editor. The component's
`data-knob-state` attribute always reports the real computed state.

**Why.** The demos are honest — the numeric-entry demo is genuinely editing — and
no product code path can force a fake dragging state.

**Reversible.** Yes.

### D1.2.6 — Playground fixtures are visual only, not product parameters

**Context.** The playground needs ranges, units and example values.

**Decision.** Every fixture's label, range, unit and start value is playground
data, declared in `DevComponentsPage.svelte` and labelled as such. None of it is a
proposed audio-processing parameter, and nothing is exported for reuse.

**Why.** The plan defers all numeric rulebook and parameter values to listening
tests; presenting playground ranges as agreed defaults would quietly turn a
deferred decision into a fixed one.

**Reversible.** N/A — a boundary.
