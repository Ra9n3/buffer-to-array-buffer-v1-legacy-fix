<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import ConsoleTransport from "../components/console-transport/ConsoleTransport.svelte";
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
     transport's caps and windows, the bridge's instruments) is written down at
     its 0.8× value beside its component. The tokens.css file is untouched: the
     tokens are the 1× authority, and this scope is the Console's density, the
     way a hardware console's photo and its 1:1 face differ only in scale.
     Nothing outside .console-room is affected — the shell, the header, the
     other rooms keep their 1×. */

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
       TRANSPORT      the full deck at the very BOTTOM, like the reference's,
                      nearly half its Task 9.5 height (D9.6.2): the four keys,
                      the lamp-lit time and status windows and the dominant
                      MIX button at the right end.

     The shell's persistent mini transport does not show in this room
     (app.css): the room's own bottom bar IS the transport here, and two
     bars at one foot would be one too many. It stays mounted — the shell
     renders it outside the room switch — it is only not displayed.

     The room never scrolls vertically on a normal desktop window: the
     bridge and the bar hold their compact heights and the bank takes the
     rest. On a window too short for the strip's minimum, the layout scrolls
     inside the room — never the page, and never sideways. The zone hooks
     and their accessible names (the bridge's, the bank's, the transport's)
     are unchanged: the bridge, the bank and the transport still render the
     <h2>s their zones are labelled by (visually hidden now, Task 9.5). */
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

      <section
        class="console-zone console-zone--transport"
        data-console-zone="transport"
        aria-labelledby="console-transport-title"
      >
        <ConsoleTransport live />
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
       cheeks, transport caps and windows, bridge instruments) are written at
       their 0.8× value in the component that owns them, each with its D-ref.

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

  /* Task 9.5: the bridge holds its compact height, the bank takes everything
     between the two decks but never less than its own content, and the
     transport deck is the room's bottom bar. The minimums are max-content
     rather than auto on purpose: with a definite layout height and no free
     space, an auto row collapses below its content and the zones overlap.
     On a window too short for all three, the layout scrolls vertically
     inside the room — never the page, and never sideways. */
  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content
      minmax(max-content, 1fr)
      max-content;
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
     them (the bridge, the bank, the transport). */
  .console-zone--meter,
  .console-zone--transport,
  .console-zone--channels {
    padding: 0;
    border: 0;
    background: none;
  }
</style>
