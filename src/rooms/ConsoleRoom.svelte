<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import ConsoleMeterBridge from "../components/meter-bridge/ConsoleMeterBridge.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { project } from "../lib/project/store.svelte";

  /* Task 9.6 — the 0.8× Console (owner, D9.6.1, 2026-11-12: "get everything
     smaller just like you are zooming out to 80%"). The owner was running the
     browser at 80% zoom to see the transport bar on their window; the room now
     carries that density itself, at 100%: every token the room reads — the
     spacing steps and the type ramp — is rescaled by 0.8 in ONE place, the
     room's own scope, and every fixed geometry the room's components declare
     (the strip's width and its controls' sizes, the decks' cheeks, the
     bridge's instruments) is written down at its 0.8× value beside its
     component. The tokens.css file is untouched: the tokens are the 1×
     authority, and this scope is the Console's density, the way a hardware
     console's photo and its 1:1 face differ only in scale. Nothing outside
     .console-room is affected — the shell, the header, the other rooms keep
     their 1× (the shell's deck row carries the deck's own copy of this list,
     Task 10.2). */

  /* Task 9.5 — the one-window Console, the owner's reference console's
     layout (owner decision D9.5.1, 2026-11-12, with the reference
     photograph), which the density above now serves:

       METER BRIDGE   one compact instrument strip across the top — spectrum,
                      goniometer, correlation, the master VU pair (D9.6.3:
                      the owner's order, no legends, the instruments filling
                      the row's height).
       CHANNEL BANK   the three rails — scrolling tracks (D9.6.4: divided
                      from the Returns by a walnut bar), independently
                      scrolling Returns, the static bus master — taking all
                      the room that is left: the channels are the coolest
                      thing in the whole program, and they are the first thing
                      on screen, whole, never scrolled away to reach (the 9.4
                      report's words for the failure this layout fixes).
       TRANSPORT      the full deck — Task 10.2 (owner, D10.2.1): the deck
                      that was this room's third row, its own bottom bar, is
                      lifted to the shell and rendered once BELOW the room,
                      shared with the Mixer and the Arrange rooms (the
                      owner's instruction: all three tabs show the same
                      transport bar). The room itself is the two zones above;
                      the shell's deck row is this room's foot now, and its
                      MIX button shows only here (D10.2.2).

     The shell's persistent mini transport does not show in this room (app.css)
     — nor in Mixer or Arrange, which show the same deck — and the deck row
     below is the one transport any of the three rooms has. The strip stays
     mounted — the shell renders it outside the room switch — it is only not
     displayed; the routes without the deck keep it.

     The room never scrolls vertically on a normal desktop window: the
     bridge and the bar hold their compact heights and the bank takes the
     rest. On a window too short for the strip's minimum, the layout scrolls
     inside the room — never the page, and never sideways. The zone hooks
     and their accessible names (the bridge's, the bank's) are unchanged:
     the two zones still render the <h2>s their zones are labelled by
     (visually hidden since Task 9.5). */
</script>

<RoomShell
  roomId="console"
  title="Console"
  purpose="Primary overview and automatic-mix workspace."
  hideHeader
>
  <div class="console-room">
    <div class="console-layout" data-console-layout>
      <section
        class="console-zone console-zone--meter"
        data-console-zone="meter-bridge"
        aria-labelledby="console-meter-title"
      >
        <ConsoleMeterBridge />
      </section>

      <section
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
      >
        {#if project.isEmpty}
          <EmptyProjectNotice headingId="console-channels-title" room="console" />
        {:else}
          <ChannelBank />
        {/if}
      </section>
    </div>
  </div>
</RoomShell>

<style>
  .console-room {
    /* =====================================================================
       Task 9.6, D9.6.1 — the Console's 0.8× density, in one scope.

       The owner ran their browser at 80% zoom to see the whole Console; the
       room now carries that scale itself. Every token the room's components
       read is re-declared here at 0.8× of the 1× value in tokens.css: the
       spacing steps (px × 0.8) and the type ramp (rem × 0.8). This is the
       whole density change for everything token-driven — the engraved print,
       the paddings, the gaps, the recess insets. The fixed geometries the
       room's own components declare (strip width, control sizes, deck
       cheeks, bridge instruments) are written at their 0.8× value in the
       component that owns them, each with its D-ref — the transport deck's
       caps and windows left with the deck (Task 10.2), and their written-down
       0.8× values went with the component: the shell's deck row carries this
       same token scope for them (app.css).

       tokens.css stays the 1× authority, untouched; nothing above this
       element — the shell, the header, the other rooms — sees any of this.
       ===================================================================== */
    --al-space-3xs: 1.6px;   /* 2 × 0.8 */
    --al-space-2xs: 3.2px;   /* 4 × 0.8 */
    --al-space-xs: 4.8px;    /* 6 × 0.8 */
    --al-space-sm: 6.4px;    /* 8 × 0.8 */
    --al-space-md: 9.6px;    /* 12 × 0.8 */
    --al-space-lg: 12.8px;   /* 16 × 0.8 */
    --al-space-xl: 19.2px;   /* 24 × 0.8 */
    --al-space-2xl: 25.6px;  /* 32 × 0.8 */
    --al-space-3xl: 38.4px;  /* 48 × 0.8 */

    --al-text-size-2xs: 0.5rem;    /* 10 × 0.8 */
    --al-text-size-xs: 0.55rem;    /* 11 × 0.8 */
    --al-text-size-sm: 0.6rem;     /* 12 × 0.8 */
    --al-text-size-md: 0.65rem;    /* 13 × 0.8 */
    --al-text-size-base: 0.7rem;   /* 14 × 0.8 */
    --al-text-size-lg: 0.8rem;     /* 16 × 0.8 */
    --al-text-size-xl: 1rem;       /* 20 × 0.8 */
    --al-text-size-2xl: 1.2rem;    /* 24 × 0.8 */

    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  /* Task 9.5: the bridge holds its compact height and the bank takes
     everything below it but never less than its own content. Task 10.2: the
     transport row is gone — the deck is the shell's foot row below the room —
     so the layout is the two rows the room owns. The minimum is
     max-content rather than auto on purpose: with a definite layout height
     and no free space, an auto row collapses below its content and the zones
     overlap. On a window too short for both, the layout scrolls vertically
     inside the room — never the page, and never sideways. */
  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content
      minmax(max-content, 1fr);
    /* 0.375 × 0.8 — the zones' seams at the room's density (D9.6.1) */
    gap: 0.3rem;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .console-zone {
    display: flex;
    flex-direction: column;
    gap: 0.4rem; /* 0.5 × 0.8 (D9.6.1) */
    min-width: 0;
    min-height: 0;
  }

  /* The bank's zone is a grid of one row: the bank FILLS the zone's height
     (Task 9.5), so the strips stretch to the window and their fader
     sections take the free length — a console's channels stand full-height,
     with no dead band under them. */
  .console-zone--channels {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
  }

  /* The skinned zones are their own housings: no placeholder frame round
     them (the bridge, the bank — the transport zone left the room with the
     deck, Task 10.2). */
  .console-zone--meter,
  .console-zone--channels {
    padding: 0;
    border: 0;
    background: none;
  }
</style>
