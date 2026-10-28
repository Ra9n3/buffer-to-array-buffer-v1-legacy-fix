<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import RoomShell from "../components/RoomShell.svelte";

  /* The Console's own scroll-revealed transport placeholder was removed in
     Task 0.6: the persistent mini transport is now rendered once by the shell
     and is visible in every room, so a second, page-scroll-dependent transport
     placeholder here would duplicate it and could not be shown at the same time
     as the shared strip without overlapping it. The Console's full vintage
     transport, status/time display and MIX button are scheduled as Task 2.3 in
     the product plan. */
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
        <header class="console-zone__header">
          <p class="console-zone__eyebrow">Zone 01</p>
          <h2 class="console-zone__title" id="console-meter-title">Meter bridge</h2>
          <p class="console-zone__detail">
            Master and channel meters, spectrum, stereo correlation, and status
            information.
          </p>
        </header>
        <div class="console-zone__body" aria-hidden="true">
          <span>Meter bridge placeholder</span>
        </div>
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

  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      minmax(7rem, 0.9fr)
      minmax(16rem, 2.4fr);
    gap: 1rem;
    min-width: 0;
    min-height: 0;
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

  .console-zone__body {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-width: 0;
    min-height: 2rem;
    padding: 0.25rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
    color: #5d5d5d;
    font-size: 0.8125rem;
    text-align: center;
  }

  .console-zone__body span {
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
    .console-layout {
      grid-template-rows:
        minmax(7rem, auto)
        minmax(16rem, auto);
    }

    .console-zone__detail {
      flex-basis: 100%;
    }
  }
</style>
