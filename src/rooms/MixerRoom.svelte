<script lang="ts">
  import EmptyProjectNotice from "../components/EmptyProjectNotice.svelte";
  import MixerDetailPanel from "../components/MixerDetailPanel.svelte";
  import MixerBank from "../components/mixer/MixerBank.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import { project } from "../lib/project/store.svelte";

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
   * Selection is local UI state: per-room $state, no persistence, not part
   * of the project (Task 3.1 keeps transient UI state out of the project
   * store). It is an id into the shared store; the selected channel is
   * looked up there, so the panel shows the one entity every room edits.
   * The bank reports a SEL press; the detail panel receives the channel.
   *
   * Task 4.1: an empty project (no channels at all, owner D4.1.2) shows the
   * explicit empty state in place of the bank and the detail panel — there
   * is nothing to select and nothing to inspect. The zone keeps its hook
   * and its accessible name (the notice renders the <h2 id="mixer-channels-title">).
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
>
  <div class="mixer-room" data-mixer-room data-selected-channel={selectedId}>
    <div class="mixer-layout" data-mixer-layout>
      {#if project.isEmpty}
        <section
          class="mixer-zone mixer-zone--channels"
          data-mixer-region="channel-bank"
          aria-labelledby="mixer-channels-title"
        >
          <EmptyProjectNotice headingId="mixer-channels-title" room="mixer" />
        </section>
      {:else}
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
      {/if}
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
