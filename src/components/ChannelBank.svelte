<script lang="ts">
  import ChannelStrip from "./ChannelStrip.svelte";

  const tracks = Array.from({ length: 20 }, (_, index) => {
    const code = String(index + 1).padStart(2, "0");
    return { code, name: `Track ${code}` };
  });

  const pinnedStrips: Array<{
    code: string;
    name: string;
    kind: "bus" | "return";
  }> = [
    { code: "R1", name: "Reverb Return", kind: "return" },
    { code: "R2", name: "Delay Return", kind: "return" },
    { code: "BUS", name: "Bus master", kind: "bus" },
  ];
</script>

<div class="channel-bank" data-channel-bank>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="channel-bank__tracks"
    data-channel-bank-tracks
    role="region"
    tabindex="0"
    aria-label="Track channel strips, 20 placeholders, horizontally scrollable"
  >
    <ol class="channel-bank__track-row" aria-label="Tracks 01 through 20">
      {#each tracks as track}
        <ChannelStrip code={track.code} name={track.name} kind="track" />
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
      {#each pinnedStrips as strip}
        <ChannelStrip
          code={strip.code}
          name={strip.name}
          kind={strip.kind}
          pinned
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
