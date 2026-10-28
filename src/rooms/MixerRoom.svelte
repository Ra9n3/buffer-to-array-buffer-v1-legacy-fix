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

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
>
  <div class="mixer-room" data-mixer-room>
    <!-- Selected Channel & Processing Chain on top, channel bank below.
         The channel bank is the same component the Console tab uses. -->
    <div class="mixer-room__detail" data-mixer-region="detail-panel">
      <ChannelDetailPanel channel={selected} />
    </div>

    <section
      class="mixer-room__bank"
      data-mixer-region="channel-bank"
      aria-labelledby="mixer-bank-title"
    >
      <h2 class="mixer-room__bank-title" id="mixer-bank-title">
        Channel bank
        <span class="mixer-room__bank-note"
          >Select a channel to inspect its processing</span
        >
      </h2>
      <div class="mixer-room__bank-body">
        <ChannelBank {selectedId} onselect={(id) => (selectedId = id)} />
      </div>
    </section>
  </div>
</RoomShell>

<style>
  .mixer-room {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(9rem, 0.42fr);
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .mixer-room__detail {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.375rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  .mixer-room__bank {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 2px dashed #8a8a8a;
    background: #f1f1f1;
  }

  .mixer-room__bank-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.5rem;
    row-gap: 0;
    margin: 0;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid #b5b5b5;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .mixer-room__bank-note {
    font-size: 0.6875rem;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: #5d5d5d;
  }

  .mixer-room__bank-body {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0.25rem;
  }
</style>
