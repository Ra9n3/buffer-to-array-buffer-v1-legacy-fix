<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
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
     renders the <h2 id="console-meter-title"> as its engraved legend. The
     channel-bank zone below is untouched: it stays the Phase 0 placeholder
     until Task 2.2. */
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
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
      >
        <header class="console-zone__header">
          <p class="console-zone__eyebrow">Zone 02</p>
          <h2 class="console-zone__title" id="console-channels-title">
            Channel bank
          </h2>
          <p class="console-zone__detail">
            20 track placeholders; the first 11 fit, the rest scroll. Return
            and bus-master channels stay pinned right.
          </p>
        </header>
        <div class="console-bank">
          <ChannelBank />
        </div>
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
     scrolls vertically inside the room — never the page, and never sideways. */
  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
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
    padding: 0.75rem;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  /* The skinned bridge is its own housing: no placeholder frame round it. */
  .console-zone--meter {
    padding: 0;
    border: 0;
    background: none;
  }

  .console-zone__header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.75rem;
    row-gap: 0.125rem;
    min-width: 0;
  }

  .console-zone__eyebrow {
    flex: 0 0 auto;
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .console-zone__title {
    flex: 0 0 auto;
    margin: 0;
    font-size: 1.0625rem;
    line-height: 1.2;
  }

  .console-zone__detail {
    flex: 1 1 18rem;
    min-width: 0;
    margin: 0;
    color: #454545;
    overflow-wrap: break-word;
  }

  .console-bank {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
  }

  @media (max-width: 40rem) {
    .console-zone__detail {
      flex-basis: 100%;
    }
  }
</style>
