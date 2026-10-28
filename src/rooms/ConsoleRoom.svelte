<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import ChannelDetailPanel from "../components/ChannelDetailPanel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import {
    ALL_CHANNELS,
    DEFAULT_CHANNEL_SELECTION,
  } from "../lib/channels";

  // Local UI state only — no shared project state, no cross-room sync.
  let selectedId = $state<string>(DEFAULT_CHANNEL_SELECTION);

  const selected = $derived(ALL_CHANNELS.find((c) => c.id === selectedId));
</script>

<!-- Console is exactly two zones, stacked, sized to fill the viewport so the
     user never has to scroll: Selected Channel & Processing Chain on top, the
     channel bank below.

     The meter bridge and the scroll-revealed transport placeholder that lived
     here in Task 0.2 have been removed at the owner's request. The transport
     returns as the shared persistent mini transport in Task 0.6. -->
<RoomShell
  roomId="console"
  title="Console"
  purpose="Primary overview and automatic-mix workspace."
>
  <div class="console-room" data-console-room>
    <section
      class="console-zone console-zone--detail"
      data-console-zone="channel-detail"
      aria-labelledby="console-detail-title"
    >
      <header class="console-zone__header">
        <p class="console-zone__eyebrow">Zone 01</p>
        <h2 class="console-zone__title" id="console-detail-title">
          Selected channel &amp; processing chain
        </h2>
      </header>
      <div class="console-detail">
        <ChannelDetailPanel channel={selected} />
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
          20 track placeholders; the first 11 fit, the rest scroll. Return and
          bus-master channels stay pinned right.
        </p>
      </header>
      <div class="console-bank">
        <ChannelBank {selectedId} onselect={(id) => (selectedId = id)} />
      </div>
    </section>
  </div>
</RoomShell>

<style>
  .console-room {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    /* Detail takes the free space; the bank gets a fixed, legible height. */
    grid-template-rows: minmax(0, 1fr) minmax(15.5rem, 0.64fr);
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .console-zone {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    min-width: 0;
    min-height: 0;
    padding: 0.3125rem 0.5rem;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  .console-zone__header {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.5rem;
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
    font-size: 1rem;
    line-height: 1.2;
  }

  .console-zone__detail {
    flex: 1 1 16rem;
    line-height: 1.25;
    min-width: 0;
    margin: 0;
    color: #454545;
    font-size: 0.75rem;
    overflow-wrap: break-word;
  }

  .console-detail {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.25rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
  }

  .console-bank {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0.25rem;
    border: 1px dashed #a3a3a3;
    background: #e8e8e8;
  }
</style>
