<script lang="ts">
  import MixerChannelStrip from "../components/MixerChannelStrip.svelte";
  import MixerDetailPanel from "../components/MixerDetailPanel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import {
    DEFAULT_MIXER_SELECTION,
    MIXER_CHANNELS,
    MIXER_TRACK_COUNT,
    findChannel,
  } from "../lib/mixer";

  /* Selection is local UI state for Phase 0: per-room $state, no store, no
     persistence, no cross-room synchronisation. */
  let selectedId = $state(DEFAULT_MIXER_SELECTION);

  const selectedChannel = $derived(findChannel(selectedId));

  const trackChannels = $derived(
    MIXER_CHANNELS.filter((channel) => channel.kind === "track"),
  );
  const sharedChannels = $derived(
    MIXER_CHANNELS.filter((channel) => channel.kind !== "track"),
  );

  function selectChannel(id: string): void {
    selectedId = id;
  }
</script>

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
>
  <div class="mixer-room" data-mixer-room>
    <!-- Left: the channel column. Internally scrollable so a long session cannot
         push the room taller than the viewport. -->
    <div class="mixer-column" data-mixer-region="channel-column">
      <div class="mixer-column__head">
        <h2 class="mixer-column__title">Channels</h2>
        <p class="mixer-column__detail">
          {MIXER_TRACK_COUNT} track placeholders, then the Return and bus-master
          channels.
        </p>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="mixer-column__scroll"
        data-mixer-column-scroll
        role="region"
        tabindex="0"
        aria-label="Channel selection column, scrolls vertically"
      >
        <ol class="mixer-column__list" aria-label="Track channels">
          {#each trackChannels as channel (channel.id)}
            <MixerChannelStrip
              {channel}
              selected={channel.id === selectedId}
              onselect={selectChannel}
            />
          {/each}
        </ol>

        <p class="mixer-column__group">Bus / Returns</p>
        <ol class="mixer-column__list" aria-label="Bus and Return channels">
          {#each sharedChannels as channel (channel.id)}
            <MixerChannelStrip
              {channel}
              selected={channel.id === selectedId}
              onselect={selectChannel}
            />
          {/each}
        </ol>
      </div>
    </div>

    <!-- Right: the selected channel's processing detail. -->
    <div class="mixer-detail-host">
      <MixerDetailPanel channel={selectedChannel} />
    </div>
  </div>
</RoomShell>

<style>
  .mixer-room {
    display: grid;
    grid-template-columns: var(--track-column-width) minmax(0, 1fr);
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .mixer-column {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    min-height: 0;
    /* Drawn as an outline rather than a border so the frame costs no layout
       width: the strips inside then measure exactly --track-column-width, the
       same width as an Arrange track header. A 2px border would make every
       Mixer header 4px narrower than its Arrange counterpart. */
    outline: 2px dashed #8a8a8a;
    outline-offset: -2px;
    background: #f1f1f1;
  }

  .mixer-column__head {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid #cfcfcf;
    background: #e4e4e4;
  }

  .mixer-column__title {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .mixer-column__detail {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.25;
    color: #454545;
  }

  .mixer-column__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .mixer-column__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mixer-column__group {
    margin: 0;
    padding: 0.3125rem 0.5rem 0.1875rem;
    border-top: 2px dashed #8a8a8a;
    border-bottom: 1px solid #d0d0d0;
    background: #e4e4e4;
    color: #5d5d5d;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .mixer-detail-host {
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  @media (max-width: 40rem) {
    .mixer-room {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(8rem, 0.8fr) minmax(0, 1.2fr);
    }
  }
</style>
