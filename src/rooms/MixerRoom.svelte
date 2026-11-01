<script lang="ts">
  import MixerDetailPanel from "../components/MixerDetailPanel.svelte";
  import MixerBank from "../components/mixer/MixerBank.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { DEFAULT_MIXER_SELECTION, findChannel } from "../lib/mixer";

  /**
   * ALLOY Mixer room — Task 0.5 (placeholder), Task 2.7 (channel strips).
   *
   * Two zones, stacked (owner, D2.7.1): the strip bank on top — the shared
   * session's twenty track channels, scrolling sideways, with the Returns
   * and the bus master pinned at the right — and the selected channel's
   * processing detail (the Task 0.5 panel, untouched; its per-type chain is
   * Task 2.9) full width beneath it. The layout scrolls vertically inside
   * the bounded room when a window is too short for both (the Console's
   * `.console-layout` rule); the page never scrolls and nothing scrolls
   * sideways but the tracks' rail.
   *
   * Selection is local UI state: per-room $state, no store, no persistence,
   * no cross-room synchronisation (a shared project model is a later task).
   * The bank reports a SEL press; the detail panel receives the channel.
   */
  let selectedId = $state(DEFAULT_MIXER_SELECTION);

  const selectedChannel = $derived(findChannel(selectedId));

  function selectChannel(id: string): void {
    selectedId = id;
  }
</script>

<RoomShell
  roomId="mixer"
  title="Mixer"
  purpose="Inspect and edit processing in detail."
>
  <div class="mixer-room" data-mixer-room data-selected-channel={selectedId}>
    <div class="mixer-layout" data-mixer-layout>
      <!-- Top: the channel strips — the desk. -->
      <section
        class="mixer-zone mixer-zone--channels"
        data-mixer-region="channel-bank"
        aria-labelledby="mixer-channels-title"
      >
        <MixerBank {selectedId} onselect={selectChannel} />
      </section>

      <!-- Below: the selected channel's processing detail (Task 0.5 panel). -->
      <div class="mixer-detail-host" data-mixer-region="detail">
        <MixerDetailPanel channel={selectedChannel} />
      </div>
    </div>
  </div>
</RoomShell>

<style>
  .mixer-room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  /* The bank row is sized by the bank (fixed-size modules that must not
     stretch or shrink with the window); the detail takes the rest but never
     less than a useful panel. Both minimums are max-content / a floor rather
     than auto on purpose (the Console's lesson): with a definite height and
     no free space an auto row collapses below its content. On a window too
     short for both, the layout scrolls vertically inside the room — never
     the page, and never sideways. */
  .mixer-layout {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      max-content
      minmax(24rem, 1fr);
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .mixer-zone {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .mixer-detail-host {
    display: flex;
    min-width: 0;
    min-height: 0;
  }
</style>
