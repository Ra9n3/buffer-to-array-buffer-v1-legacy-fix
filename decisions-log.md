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
