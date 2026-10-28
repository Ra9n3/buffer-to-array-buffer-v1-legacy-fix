# ALLOY

Rule-based automatic rough-mixing application. The current build is the Phase 0
application shell: one shared shell with three rooms — **Arrange**, **Console**
and **Mixer** — working navigation between them, and a persistent mini transport
strip that stays put across all three. The Console room has its
structural skeleton: meter bridge, a horizontally scrollable 20-strip channel
bank (11 tracks fit by default) with pinned Return and bus-master channels, and
a transport placeholder zone. The Mixer room has its skeleton too: a vertically
scrollable channel column on the left and a selected-channel processing-detail
panel on the right, with local placeholder selection.

## Sources of truth

| File | Purpose |
| --- | --- |
| `ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt` | Product-level source of truth, including the Phase 0–9 roadmap |
| `ALLOY-HARDWARE-REFERENCE-SPEC.md` | Required reading for Phase 1 and Phase 2 UI work |
| `ALLOY-PRODUCT-GLOSSARY.md` | Canonical terminology |
| `ALLOY-TASK-PROMPT-TEMPLATE.md` | Required task/report structure |
| `task-reports/` | One report per finished task |

## Stack

Svelte 5 + TypeScript + Vite 7. No SvelteKit and no server-side rendering, per
the locked decision in the product plan.

## Structure

```text
src/
├── App.svelte                    application shell and room routing
├── app.css                       flat gray-box Phase 0 styles
├── main.ts                       app mount
├── components/
│   ├── ArrangeTimelineLane.svelte empty structural timeline lane
│   ├── ArrangeTrackRow.svelte    track-list row placeholder
│   ├── ChannelBank.svelte        horizontal track bank and pinned rail
│   ├── ChannelStrip.svelte       neutral channel-strip placeholder
│   ├── MiniTransport.svelte      persistent transport strip (shared shell)
│   ├── MixerChannelStrip.svelte  selectable Mixer channel header
│   ├── MixerDetailPanel.svelte   selected-channel processing-detail panel
│   ├── RoomNav.svelte            Arrange / Console / Mixer navigation
│   ├── RoomPlaceholder.svelte    labeled empty-room placeholder
│   └── RoomShell.svelte          shared room header and content boundary
├── lib/
│   ├── arrange.ts                Arrange placeholder counts and labels
│   ├── mixer.ts                  Mixer placeholder channels and chain steps
│   └── rooms.ts                  room definitions and hash parsing
└── rooms/
    ├── ConsoleRoom.svelte
    ├── ArrangeRoom.svelte
    └── MixerRoom.svelte
scripts/
├── check-arrange-structure.mjs   Arrange layout contract check
├── check-mixer-structure.mjs     Mixer + navigation contract check
└── check-transport-structure.mjs Mini transport contract check
```

## Commands

```bash
npm install
npm run dev       # development server
npm run check          # svelte-check + TypeScript diagnostics
npm run check:arrange  # Arrange structural contract check (no geometry)
npm run check:mixer    # Mixer + navigation contract check (no geometry)
npm run check:transport # Mini transport contract check (no geometry)
npm run build          # production build
npm run preview   # serve the production build
```

## Room routing

Hash routes keep the shell static-host friendly:

- `#/console` — default room
- `#/arrange`
- `#/mixer`

The navigation stays visible across room changes, marks the active room with
`aria-current="page"`, and each room exposes its own labeled content. Tabs read
left to right **Arrange | Console | Mixer**, sit on the right of the top bar with
the ALLOY wordmark on the left, and are deliberately compact (28px tall). The
top bar is sticky. The Console channel bank shows 11 of its 20 tracks by default and
scrolls horizontally; its Return and bus-master rail stays pinned at the right.

All three rooms are bounded to the viewport: room content scrolls inside its own
pane rather than the page, so the mini transport below it can never cover it.

## Retired documentation site

The previous React documentation/playground site is preserved in
`archive/documentation-site/` for reference only. It is not part of the build.
The product documents themselves remain at the repository root and in
`task-reports/`.

## Arrange room

The Arrange room is a bounded two-dimensional scroller. A single scroll
container holds a CSS grid whose rows are shared between the track-list column
and the timeline, so a track row and its lane are literally the same grid row
and cannot drift apart. The track-list header and the timeline header
(structure markers, tempo track, ruler) stick to the top; the track-list column
sticks to the left. Horizontal scrolling moves only the timeline content, and
vertical scrolling moves rows and lanes together. 20 placeholder track rows,
56 bars, and the seven canonical structure markers are placeholders only — no
waveforms, audio, or project state.

## Mixer room

A two-pane bounded workspace. The left column is a vertically scrollable list of
23 selectable placeholder channels (20 tracks, then the Reverb and Delay Returns
and the bus master). The right pane is the selected channel's processing detail:
chain steps in the product plan's order, EQ curve, compressor and gain
reduction, sends, Auto/Manual, original-versus-current ghost indicators, and the
"what changed and why" area — all neutral placeholders.

Selection is local per-room UI state only, held in `$state`; there is no store,
no persistence, and no cross-room synchronisation. Strips are real `<button>`
elements carrying `aria-pressed`, so selection works with mouse and keyboard.

The Mixer track headers are dimensioned to match the Arrange track headers — row
height, padding, label alignment, typography scale and border treatment. The
shared geometry lives as `--track-header-*` custom properties in `app.css`, and
`npm run check:mixer` fails if the Mixer tokens and the Arrange row values ever
disagree. Selection is drawn with a background change and an inset ring, so
selecting a channel never changes the header's size.

## Mini transport

One `MiniTransport` component is rendered by `App.svelte` outside the room
switch, so switching rooms neither remounts it nor moves it. It is fixed to the
bottom of the shell, its height is declared once as `--mini-transport-height`,
and the shell reserves exactly that height beneath its content. Content that
narrows gives way in a fixed order rather than clipping.

It is a **placeholder**: Previous / Play / Stop / Next are inert, the position
readout is static, and the strip says so in visible text that also describes the
buttons for screen readers. No audio engine, project state, or playback is
connected — that is Phase 3+ work, per the plan's build-order rule.

## Status

Tasks 0.1–0.6 are implemented; 0.1–0.5 are approved and Task 0.6 awaits owner
review. Design tokens, channel-type-aware Mixer detail, shared project state,
and audio functionality are **not** implemented.
