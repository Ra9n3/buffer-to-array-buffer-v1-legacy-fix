<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import ConsoleTransport from "../components/console-transport/ConsoleTransport.svelte";
  import ConsoleMeterBridge from "../components/meter-bridge/ConsoleMeterBridge.svelte";
  import RoomShell from "../components/RoomShell.svelte";

  /* The Console's own scroll-revealed transport placeholder was removed in
     Task 0.6: the persistent mini transport is now rendered once by the shell
     and is visible in every room, so a second, page-scroll-dependent transport
     placeholder here would duplicate it and could not be shown at the same time
     as the shared strip without overlapping it. The Console's full vintage
     transport, status/time display and MIX button are scheduled as Task 2.3 in
     the product plan.

     Task 2.1 replaced the meter-bridge zone's gray placeholder with the
     skinned ConsoleMeterBridge (fixture data only, nothing wired). The zone
     keeps its data-console-zone hook and its accessible name — the bridge
     renders the <h2 id="console-meter-title"> as its engraved legend.

     Task 2.2 did the same for the channel-bank zone: the Phase 0 grey header
     and frame are gone and the ChannelBank is its own bridge-matching
     housing, rendering the <h2 id="console-channels-title"> as its engraved
     legend. The 20 regular track strips are skinned (TrackStrip, fixtures
     only); the pinned Bus / Returns strips stay Phase 0 placeholders until
     Task 2.4. Both zones keep their data-console-zone hooks and names.

     Task 2.3 restores the transport as a zone of its own — the Phase 0.2
     skeleton had one; 0.6 removed its scroll-revealed placeholder — as the
     ConsoleTransport deck between the bridge and the bank (owner, D2.3.1):
     the four transport keys, the lamp-lit time and status windows and the
     dominant MIX button, fixtures only. It renders the
     <h2 id="console-transport-title"> as its engraved legend. The shell's
     persistent mini transport (Task 0.6) is untouched and still the only
     transport outside this room. */
</script>

<RoomShell
  roomId="console"
  title="Console"
  purpose="Primary overview and automatic-mix workspace."
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
        class="console-zone console-zone--transport"
        data-console-zone="transport"
        aria-labelledby="console-transport-title"
      >
        <ConsoleTransport />
      </section>

      <section
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
      >
        <ChannelBank />
      </section>
    </div>
  </div>
</RoomShell>

<style>
  .console-room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  /* Task 2.1: the meter bridge row is sized by the bridge itself (its meters
     have fixed physical sizes and must not stretch with the window), and the
     channel bank takes the rest but never less than its own content. Both
     minimums are max-content rather than auto on purpose: with a definite
     layout height and no free space, an auto row collapses below its content
     and the two zones overlap. On a window too short for both, the layout
     scrolls vertically inside the room — never the page, and never sideways.
     Task 2.3: the transport deck is a second max-content row between them. */
  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content
      max-content
      minmax(max-content, 1fr);
    gap: 1rem;
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

  /* The skinned zones are their own housings: no placeholder frame round
     them (Task 2.1 the bridge, Task 2.2 the bank, Task 2.3 the transport). */
  .console-zone--meter,
  .console-zone--transport,
  .console-zone--channels {
    padding: 0;
    border: 0;
    background: none;
  }
</style>
