<script lang="ts">
  /**
   * ALLOY Arrange timeline header — Task 0.4 structure, Task 2.6 skin.
   *
   * The three bands pinned above the lanes, in the owner's Task 0.4 order:
   *
   *   1  THE BAR RULER — musical time printed on the panel the way a console
   *      prints a scale (the fader's convention, Task 1.3): bar lines as the
   *      major marks, beat ticks as the minor ones, finer and fainter; every
   *      fourth bar carries its number as an engraved value print. One
   *      `--arrange-bar-width` places every mark, so the ruler's lines, the
   *      lanes' grid and the clips' edges are the same lines.
   *   2  THE TEMPO TRACK — a track like the lanes below (the same work
   *      surface and bar grid) carrying the fixture's tempo markers: at each
   *      marker a cream flag line down the band and the value in print
   *      ("120 BPM"; the first also prints the session's time signature once),
   *      and a step trace that holds each tempo across to the next marker, so
   *      a change reads as a step against the ruler.
   *   3  THE STRUCTURE MARKERS — the song's sections (plan: Intro, Verse,
   *      Pre-Chorus, Chorus, Bridge, Solo, Outro) as engraved labels at their
   *      first bar, with a mark where each begins.
   *
   * Fixture values only (lib/arrange.ts, lib/arrange-timeline.ts): no tempo
   * is detected, analysed or edited here. The header is sticky at the top of
   * the room's one scroller; the corner (the list head) is the room's.
   */
  import EngravedLabel from "./hardware/EngravedLabel.svelte";
  import {
    ARRANGE_BAR_COUNT,
    ARRANGE_RULER_LABELS,
    ARRANGE_STRUCTURE_MARKERS,
    type StructureMarkerPlaceholder,
  } from "../lib/arrange";
  import {
    ARRANGE_SECTIONS,
    ARRANGE_TEMPO_MARKERS,
    BEATS_PER_BAR,
    tempoTracePath,
    type TempoMarker,
  } from "../lib/arrange-timeline";

  let {
    barCount = ARRANGE_BAR_COUNT,
    tempoMarkers = ARRANGE_TEMPO_MARKERS,
  }: {
    barCount?: number;
    tempoMarkers?: readonly TempoMarker[];
  } = $props();

  const trace = $derived(tempoTracePath(tempoMarkers, barCount));

  function markerSpan(marker: StructureMarkerPlaceholder): string {
    return `span ${marker.barCount}`;
  }

  function tempoTitle(marker: TempoMarker): string {
    return `Tempo ${marker.bpm} BPM from bar ${marker.bar}${marker.signature ? ` · ${marker.signature}` : ""}`;
  }
</script>

<div
  class="timeline-head"
  style:--arrange-bar-count={barCount}
  style:--arrange-beats-per-bar={BEATS_PER_BAR}
  data-arrange-region="timeline-header"
>
  <!-- 1 · bar ruler: the marks are three background layers from the one bar
       width (bar lines, four-bar lines, beat ticks); the numerals are print -->
  <div class="ruler" data-arrange-region="timeline-ruler" aria-hidden="true">
    {#each ARRANGE_RULER_LABELS as mark (mark.bar)}
      <span class="ruler__numeral" style:--bar={mark.bar - 1} data-ruler-bar={mark.bar}>
        <EngravedLabel text={mark.label} size="xs" kind="value" tone="muted" />
      </span>
    {/each}
  </div>

  <!-- 2 · tempo track -->
  <div
    class="tempo"
    data-arrange-region="tempo-track"
    role="group"
    aria-label="Tempo track, fixture markers"
  >
    <svg class="tempo__trace" viewBox={`0 0 ${barCount} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="tempo__trace-path" d={trace} vector-effect="non-scaling-stroke" />
    </svg>
    {#each tempoMarkers as marker (marker.bar)}
      <div
        class="tempo__marker"
        style:--bar={marker.bar - 1}
        data-tempo-marker={marker.bar}
        data-tempo-bpm={marker.bpm}
        title={tempoTitle(marker)}
      >
        <span class="tempo__flag" aria-hidden="true"></span>
        <span class="tempo__print">
          <EngravedLabel text={`${marker.bpm} BPM`} size="xs" kind="value" tone="normal" />
          {#if marker.signature}
            <EngravedLabel text={marker.signature} size="xs" kind="value" tone="muted" />
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <!-- 3 · structure markers: the Task 0.4 bar grid, one span per section -->
  <div
    class="structure"
    data-arrange-region="structure-markers"
    role="group"
    aria-label="Song structure markers, fixture sections"
  >
    {#each ARRANGE_STRUCTURE_MARKERS as marker, index (index)}
      <div
        class="structure__marker"
        style:grid-column={markerSpan(marker)}
        data-structure-bar={ARRANGE_SECTIONS[index]?.startBar}
        title={`${marker.label} · bars ${ARRANGE_SECTIONS[index]?.startBar}–${ARRANGE_SECTIONS[index]?.endBar}`}
      >
        <EngravedLabel text={marker.label} size="xs" tone="normal" truncate />
      </div>
    {/each}
  </div>
</div>

<style>
  /* the panel head over the timeline: the list corner's material, one
     baseline (2 px, the Task 0.4 thickness) so the first row and the first
     lane still share a top edge */
  .timeline-head {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-bottom: 2px solid rgba(0, 0, 0, 0.62);
    background-color: var(--al-material-panel);
    background-image: repeating-linear-gradient(
      92deg,
      rgba(255, 255, 255, 0.012) 0 1px,
      rgba(0, 0, 0, 0.012) 1px 2px
    );
    box-shadow: inset 0 1px 0 var(--al-bevel-light);
    /* the scale print: metal-grey marks as the fader prints them — majors
       heavier, minors fine and faint (Fader.svelte .fader__ticks) */
    --ruler-major: color-mix(in srgb, var(--al-material-metal) 90%, transparent);
    --ruler-minor: color-mix(in srgb, var(--al-material-metal) 45%, transparent);
    --ruler-beat-width: calc(var(--arrange-bar-width) / var(--arrange-beats-per-bar));
  }

  /* --- 1 · ruler ------------------------------------------------------------- */

  .ruler {
    position: relative;
    height: var(--arrange-band-height);
    min-width: 0;
    /* the seam between the time bar and the tempo track (owner, Task 0.4):
       heavier and darker than the marks — here a cut groove, dark wall over lit wall */
    border-bottom: 1px solid var(--al-bevel-shadow);
    box-shadow: inset 0 -1px 0 var(--al-bevel-light);
    background-image:
      linear-gradient(90deg, var(--ruler-major) 0 1px, transparent 1px),
      linear-gradient(90deg, var(--ruler-major) 0 1px, transparent 1px),
      linear-gradient(90deg, var(--ruler-minor) 0 1px, transparent 1px);
    /* four-bar lines the band's full height, bar lines 9 px, beat ticks 4 px — all from the bottom */
    background-size:
      calc(var(--arrange-bar-width) * 4) 100%,
      var(--arrange-bar-width) 9px,
      var(--ruler-beat-width) 4px;
    background-position:
      0 0,
      0 100%,
      0 100%;
    background-repeat: repeat-x;
  }

  .ruler__numeral {
    position: absolute;
    top: 1px;
    left: calc(var(--bar) * var(--arrange-bar-width) + 4px);
    line-height: 1;
  }

  /* --- 2 · tempo track --------------------------------------------------------- */

  /* a track like the lanes: the same surface and bar grid, so the markers
     read against the same lines the clips sit on */
  .tempo {
    position: relative;
    height: var(--arrange-tempo-height);
    min-width: 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.5);
    background-color: var(--al-material-surface);
    background-image:
      linear-gradient(90deg, rgba(255, 255, 255, 0.075) 0 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px);
    background-size:
      calc(var(--arrange-bar-width) * 4) 100%,
      var(--arrange-bar-width) 100%;
    background-repeat: repeat-x;
  }

  /* the held-tempo step trace: the lower 16 px of the band, below the print */
  .tempo__trace {
    position: absolute;
    top: 1rem;
    left: 0;
    display: block;
    width: 100%;
    height: calc(100% - 1.25rem);
    overflow: visible;
  }

  .tempo__trace-path {
    fill: none;
    stroke: var(--al-material-cream);
    stroke-opacity: 0.72;
    stroke-width: 1.5;
    stroke-linejoin: miter;
  }

  .tempo__marker {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--bar) * var(--arrange-bar-width));
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    pointer-events: auto;
  }

  /* the flag line: the band's height, cream, the marker's exact bar */
  .tempo__flag {
    flex: 0 0 auto;
    width: 1px;
    height: 100%;
    background-color: var(--al-material-cream);
    opacity: 0.9;
  }

  .tempo__print {
    display: flex;
    gap: 0.375rem;
    align-items: baseline;
    padding-top: 2px;
    white-space: nowrap;
    line-height: 1;
  }

  /* --- 3 · structure markers ------------------------------------------------------ */

  .structure {
    display: grid;
    grid-template-columns: repeat(var(--arrange-bar-count), var(--arrange-bar-width));
    height: var(--arrange-band-height);
    min-width: 0;
  }

  .structure__marker {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 0.3125rem;
    /* the section's start mark: the ruler's major mark, the band's height */
    border-left: 1px solid var(--ruler-major);
  }
</style>
