<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import ConsoleTransport from "../components/console-transport/ConsoleTransport.svelte";
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import ConsoleMeterBridge from "../components/meter-bridge/ConsoleMeterBridge.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { project } from "../lib/project/store.svelte";

  /* Task 9.5 — the one-window Console, the owner's reference console's
     layout (owner decision D9.5.1, 2026-11-12, with the reference
     photograph):

       METER BRIDGE   one compact instrument strip across the top — phase,
                      goniometer, spectrum, the master VU pair (~17% of the
                      reference's face).
       CHANNEL BANK   the three rails — scrolling tracks, independently
                      scrolling Returns, the static bus master — taking all
                      the room that is left (~60%): the channels are the
                      coolest thing in the whole program, and they are the
                      first thing on screen, whole, never scrolled away to
                      reach (the 9.4 report's words for the failure this
                      layout fixes).
       TRANSPORT      the full deck at the very BOTTOM, like the reference's
                      (~13%): the four keys, the lamp-lit time and status
                      windows and the dominant MIX button at the right end.

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
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .console-zone {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
