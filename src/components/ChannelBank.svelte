<script lang="ts">
  import ChannelStrip from "./ChannelStrip.svelte";
  import {
    createTrackChannels,
    PINNED_CHANNELS,
    PLACEHOLDER_TRACK_COUNT,
  } from "../lib/channels";

  let {
    trackCount = PLACEHOLDER_TRACK_COUNT,
    selectedId = "",
    onselect,
  }: {
    trackCount?: number;
    selectedId?: string;
    onselect?: (id: string) => void;
  } = $props();

  const tracks = $derived(createTrackChannels(trackCount));
</script>

<!-- The channel bank, shared by the Console and Mixer rooms so both tabs show
     the same channels. Horizontally scrollable, with the Return buses and bus
     master pinned at the right end (product plan 8a). -->
<div class="channel-bank" data-channel-bank>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="channel-bank__tracks"
    data-channel-bank-tracks
    role="region"
    tabindex="0"
    aria-label="Track channel strips, horizontally scrollable"
  >
    <ol class="channel-bank__track-row" aria-label="Tracks">
      {#each tracks as channel (channel.id)}
        <ChannelStrip
          {channel}
          selected={channel.id === selectedId}
          {onselect}
        />
      {/each}
    </ol>
  </div>

  <aside
    class="channel-bank__pinned"
    data-channel-bank-pinned
    aria-label="Pinned bus and Return channels"
  >
    <p class="channel-bank__pinned-title">Pinned bus / Returns</p>
    <ul class="channel-bank__pinned-row">
      {#each PINNED_CHANNELS as channel (channel.id)}
        <ChannelStrip
          {channel}
          selected={channel.id === selectedId}
          {onselect}
        />
      {/each}
    </ul>
  </aside>
</div>

<style>
  .channel-bank {
    --visible-track-count: 11;
    --track-gap: 0.25rem;
    --track-row-padding: 0.25rem;
    display: flex;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .channel-bank__tracks {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-behavior: smooth;
    background: #f1f1f1;
  }

  .channel-bank__track-row,
  .channel-bank__pinned-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
  }

  .channel-bank__track-row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc(
      (100% - (var(--visible-track-count) - 1) * var(--track-gap)) /
        var(--visible-track-count)
    );
    gap: var(--track-gap);
    width: 100%;
    min-width: 100%;
    height: 100%;
    padding: var(--track-row-padding);
  }

  .channel-bank__pinned {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
    padding-left: 0.5rem;
    border-left: 2px dashed #8a8a8a;
  }

  .channel-bank__pinned-title {
    margin: 0;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .channel-bank__pinned-row {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
  }

  .channel-bank__pinned-row > :global(.channel-strip-item) {
    flex: 0 0 6rem;
  }

  @media (max-width: 40rem) {
    .channel-bank {
      flex-direction: column;
    }

    .channel-bank__tracks {
      flex: 1 1 18rem;
    }

    .channel-bank__pinned {
      flex: 0 0 auto;
      padding-top: 0.375rem;
      padding-left: 0;
      border-top: 2px dashed #8a8a8a;
      border-left: 0;
    }

    .channel-bank__pinned-row {
      flex: 0 0 auto;
      overflow-x: auto;
      overscroll-behavior-x: contain;
    }
  }
</style>
