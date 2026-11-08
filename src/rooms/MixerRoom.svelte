<script lang="ts">
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import MixerChannelStrip from "../components/mixer/MixerChannelStrip.svelte";
  import MixerDetailPanel from "../components/MixerDetailPanel.svelte";
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { project } from "../lib/project/store.svelte";

  /**
   * ALLOY Mixer room — the approved two-column layout on current data.
   *
   * Left: the vertically scrolling channel column, one compact header per
   * channel (tracks, then Returns, then the bus master) sized from the shared
   * Arrange track-header geometry. Right: the selected channel's processing
   * detail. The column scrolls inside its own pane and the detail scrolls
   * inside its pane, so the room never grows and the page never scrolls.
   *
   * Selection is local UI state: an id into the shared project store, never a
   * copy of a channel. The column reports a choice; the panel receives the
   * entity every room edits.
   *
   * An empty project (owner D4.1.2) keeps the explicit empty state and its
   * accessible name, in place of the column and the detail.
   */
  let selectedId = $state<string>(project.channels[0]?.id ?? "");

  const selectedChannel = $derived(project.channel(selectedId));

  function selectChannel(id: string): void {
    selectedId = id;
  }
</script>

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
  hideHeader
>
  <div class="mixer-room" data-mixer-room data-selected-channel={selectedId}>
    <div class="mixer-layout" class:mixer-layout--empty={project.isEmpty} data-mixer-layout>
      {#if project.isEmpty}
        <section
          class="mixer-zone mixer-zone--channels"
          data-mixer-region="channel-column"
          aria-labelledby="mixer-channels-title"
        >
          <EmptyProjectNotice headingId="mixer-channels-title" room="mixer" />
        </section>
      {:else}
        <section
          class="mixer-channels"
          data-mixer-region="channel-column"
          aria-labelledby="mixer-channels-title"
        >
          <header class="mixer-channels__legend">
            <EngravedLabel as="h2" id="mixer-channels-title" text="Channels" size="sm" />
            <EngravedLabel text={`${project.channels.length} channels`} size="xs" tone="muted" />
          </header>

          <div
            class="mixer-channels__list"
            data-mixer-channel-list
            role="group"
            aria-label="Project channels"
          >
            <ol class="mixer-channels__rail">
              {#each project.channels as channel (channel.id)}
                <li class="mixer-channels__item">
                  <MixerChannelStrip
                    {channel}
                    selected={channel.id === selectedId}
                    onselect={selectChannel}
                  />
                </li>
              {/each}
            </ol>
          </div>
        </section>

        <div class="mixer-detail" data-mixer-region="detail">
          <MixerDetailPanel channel={selectedChannel} />
        </div>
      {/if}
    </div>
  </div>
</RoomShell>

<style>
  .mixer-room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .mixer-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: var(--track-column-width) minmax(0, 1fr);
    gap: var(--al-space-sm);
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .mixer-layout--empty {
    grid-template-columns: minmax(0, 1fr);
  }

  .mixer-zone {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .mixer-channels {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: 4px;
    background-color: var(--al-material-panel);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
  }

  .mixer-channels__legend {
    display: flex;
    flex: 0 0 auto;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-sm);
    border-bottom: 1px solid var(--al-separator);
  }

  .mixer-channels__list {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--al-space-2xs);
    overflow-y: auto;
    overscroll-behavior: contain;
    background-color: color-mix(in srgb, var(--al-material-recess) 55%, var(--al-material-panel));
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px var(--al-border-strong);
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .mixer-channels__rail,
  .mixer-channels__item {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mixer-channels__rail {
    display: flex;
    flex-direction: column;
  }

  .mixer-channels__item {
    flex: 0 0 auto;
  }

  .mixer-detail {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  @media (width < 48rem) {
    .mixer-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(8rem, 0.55fr) minmax(0, 1.45fr);
    }
  }
</style>
