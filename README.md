# ALLOY

Rule-based automatic rough-mixing application. The current build is the Phase 0
application shell: one shared shell with three rooms — **Console**, **Arrange**
and **Mixer** — and working navigation between them. The Console room has its
structural skeleton: meter bridge, a horizontally scrollable 20-strip channel
bank (11 tracks fit by default) with pinned Return and bus-master channels, and
a transport placeholder zone.

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
│   ├── RoomNav.svelte            Console / Arrange / Mixer navigation
│   ├── RoomPlaceholder.svelte    labeled empty-room placeholder
│   └── RoomShell.svelte          shared room header and content boundary
├── lib/
│   ├── arrange.ts                Arrange placeholder counts and labels
│   └── rooms.ts                  room definitions and hash parsing
└── rooms/
    ├── ConsoleRoom.svelte
    ├── ArrangeRoom.svelte
    └── MixerRoom.svelte
scripts/
└── check-arrange-structure.mjs   Arrange layout contract check
```

## Commands

```bash
npm install
npm run dev       # development server
npm run check          # svelte-check + TypeScript diagnostics
npm run check:arrange  # Arrange structural contract check (no geometry)
npm run build          # production build
npm run preview   # serve the production build
```

## Room routing

Hash routes keep the shell static-host friendly:

- `#/console` — default room
- `#/arrange`
- `#/mixer`

The navigation stays visible across room changes, marks the active room with
`aria-current="page"`, and each room exposes its own labeled content. The top
bar is sticky, and the Console transport panel is hidden until the page is
scrolled. The Console channel bank shows 11 of its 20 tracks by default and
scrolls horizontally; its Return and bus-master rail stays pinned at the right.

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

## Status

Tasks 0.1–0.4 are implemented. Tasks 0.5–0.6, design tokens, room detail,
shared project state, and audio functionality are **not** implemented.
