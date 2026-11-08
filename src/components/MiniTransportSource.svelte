<script lang="ts">
  /**
   * The listening-source selector — Task 9.1.1, owner decision D9.1.2 option (a).
   *
   * Plan §6 defines three listening modes: the raw stems, the lightweight live preview,
   * and the full rendered mix. Until now the transport implemented all three but the only
   * ways to reach them were the default (RAW) and MIX (which switches to RENDER) — PREVIEW
   * had no control at all, and once MIX had switched the transport to RENDER there was no
   * way back to RAW. That broke plan §10's requirement to keep raw and processed playback
   * available for comparison.
   *
   * This is one small, visible three-position control. It is NOT a keyboard shortcut, NOT a
   * key column, and it touches none of the approved transport keys: PREVIOUS · PLAY · STOP ·
   * NEXT and MIX keep exactly their existing functions (D2.3.2 / D8.1.1). It lives in the
   * persistent mini transport, which is the one strip that is visible in all three rooms, so
   * the source can be read and changed from Console, Arrange and Mixer alike.
   *
   * The active mode is identified three ways, so it is never ambiguous: the pressed button
   * is drawn as engaged, `aria-pressed` carries it to assistive technology, and the transport
   * status readout beside it prints `Stopped — RAW / PREVIEW / RENDER`.
   *
   * Selecting a mode calls the shared facade's `setSource`. The controller keeps the playhead
   * position and the playable length across a switch (Task 9.1, S9.1.2), and restarts at the
   * same position if it was playing.
   */
  import { transport } from "../lib/playback/store.svelte";
  import type { ListeningSource } from "../lib/playback/types";
  import ToolbarKey from "./hardware/ToolbarKey.svelte";

  /** Plan §6's three modes in the order of the listening journey: raw, preview, render. */
  const SOURCES: readonly ListeningSource[] = ["raw", "preview", "render"];

  /** Printed on the button, and the accessible name: the plan's own words. */
  const SOURCE_NAMES: Record<ListeningSource, string> = {
    raw: "Raw",
    preview: "Preview",
    render: "Render",
  };

  /** What each mode means, for the button's title and its description for screen readers. */
  const SOURCE_HINTS: Record<ListeningSource, string> = {
    raw: "the imported stems as they are",
    preview: "the lightweight live preview of the mix",
    render: "the full rendered mix",
  };

  const active = $derived(transport.source);

  function select(source: ListeningSource): void {
    transport.setSource(source);
  }
</script>

<div
  class="mini-transport__sources"
  role="group"
  aria-label="Listening source"
  data-transport-sources
>

  <div class="mini-transport__sources-list">
    {#each SOURCES as source (source)}
      <ToolbarKey
        label={SOURCE_NAMES[source]}
        name={`${SOURCE_NAMES[source]} — ${SOURCE_HINTS[source]}`}
        hook={`source-${source}`}
        size="m"
        active={active === source}
        title={`Listen to ${SOURCE_HINTS[source]}`}
        onpress={() => select(source)}
      />
    {/each}
</div>
</div>

<style>
  /* The three positions are three ToolbarKeys — the approved cream caps — so
     they are the same material as the transport keys beside them (Task 9.3, the
     owner's review). The current one has its cap painted dark. */
  .mini-transport__sources {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-width: 0;
    padding: 0.125rem 0;
  }

  .mini-transport__sources-list {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.1875rem;
    min-width: 0;
    padding-left: 0.625rem;
    margin-left: 0.25rem;
    border-left: 2px solid var(--al-bevel-shadow);
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 48rem) {
    .mini-transport__sources-list {
      padding-left: 0.375rem;
      gap: 0.125rem;
    }
  }
</style>
