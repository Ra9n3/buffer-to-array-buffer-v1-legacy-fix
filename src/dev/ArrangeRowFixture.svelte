<script lang="ts">
  import ArrangeTrackRow from "../components/ArrangeTrackRow.svelte";
  import { ARRANGE_TRACKS, SOURCE_TYPES, type ArrangeTrack, type SourceType } from "../lib/arrange";

  /**
   * Playground fixture for the Arrange track-list rows — Task 2.5.
   *
   * A short stack of rows exactly as the room lays them out — the list
   * column at a chosen width beside a blank Phase 0 lane, rows and lanes in
   * shared 5rem grid rows — so the row can be reviewed at the room's widths
   * and under stress (long names, a long source label, the compact row)
   * without resizing the window. Nothing here is project state: the tracks
   * are the room's fixtures or typed-in copies of them.
   *
   * `renameTo` adds a review-only RENAME control that swaps the first row's
   * display name (the name is a prop of the row) so the rule "renaming a
   * track leaves its source type alone, and choosing a source leaves a
   * customised name alone" can be exercised. It is not a product control.
   */
  export interface ArrangeRowFixtureConfig {
    readonly id: string;
    /** Rows to show; the room's first tracks when omitted. */
    readonly tracks?: readonly ArrangeTrack[];
    /** The list column's width; the room's clamp when omitted. */
    readonly width?: string;
    /** The shared row height; the room's 5rem when omitted. */
    readonly rowHeight?: string;
    /** The source catalog; the fixture catalog when omitted. */
    readonly sources?: readonly SourceType[];
    /** A second display name for the first row, behind a review-only RENAME control. */
    readonly renameTo?: string;
    readonly stateNote: string;
  }

  let { config }: { config: ArrangeRowFixtureConfig } = $props();

  let renamed = $state(false);
  const baseTracks = $derived(config.tracks ?? ARRANGE_TRACKS.slice(0, 4));
  const tracks = $derived(
    renamed && config.renameTo && baseTracks[0]
      ? [{ ...baseTracks[0], name: config.renameTo }, ...baseTracks.slice(1)]
      : baseTracks,
  );
  const sources = $derived(config.sources ?? SOURCE_TYPES);
</script>

<figure class="arrange-fixture" data-dev-arrange-fixture={config.id}>
  <div
    class="arrange-fixture__grid"
    style:--arrange-track-list-width={config.width ?? "clamp(12rem, 16vw, 15rem)"}
    style:--arrange-row-height={config.rowHeight ?? "5rem"}
    aria-label={config.stateNote}
  >
    {#each tracks as track (track.code)}
      <ArrangeTrackRow {track} laneId={`dev-lane-${track.code}`} {sources} />
      <div class="arrange-fixture__lane" aria-hidden="true"></div>
    {/each}
  </div>
  <figcaption class="arrange-fixture__caption">
    <span class="arrange-fixture__state">{config.stateNote}</span>
    {#if config.renameTo}
      <button type="button" class="arrange-fixture__rename" data-dev-rename aria-pressed={renamed} onclick={() => (renamed = !renamed)}>
        {renamed ? `Rename back to “${baseTracks[0]?.name}”` : `Rename to “${config.renameTo}”`}
      </button>
    {/if}
  </figcaption>
</figure>

<style>
  .arrange-fixture {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    margin: 0;
  }

  /* The room's grid: the list column and a lane column in shared rows, the
     Phase 0 frame and lane colour (ArrangeRoom.svelte) so the seam between
     the dark list and the light timeline is reviewed as it is in the room. */
  .arrange-fixture__grid {
    display: grid;
    grid-template-columns: var(--arrange-track-list-width) minmax(10rem, 24rem);
    grid-auto-rows: var(--arrange-row-height);
    width: max-content;
    max-width: 100%;
    border: 2px dashed #8a8a8a;
    background: #fbfbfb;
  }

  .arrange-fixture__lane {
    border-bottom: 1px solid #d0d0d0;
    background: #fbfbfb;
  }

  .arrange-fixture__caption {
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .arrange-fixture__state {
    font-weight: var(--al-font-weight-semibold);
  }

  /* the review-only control: plain page chrome, deliberately not hardware */
  .arrange-fixture__rename {
    margin-left: var(--al-space-xs);
    padding: 1px var(--al-space-xs);
    border: 1px solid #8a8a8a;
    border-radius: 2px;
    background: #f4f4f4;
    color: #3f3f3f;
    font: inherit;
    font-size: var(--al-text-size-sm);
    cursor: pointer;
  }
</style>
