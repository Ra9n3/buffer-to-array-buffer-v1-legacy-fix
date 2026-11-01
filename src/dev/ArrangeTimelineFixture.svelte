<script lang="ts">
  /**
   * Playground harness for the Arrange timeline (Task 2.6).
   *
   * A short cut of the Arrange workspace exactly as the room builds it — the
   * one scroller, the shared grid, the corner's place, the timeline head
   * (ruler · tempo · structure) and a few row / lane pairs — at a chosen
   * width, so the ruler marks, the clips' edges on the bar lines, the mono
   * and stereo drawings, the tempo flags and the sticky head can be reviewed
   * side by side and scrolled without resizing the window. Nothing here is
   * project state: the tracks and clips are the room's fixtures.
   */
  import ArrangeTimelineHeader from "../components/ArrangeTimelineHeader.svelte";
  import ArrangeTimelineLane from "../components/ArrangeTimelineLane.svelte";
  import ArrangeTrackRow from "../components/ArrangeTrackRow.svelte";
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import { ARRANGE_BAR_COUNT, ARRANGE_TRACKS, type ArrangeTrack } from "../lib/arrange";
  import { clipsOf, type ArrangeClip } from "../lib/arrange-timeline";

  export interface ArrangeTimelineFixtureConfig {
    readonly id: string;
    /** The whole workspace's width (list column + visible timeline). */
    readonly width: string;
    /** The list column, as the room sets it. */
    readonly listWidth?: string;
    /** Row / lane height; the room's 5rem when omitted. */
    readonly rowHeight?: string;
    readonly tracks?: readonly ArrangeTrack[];
    /** Clips per track code; the fixture clips when omitted. */
    readonly clips?: Readonly<Record<string, readonly ArrangeClip[]>>;
    /** Where the scroller starts, in bars (0 = bar 1). */
    readonly scrollToBar?: number;
    readonly stateNote: string;
  }

  let { config }: { config: ArrangeTimelineFixtureConfig } = $props();

  const tracks = $derived(config.tracks ?? ARRANGE_TRACKS.slice(0, 4));
  const clipsFor = (code: string): readonly ArrangeClip[] => config.clips?.[code] ?? clipsOf(code);

  /** The room's scroller, set to the configured bar once it exists (review convenience only). */
  function scrollTo(node: HTMLElement, bar: number | undefined) {
    if (bar) node.scrollLeft = bar * parseFloat(getComputedStyle(node).getPropertyValue("--arrange-bar-width")) * 16;
  }
</script>

<figure class="timeline-fixture" data-dev-arrange-timeline={config.id}>
  <div
    class="timeline-fixture__room"
    style:--arrange-bar-count={ARRANGE_BAR_COUNT}
    style:--arrange-track-list-width={config.listWidth ?? "clamp(12rem, 16vw, 15rem)"}
    style:--arrange-row-height={config.rowHeight ?? "5rem"}
    style:width={config.width}
    use:scrollTo={config.scrollToBar}
  >
    <div class="timeline-fixture__grid">
      <div class="timeline-fixture__corner" aria-hidden="true">
        <EngravedLabel text="Track list" size="sm" as="p" />
      </div>
      <ArrangeTimelineHeader />
      {#each tracks as track (track.code)}
        <ArrangeTrackRow {track} laneId={`dev-tl-${config.id}-${track.code}`} />
        <ArrangeTimelineLane code={track.code} laneId={`dev-tl-${config.id}-${track.code}`} name={track.name} org={track.org} clips={clipsFor(track.code)} />
      {/each}
    </div>
  </div>
  <figcaption class="timeline-fixture__caption">
    <span class="timeline-fixture__state">{config.stateNote}</span>
  </figcaption>
</figure>

<style>
  /* the room's workspace recipe (ArrangeRoom.svelte), cut to a height that
     shows the head and the rows; the playground's own scroller — the room's
     is the product's */
  .timeline-fixture {
    margin: 0;
  }

  .timeline-fixture__room {
    box-sizing: border-box;
    max-width: 100%;
    max-height: 26rem;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--al-bevel-shadow);
    background-color: var(--al-material-surface);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
    color-scheme: dark;
    --arrange-bar-width: 2.75rem;
    --arrange-timeline-width: calc(var(--arrange-bar-count) * var(--arrange-bar-width));
    --arrange-band-height: 1.375rem;
    --arrange-tempo-height: 2.25rem;
  }

  .timeline-fixture__grid {
    display: grid;
    grid-template-columns: var(--arrange-track-list-width) var(--arrange-timeline-width);
    grid-template-rows: auto;
    grid-auto-rows: var(--arrange-row-height);
    width: max-content;
    min-width: 100%;
  }

  .timeline-fixture__corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 4;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0.375rem 0.5rem;
    border-bottom: 2px solid rgba(0, 0, 0, 0.62);
    background-color: var(--al-material-panel);
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset -1px 0 0 rgba(0, 0, 0, 0.62);
  }

  .timeline-fixture__caption {
    margin-top: 0.375rem;
    font-size: var(--al-text-size-sm);
    line-height: 1.4;
    color: #3f3f3f;
  }

  .timeline-fixture__state {
    font-weight: var(--al-font-weight-semibold);
  }
</style>
