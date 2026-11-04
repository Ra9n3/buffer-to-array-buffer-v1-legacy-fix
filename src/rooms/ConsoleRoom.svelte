<script lang="ts">
  import ChannelBank from "../components/ChannelBank.svelte";
  import ConsoleTransport from "../components/console-transport/ConsoleTransport.svelte";
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import ConsoleMeterBridge from "../components/meter-bridge/ConsoleMeterBridge.svelte";
  import MixerDetailPanel from "../components/MixerDetailPanel.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { project } from "../lib/project/store.svelte";

  /**
   * ALLOY Console room — the approved one-screen arrangement, on the current
   * shared session and components.
   *
   * The Console keeps the newer integrations the approved layout did not have
   * (the meter bridge and the live transport deck) and restores the approved
   * stacked workspace beneath them: the selected channel's processing detail
   * over the channel bank. All four zones share one bounded viewport: the two
   * fixed-height hardware decks keep their size, while the detail and the bank
   * each scroll inside their own pane. The page never scrolls.
   *
   * Selection is local UI state, an id into the one project store. Clicking or
   * focusing any channel in the bank selects it; the detail panel receives the
   * same entity the Mixer edits.
   */
  let selectedId = $state<string>(project.channels[0]?.id ?? "");
  const selectedChannel = $derived(project.channel(selectedId));

  function selectFromBank(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const strip = target.closest<HTMLElement>("[data-track-strip], [data-pinned-strip]");
    if (!strip) return;
    const code = strip.dataset.trackStrip ?? strip.dataset.pinnedStrip;
    const channel = project.channels.find((entry) => entry.code === code);
    if (channel) selectedId = channel.id;
  }
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
        <ConsoleTransport live />
      </section>

      <section
        class="console-zone console-zone--detail"
        data-console-zone="channel-detail"
        aria-labelledby="mixer-detail-title"
      >
        <MixerDetailPanel channel={selectedChannel} />
      </section>

      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <section
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
        onclick={selectFromBank}
        onfocusin={selectFromBank}
      >
        {#if project.isEmpty}
          <EmptyProjectNotice headingId="console-channels-title" room="console" />
        {:else}
          <ChannelBank />
        {/if}
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

  /* The bridge and the transport keep their content height (their meters,
     keys and windows must not stretch); the detail and the bank share the
     rest and scroll inside their own panes. Nothing scrolls the room or the
     page. */
  .console-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content
      max-content
      minmax(0, 0.95fr)
      minmax(0, 1.05fr);
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .console-zone {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
  }

  .console-zone--detail,
  .console-zone--channels {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  /* The skinned zones are their own housings: no placeholder frame round
     them (the bridge, the transport, the detail panel and the bank). */
  .console-zone--meter,
  .console-zone--transport,
  .console-zone--detail,
  .console-zone--channels {
    padding: 0;
    border: 0;
    background: none;
  }
</style>
