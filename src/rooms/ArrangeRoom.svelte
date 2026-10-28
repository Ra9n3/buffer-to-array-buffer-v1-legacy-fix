<script lang="ts">
  import ArrangeTimelineLane from "../components/ArrangeTimelineLane.svelte";
  import ArrangeTrackRow from "../components/ArrangeTrackRow.svelte";
  import RoomShell from "../components/RoomShell.svelte";
  import {
    ARRANGE_BARS,
    ARRANGE_BAR_COUNT,
    ARRANGE_RULER_LABEL_INTERVAL,
    ARRANGE_STRUCTURE_MARKERS,
    ARRANGE_TRACKS,
    type StructureMarkerPlaceholder,
  } from "../lib/arrange";

  function markerSpan(marker: StructureMarkerPlaceholder): string {
    return `span ${marker.barCount}`;
  }

  function isLabelledBar(bar: number): boolean {
    return (bar - 1) % ARRANGE_RULER_LABEL_INTERVAL === 0;
  }
</script>

<RoomShell
  roomId="arrange"
  title="Arrange"
  purpose="Import and organize the session."
  hideHeader
>
  <div class="arrange-room" data-arrange-room>
    <!-- One scroller drives both axes. The grid inside it holds the track-list
         column and the timeline in shared grid rows, so a track row and its
         lane are the same grid row and cannot drift apart. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="arrange-scroll"
      data-arrange-scroll
      role="region"
      tabindex="0"
      aria-label="Arrange track list and timeline, scrolls vertically and horizontally"
    >
      <div class="arrange-grid" data-arrange-grid>
        <div
          class="arrange-corner"
          data-arrange-region="track-list-header"
          aria-hidden="true"
        >
          <p class="arrange-corner__eyebrow">Track list</p>
          <p class="arrange-corner__columns">Track</p>
        </div>

        <div
          class="arrange-timeline-head"
          data-arrange-region="timeline-header"
        >
          <!-- Band order, top to bottom: bar ruler, tempo, structure markers.
               The ruler is the timeline's primary reference so it sits highest,
               and the structure markers sit nearest the lanes they describe. -->
          <div
            class="arrange-ruler"
            style:--arrange-bar-count={ARRANGE_BAR_COUNT}
            data-arrange-region="timeline-ruler"
            aria-hidden="true"
          >
            {#each ARRANGE_BARS as bar (bar)}
              <div
                class="arrange-ruler__bar"
                class:is-labelled={isLabelledBar(bar)}
              >
                {#if isLabelledBar(bar)}
                  <span class="arrange-ruler__label">{bar}</span>
                {/if}
              </div>
            {/each}
          </div>

          <div
            class="arrange-tempo"
            data-arrange-region="tempo-track"
            aria-label="Tempo track placeholder"
          >
            <span class="arrange-tempo__label">Tempo track</span>
            <span class="arrange-tempo__detail">
              Tempo timeline placeholder — reserved for Task 2.6
            </span>
          </div>

          <div
            class="arrange-structure"
            style:--arrange-bar-count={ARRANGE_BAR_COUNT}
            data-arrange-region="structure-markers"
            role="group"
            aria-label="Song structure markers, placeholder spans"
          >
            {#each ARRANGE_STRUCTURE_MARKERS as marker, index (index)}
              <div
                class="arrange-structure__marker"
                style:grid-column={markerSpan(marker)}
              >
                <span class="arrange-structure__label">{marker.label}</span>
              </div>
            {/each}
          </div>
        </div>

        {#each ARRANGE_TRACKS as track (track.code)}
          <ArrangeTrackRow
            code={track.code}
            name={track.name}
            laneId={`lane-${track.code}`}
          />
          <ArrangeTimelineLane code={track.code} laneId={`lane-${track.code}`} />
        {/each}
      </div>
    </div>

  </div>
</RoomShell>

<style>
  .arrange-room {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    /* Fill the room canvas exactly. The Arrange room header is visually hidden
       and the canvas is a single 1fr grid row, so the canvas already has a
       definite height tied to the viewport — no measured chrome constant is
       needed, and the workspace cannot fall short of the available space or
       push the page taller. min-height keeps it usable on very short viewports. */
    height: 100%;
    min-height: 22rem;
    /* Shared geometry. Both the track rows and the timeline lanes take their
       height from --arrange-row-height, and the timeline header spans exactly
       --arrange-timeline-width, so rows and lanes stay aligned by construction. */
    /* Row / lane height. Owner requirement: the lane must be tall enough to
       carry a stereo waveform and audio editing later, so it is sized for that
       future content rather than for the current single text label.
       5rem = 80px gives two 30px+ halves with margin between them.
       Single value — every track row and timeline lane inherits it, so
       alignment cannot be affected by changing it. */
    --arrange-row-height: 5rem;
    --arrange-track-list-width: clamp(10rem, 16vw, 15rem);
    --arrange-timeline-width: 2400px;
    /* Ruler and structure bands are compact reference strips (22px).
       The tempo band is taller because it holds a real timeline (tempo values
       over bars) rather than a single label row. */
    --arrange-band-height: 1.375rem;
    --arrange-tempo-height: 2.25rem;
  }

  .arrange-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 2px dashed #8a8a8a;
    background: #fbfbfb;
  }

  .arrange-grid {
    display: grid;
    grid-template-columns: var(--arrange-track-list-width) var(--arrange-timeline-width);
    grid-template-rows: auto;
    grid-auto-rows: var(--arrange-row-height);
    width: max-content;
    min-width: 100%;
  }

  .arrange-corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.125rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-right: 2px solid #8a8a8a;
    border-bottom: 2px solid #8a8a8a;
    background: #e4e4e4;
  }

  .arrange-corner__eyebrow {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .arrange-corner__columns {
    margin: 0;
    overflow: hidden;
    font-size: 0.6875rem;
    color: #454545;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrange-timeline-head {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-bottom: 2px solid #8a8a8a;
    background: #e4e4e4;
  }

  .arrange-structure,
  .arrange-ruler {
    display: grid;
    /* Column count comes from ARRANGE_BAR_COUNT so the structure markers, the
       ruler, and the timeline length share one source of truth. */
    grid-template-columns: repeat(var(--arrange-bar-count), minmax(0, 1fr));
    min-width: 0;
  }

  .arrange-structure {
    height: var(--arrange-band-height);
  }

  .arrange-structure__marker {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 0.25rem;
    border-right: 1px solid #b5b5b5;
    border-bottom: 1px solid #b5b5b5;
    overflow: hidden;
  }

  .arrange-structure__label {
    overflow: hidden;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrange-tempo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: var(--arrange-tempo-height);
    min-width: 0;
    padding: 0 0.5rem;
    border-bottom: 1px solid #b5b5b5;
    overflow: hidden;
  }

  .arrange-tempo__label {
    flex: 0 0 auto;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .arrange-tempo__detail {
    min-width: 0;
    overflow: hidden;
    font-size: 0.6875rem;
    color: #5d5d5d;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrange-ruler {
    height: var(--arrange-band-height);
    /* Separation between the time bar and the tempo track. Darker and heavier
       than the per-bar ticks so the two bands read as distinct rows. */
    border-bottom: 2px solid #6d6d6d;
  }

  .arrange-ruler__bar {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    padding-left: 0.25rem;
    border-left: 1px solid #cfcfcf;
    overflow: hidden;
  }

  .arrange-ruler__bar.is-labelled {
    border-left-color: #9a9a9a;
  }

  .arrange-ruler__label {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.625rem;
    color: #454545;
  }

  @media (max-width: 40rem) {
    .arrange-room {
      --arrange-track-list-width: 8.5rem;
      --arrange-row-height: 4.25rem;
    }


  }
</style>
